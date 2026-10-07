-- Padrón PRM: esquema y funciones
-- Todo el acceso desde la app pasa por funciones SECURITY DEFINER que validan
-- el token de sesión. Las tablas tienen RLS activado sin políticas, por lo que
-- la clave pública (anon) no puede leerlas ni escribirlas directamente.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  usuario text not null unique,
  nombre text not null,
  telefono text,
  email text,
  password_hash text not null,
  rol text not null check (rol in ('admin', 'coordinador')),
  activo boolean not null default true,
  intentos_fallidos int not null default 0,
  bloqueado_hasta timestamptz,
  creado_en timestamptz not null default now()
);

create table if not exists public.sesiones (
  token text primary key,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  expira timestamptz not null
);
create index if not exists sesiones_usuario_idx on public.sesiones(usuario_id);

create table if not exists public.sectores (
  id serial primary key,
  provincia text not null,
  sector text not null,
  circunscripcion text not null,
  unique (provincia, sector)
);

create table if not exists public.votantes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  cedula text not null unique check (cedula ~ '^[0-9]{11}$'),
  telefono text,
  direccion text,
  provincia text not null,
  sector text not null,
  circunscripcion text not null,
  coordinador_id uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create index if not exists votantes_coord_idx on public.votantes(coordinador_id);
create index if not exists votantes_prov_idx on public.votantes(provincia, sector);

create table if not exists public.configuracion (
  id int primary key default 1 check (id = 1),
  nombre_org text not null default 'Comité de Base',
  lema text not null default 'Padrón de Simpatizantes',
  logo text
);
insert into public.configuracion (id) values (1) on conflict do nothing;

alter table public.usuarios enable row level security;
alter table public.sesiones enable row level security;
alter table public.sectores enable row level security;
alter table public.votantes enable row level security;
alter table public.configuracion enable row level security;
revoke all on public.usuarios, public.sesiones, public.sectores, public.votantes, public.configuracion from anon, authenticated;

-- ---------------------------------------------------------------- helpers

create or replace function public._auth(p_token text)
returns public.usuarios
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  select us.* into u from public.sesiones s join public.usuarios us on us.id = s.usuario_id
   where s.token = p_token and s.expira > now() and us.activo;
  if u.id is null then raise exception 'NO_AUTORIZADO'; end if;
  return u;
end $$;

create or replace function public._admin(p_token text)
returns public.usuarios
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public._auth(p_token);
  if u.rol <> 'admin' then raise exception 'SOLO_ADMIN'; end if;
  return u;
end $$;

create or replace function public._usuario_json(u public.usuarios)
returns json language sql immutable as $$
  select json_build_object('id', u.id, 'usuario', u.usuario, 'nombre', u.nombre,
    'telefono', u.telefono, 'email', u.email, 'rol', u.rol, 'activo', u.activo)
$$;

create or replace function public._circ_de(p_provincia text, p_sector text)
returns text language sql stable security definer set search_path = public as $$
  select circunscripcion from public.sectores where provincia = p_provincia and sector = p_sector
$$;

-- ---------------------------------------------------------------- sesión

create or replace function public.fn_login(p_usuario text, p_password text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios; t text;
begin
  -- Los errores se devuelven (no se lanzan) para que el contador de intentos
  -- fallidos no se revierta con la transacción.
  select * into u from public.usuarios where lower(usuario) = lower(trim(p_usuario));
  if u.id is null then return json_build_object('error', 'CREDENCIALES'); end if;
  if not u.activo then return json_build_object('error', 'INACTIVO'); end if;
  if u.bloqueado_hasta is not null and u.bloqueado_hasta > now() then return json_build_object('error', 'BLOQUEADO'); end if;
  if u.password_hash <> crypt(p_password, u.password_hash) then
    update public.usuarios set
      bloqueado_hasta = case when intentos_fallidos + 1 >= 5 then now() + interval '10 minutes' else null end,
      intentos_fallidos = case when intentos_fallidos + 1 >= 5 then 0 else intentos_fallidos + 1 end
     where id = u.id;
    return json_build_object('error', 'CREDENCIALES');
  end if;
  update public.usuarios set intentos_fallidos = 0, bloqueado_hasta = null where id = u.id;
  delete from public.sesiones where expira < now();
  t := encode(gen_random_bytes(32), 'hex');
  insert into public.sesiones (token, usuario_id, expira) values (t, u.id, now() + interval '7 days');
  return json_build_object('token', t, 'usuario', public._usuario_json(u));
end $$;

create or replace function public.fn_logout(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.sesiones where token = p_token
$$;

create or replace function public.fn_sesion(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  return public._usuario_json(public._auth(p_token));
end $$;

-- ---------------------------------------------------------------- público

create or replace function public.fn_config_publica()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('nombre_org', nombre_org, 'lema', lema, 'logo', logo)
    from public.configuracion where id = 1
$$;

create or replace function public.fn_sectores()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'provincia', provincia, 'sector', sector,
    'circunscripcion', circunscripcion) order by provincia, sector), '[]'::json) from public.sectores
$$;

-- Búsqueda pública por cédula: no expone teléfono ni dirección.
create or replace function public.fn_buscar_cedula(p_cedula text)
returns json language plpgsql stable security definer set search_path = public as $$
declare c text := regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'); r json;
begin
  if length(c) <> 11 then raise exception 'CEDULA_INVALIDA'; end if;
  select json_build_object('nombre', v.nombre, 'apellido', v.apellido, 'cedula', v.cedula,
      'provincia', v.provincia, 'sector', v.sector, 'circunscripcion', v.circunscripcion,
      'coordinador', u.nombre, 'registrado', v.creado_en)
    into r from public.votantes v join public.usuarios u on u.id = v.coordinador_id where v.cedula = c;
  return r;
end $$;

-- ---------------------------------------------------------------- votantes

create or replace function public.fn_votantes(p_token text, p_provincia text default null,
  p_sector text default null, p_circunscripcion text default null, p_coordinador uuid default null,
  p_q text default null)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare u public.usuarios; r json;
begin
  u := public._auth(p_token);
  select coalesce(json_agg(json_build_object('id', v.id, 'nombre', v.nombre, 'apellido', v.apellido,
      'cedula', v.cedula, 'telefono', v.telefono, 'direccion', v.direccion, 'provincia', v.provincia,
      'sector', v.sector, 'circunscripcion', v.circunscripcion, 'coordinador_id', v.coordinador_id,
      'coordinador', c.nombre, 'creado_en', v.creado_en) order by v.apellido, v.nombre), '[]'::json)
    into r
    from public.votantes v join public.usuarios c on c.id = v.coordinador_id
   where (u.rol = 'admin' or v.coordinador_id = u.id)
     and (nullif(p_provincia, '') is null or v.provincia = p_provincia)
     and (nullif(p_sector, '') is null or v.sector = p_sector)
     and (nullif(p_circunscripcion, '') is null or v.circunscripcion = p_circunscripcion)
     and (p_coordinador is null or u.rol <> 'admin' or v.coordinador_id = p_coordinador)
     and (nullif(p_q, '') is null or (v.nombre || ' ' || v.apellido || ' ' || v.cedula) ilike '%' || p_q || '%');
  return r;
end $$;

create or replace function public.fn_votante_guardar(p_token text, p_id uuid, p_datos json)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare
  u public.usuarios; v public.votantes;
  ced text := regexp_replace(coalesce(p_datos->>'cedula', ''), '[^0-9]', '', 'g');
  circ text; otro record;
begin
  u := public._auth(p_token);
  if length(ced) <> 11 then raise exception 'CEDULA_INVALIDA'; end if;
  if coalesce(trim(p_datos->>'nombre'), '') = '' or coalesce(trim(p_datos->>'apellido'), '') = '' then
    raise exception 'DATOS_INCOMPLETOS'; end if;
  circ := public._circ_de(p_datos->>'provincia', p_datos->>'sector');
  if circ is null then raise exception 'SECTOR_INVALIDO'; end if;

  select v2.id, c.nombre as coord into otro from public.votantes v2 join public.usuarios c on c.id = v2.coordinador_id
   where v2.cedula = ced and (p_id is null or v2.id <> p_id);
  if otro.id is not null then raise exception 'CEDULA_DUPLICADA:%', otro.coord; end if;

  if p_id is null then
    insert into public.votantes (nombre, apellido, cedula, telefono, direccion, provincia, sector, circunscripcion, coordinador_id)
    values (trim(p_datos->>'nombre'), trim(p_datos->>'apellido'), ced, nullif(trim(p_datos->>'telefono'), ''),
            nullif(trim(p_datos->>'direccion'), ''), p_datos->>'provincia', p_datos->>'sector', circ, u.id)
    returning * into v;
  else
    update public.votantes set nombre = trim(p_datos->>'nombre'), apellido = trim(p_datos->>'apellido'), cedula = ced,
      telefono = nullif(trim(p_datos->>'telefono'), ''), direccion = nullif(trim(p_datos->>'direccion'), ''),
      provincia = p_datos->>'provincia', sector = p_datos->>'sector', circunscripcion = circ
     where id = p_id and (u.rol = 'admin' or coordinador_id = u.id)
    returning * into v;
    if v.id is null then raise exception 'NO_ENCONTRADO'; end if;
  end if;
  return row_to_json(v);
exception when unique_violation then
  raise exception 'CEDULA_DUPLICADA:';
end $$;

create or replace function public.fn_votante_eliminar(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public._auth(p_token);
  delete from public.votantes where id = p_id and (u.rol = 'admin' or coordinador_id = u.id);
  if not found then raise exception 'NO_ENCONTRADO'; end if;
end $$;

create or replace function public.fn_resumen(p_token text)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public._auth(p_token);
  return json_build_object(
    'total', (select count(*) from public.votantes where u.rol = 'admin' or coordinador_id = u.id),
    'hoy', (select count(*) from public.votantes where (u.rol = 'admin' or coordinador_id = u.id)
              and creado_en >= date_trunc('day', now() at time zone 'America/Santo_Domingo') at time zone 'America/Santo_Domingo'),
    'coordinadores', (select count(*) from public.usuarios where rol = 'coordinador'),
    'por_provincia', (select coalesce(json_agg(x order by x.total desc), '[]'::json) from (
        select provincia, count(*) total from public.votantes where u.rol = 'admin' or coordinador_id = u.id
        group by provincia order by count(*) desc limit 6) x),
    'por_coordinador', (select coalesce(json_agg(x order by x.total desc), '[]'::json) from (
        select c.nombre, count(v.id) total from public.usuarios c left join public.votantes v on v.coordinador_id = c.id
        where u.rol = 'admin' and c.rol = 'coordinador' group by c.id, c.nombre order by count(v.id) desc limit 6) x)
  );
end $$;

-- ---------------------------------------------------------------- perfil

create or replace function public.fn_perfil_guardar(p_token text, p_nombre text, p_usuario text, p_telefono text, p_email text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public._auth(p_token);
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_usuario), '') = '' then raise exception 'DATOS_INCOMPLETOS'; end if;
  if exists (select 1 from public.usuarios where lower(usuario) = lower(trim(p_usuario)) and id <> u.id) then
    raise exception 'USUARIO_DUPLICADO'; end if;
  update public.usuarios set nombre = trim(p_nombre), usuario = lower(trim(p_usuario)),
    telefono = nullif(trim(p_telefono), ''), email = nullif(trim(p_email), '')
   where id = u.id returning * into u;
  return public._usuario_json(u);
end $$;

create or replace function public.fn_cambiar_password(p_token text, p_actual text, p_nueva text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u public.usuarios;
begin
  u := public._auth(p_token);
  if u.password_hash <> crypt(p_actual, u.password_hash) then raise exception 'PASSWORD_ACTUAL'; end if;
  if length(coalesce(p_nueva, '')) < 6 then raise exception 'PASSWORD_CORTA'; end if;
  update public.usuarios set password_hash = crypt(p_nueva, gen_salt('bf')) where id = u.id;
  delete from public.sesiones where usuario_id = u.id and token <> p_token;
end $$;

-- ---------------------------------------------------------------- admin: coordinadores

create or replace function public.fn_coordinadores(p_token text)
returns json language plpgsql stable security definer set search_path = public, extensions as $$
begin
  perform public._admin(p_token);
  return (select coalesce(json_agg(json_build_object('id', c.id, 'usuario', c.usuario, 'nombre', c.nombre,
      'telefono', c.telefono, 'email', c.email, 'activo', c.activo, 'creado_en', c.creado_en,
      'votantes', (select count(*) from public.votantes v where v.coordinador_id = c.id)) order by c.nombre), '[]'::json)
    from public.usuarios c where c.rol = 'coordinador');
end $$;

create or replace function public.fn_coordinador_guardar(p_token text, p_id uuid, p_nombre text, p_usuario text,
  p_telefono text, p_email text, p_activo boolean, p_password text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare c public.usuarios;
begin
  perform public._admin(p_token);
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_usuario), '') = '' then raise exception 'DATOS_INCOMPLETOS'; end if;
  if exists (select 1 from public.usuarios where lower(usuario) = lower(trim(p_usuario)) and (p_id is null or id <> p_id)) then
    raise exception 'USUARIO_DUPLICADO'; end if;
  if p_id is null then
    if length(coalesce(p_password, '')) < 6 then raise exception 'PASSWORD_CORTA'; end if;
    insert into public.usuarios (usuario, nombre, telefono, email, password_hash, rol, activo)
    values (lower(trim(p_usuario)), trim(p_nombre), nullif(trim(p_telefono), ''), nullif(trim(p_email), ''),
            crypt(p_password, gen_salt('bf')), 'coordinador', coalesce(p_activo, true))
    returning * into c;
  else
    update public.usuarios set usuario = lower(trim(p_usuario)), nombre = trim(p_nombre),
      telefono = nullif(trim(p_telefono), ''), email = nullif(trim(p_email), ''), activo = coalesce(p_activo, true)
     where id = p_id and rol = 'coordinador' returning * into c;
    if c.id is null then raise exception 'NO_ENCONTRADO'; end if;
    if not c.activo then delete from public.sesiones where usuario_id = c.id; end if;
  end if;
  return public._usuario_json(c);
end $$;

create or replace function public.fn_coordinador_password(p_token text, p_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._admin(p_token);
  if length(coalesce(p_password, '')) < 6 then raise exception 'PASSWORD_CORTA'; end if;
  update public.usuarios set password_hash = crypt(p_password, gen_salt('bf')), intentos_fallidos = 0, bloqueado_hasta = null
   where id = p_id and rol = 'coordinador';
  if not found then raise exception 'NO_ENCONTRADO'; end if;
  delete from public.sesiones where usuario_id = p_id;
end $$;

-- Al eliminar un coordinador sus votantes pasan al administrador que lo elimina,
-- para no perder registros ni liberar cédulas.
create or replace function public.fn_coordinador_eliminar(p_token text, p_id uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare a public.usuarios; n int;
begin
  a := public._admin(p_token);
  if not exists (select 1 from public.usuarios where id = p_id and rol = 'coordinador') then raise exception 'NO_ENCONTRADO'; end if;
  update public.votantes set coordinador_id = a.id where coordinador_id = p_id;
  get diagnostics n = row_count;
  delete from public.usuarios where id = p_id;
  return n;
end $$;

-- ---------------------------------------------------------------- admin: configuración y sectores

create or replace function public.fn_config_guardar(p_token text, p_nombre_org text, p_lema text, p_logo text)
returns json language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._admin(p_token);
  if coalesce(trim(p_nombre_org), '') = '' then raise exception 'DATOS_INCOMPLETOS'; end if;
  if p_logo is not null and length(p_logo) > 1500000 then raise exception 'LOGO_GRANDE'; end if;
  update public.configuracion set nombre_org = trim(p_nombre_org), lema = coalesce(trim(p_lema), ''),
    logo = nullif(p_logo, '') where id = 1;
  return public.fn_config_publica();
end $$;

create or replace function public.fn_sector_guardar(p_token text, p_id int, p_provincia text, p_sector text, p_circunscripcion text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare viejo public.sectores;
begin
  perform public._admin(p_token);
  if coalesce(trim(p_provincia), '') = '' or coalesce(trim(p_sector), '') = '' or coalesce(trim(p_circunscripcion), '') = '' then
    raise exception 'DATOS_INCOMPLETOS'; end if;
  if p_id is null then
    insert into public.sectores (provincia, sector, circunscripcion) values (trim(p_provincia), trim(p_sector), trim(p_circunscripcion));
  else
    select * into viejo from public.sectores where id = p_id;
    update public.sectores set provincia = trim(p_provincia), sector = trim(p_sector), circunscripcion = trim(p_circunscripcion)
     where id = p_id;
    -- Mantener coherentes los votantes ya registrados en ese sector
    update public.votantes set provincia = trim(p_provincia), sector = trim(p_sector), circunscripcion = trim(p_circunscripcion)
     where provincia = viejo.provincia and sector = viejo.sector;
  end if;
exception when unique_violation then raise exception 'SECTOR_DUPLICADO';
end $$;

create or replace function public.fn_sector_eliminar(p_token text, p_id int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare s public.sectores;
begin
  perform public._admin(p_token);
  select * into s from public.sectores where id = p_id;
  if exists (select 1 from public.votantes where provincia = s.provincia and sector = s.sector) then
    raise exception 'SECTOR_EN_USO'; end if;
  delete from public.sectores where id = p_id;
end $$;

-- Solo las funciones fn_* son invocables con la clave pública.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.fn_login(text, text), public.fn_logout(text), public.fn_sesion(text),
  public.fn_config_publica(), public.fn_sectores(), public.fn_buscar_cedula(text),
  public.fn_votantes(text, text, text, text, uuid, text), public.fn_votante_guardar(text, uuid, json),
  public.fn_votante_eliminar(text, uuid), public.fn_resumen(text),
  public.fn_perfil_guardar(text, text, text, text, text), public.fn_cambiar_password(text, text, text),
  public.fn_coordinadores(text), public.fn_coordinador_guardar(text, uuid, text, text, text, text, boolean, text),
  public.fn_coordinador_password(text, uuid, text), public.fn_coordinador_eliminar(text, uuid),
  public.fn_config_guardar(text, text, text, text), public.fn_sector_guardar(text, int, text, text, text),
  public.fn_sector_eliminar(text, int)
to anon, authenticated;
