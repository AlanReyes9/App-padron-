-- =====================================================================
-- Padrón · Instalación completa en PostgreSQL (servidor propio)
--
-- Uso (desde la carpeta del proyecto):
--   createdb padron
--   psql -d padron -v admin_clave='TuClaveSegura' -f database/instalar.sql
--
-- Crea tablas, funciones, el catálogo de 700 sectores y el usuario
-- administrador "admin" con la contraseña indicada en admin_clave.
-- Se puede volver a ejecutar sin perder datos.
-- =====================================================================

\set ON_ERROR_STOP on

-- Requisitos: esquema para extensiones y roles que usa Supabase.
-- En un PostgreSQL normal se crean vacíos (no tienen acceso a nada).
create schema if not exists extensions;
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
exception when insufficient_privilege then
  raise exception 'Faltan los roles anon y authenticated. Créalos como superusuario: CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;';
end $$;

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

-- Búsqueda pública por cédula: solo nombre, cédula y coordinador.
create or replace function public.fn_buscar_cedula(p_cedula text)
returns json language plpgsql stable security definer set search_path = public as $$
declare c text := regexp_replace(coalesce(p_cedula, ''), '[^0-9]', '', 'g'); r json;
begin
  if length(c) <> 11 then raise exception 'CEDULA_INVALIDA'; end if;
  select json_build_object('nombre', v.nombre, 'apellido', v.apellido, 'cedula', v.cedula, 'coordinador', u.nombre)
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

-- Catálogo de sectores (generado con data/build_sectores.py)
insert into public.sectores (provincia, sector, circunscripcion) values
('Azua','Azua','Única'),
('Azua','Estebanía','Única'),
('Azua','Guayabal','Única'),
('Azua','Las Charcas','Única'),
('Azua','Las Yayas de Viajama','Única'),
('Azua','Padre Las Casas','Única'),
('Azua','Peralta','Única'),
('Azua','Pueblo Viejo','Única'),
('Azua','Sabana Yegua','Única'),
('Azua','Tábara Arriba','Única'),
('Bahoruco','Galván','Única'),
('Bahoruco','Los Ríos','Única'),
('Bahoruco','Neiba','Única'),
('Bahoruco','Tamayo','Única'),
('Bahoruco','Villa Jaragua','Única'),
('Barahona','Barahona','Única'),
('Barahona','Cabral','Única'),
('Barahona','El Peñón','Única'),
('Barahona','Enriquillo','Única'),
('Barahona','Fundación','Única'),
('Barahona','Jaquimeyes','Única'),
('Barahona','La Ciénaga','Única'),
('Barahona','Las Salinas','Única'),
('Barahona','Paraíso','Única'),
('Barahona','Polo','Única'),
('Barahona','Vicente Noble','Única'),
('Dajabón','Dajabón','Única'),
('Dajabón','El Pino','Única'),
('Dajabón','Loma de Cabrera','Única'),
('Dajabón','Partido','Única'),
('Dajabón','Restauración','Única'),
('Distrito Nacional','24 de Abril','Circunscripción 3'),
('Distrito Nacional','30 de Mayo','Circunscripción 1'),
('Distrito Nacional','Altos de Arroyo Hondo','Circunscripción 2'),
('Distrito Nacional','Arroyo Hondo','Circunscripción 2'),
('Distrito Nacional','Arroyo Manzano','Circunscripción 2'),
('Distrito Nacional','Atala','Circunscripción 1'),
('Distrito Nacional','Bella Vista','Circunscripción 1'),
('Distrito Nacional','Buenos Aires (Mirador)','Circunscripción 1'),
('Distrito Nacional','Centro Olímpico','Circunscripción 1'),
('Distrito Nacional','Centro de los Héroes','Circunscripción 1'),
('Distrito Nacional','Cerros de Arroyo Hondo','Circunscripción 2'),
('Distrito Nacional','Ciudad Colonial','Circunscripción 1'),
('Distrito Nacional','Ciudad Nueva','Circunscripción 1'),
('Distrito Nacional','Ciudad Universitaria','Circunscripción 1'),
('Distrito Nacional','Cristo Rey','Circunscripción 2'),
('Distrito Nacional','Domingo Savio','Circunscripción 3'),
('Distrito Nacional','El Cacique','Circunscripción 1'),
('Distrito Nacional','El Millón','Circunscripción 1'),
('Distrito Nacional','Ensanche Capotillo','Circunscripción 3'),
('Distrito Nacional','Ensanche Espaillat','Circunscripción 3'),
('Distrito Nacional','Ensanche La Fe','Circunscripción 2'),
('Distrito Nacional','Ensanche Luperón','Circunscripción 3'),
('Distrito Nacional','Ensanche Naco','Circunscripción 1'),
('Distrito Nacional','Ensanche Quisqueya','Circunscripción 1'),
('Distrito Nacional','Evaristo Morales','Circunscripción 1'),
('Distrito Nacional','Gazcue','Circunscripción 1'),
('Distrito Nacional','General Antonio Duvergé','Circunscripción 1'),
('Distrito Nacional','Gualey','Circunscripción 3'),
('Distrito Nacional','Honduras del Norte','Circunscripción 1'),
('Distrito Nacional','Honduras del Oeste','Circunscripción 1'),
('Distrito Nacional','Jardines del Sur','Circunscripción 1'),
('Distrito Nacional','Jardín Botánico','Circunscripción 1'),
('Distrito Nacional','Jardín Zoológico','Circunscripción 2'),
('Distrito Nacional','Julieta Morales','Circunscripción 1'),
('Distrito Nacional','La Agustina','Circunscripción 2'),
('Distrito Nacional','La Castellana','Circunscripción 1'),
('Distrito Nacional','La Ciénaga','Circunscripción 3'),
('Distrito Nacional','La Esperilla','Circunscripción 1'),
('Distrito Nacional','La Hondonada','Circunscripción 2'),
('Distrito Nacional','La Isabela','Circunscripción 2'),
('Distrito Nacional','La Julia','Circunscripción 1'),
('Distrito Nacional','La Zurza','Circunscripción 3'),
('Distrito Nacional','Las Praderas','Circunscripción 2'),
('Distrito Nacional','Los Cacicazgos','Circunscripción 1'),
('Distrito Nacional','Los Guandules','Circunscripción 3'),
('Distrito Nacional','Los Jardines','Circunscripción 1'),
('Distrito Nacional','Los Peralejos','Circunscripción 2'),
('Distrito Nacional','Los Praditos','Circunscripción 1'),
('Distrito Nacional','Los Prados','Circunscripción 1'),
('Distrito Nacional','Los Próceres','Circunscripción 2'),
('Distrito Nacional','Los Restauradores','Circunscripción 1'),
('Distrito Nacional','Los Ríos','Circunscripción 2'),
('Distrito Nacional','María Auxiliadora','Circunscripción 3'),
('Distrito Nacional','Mata Hambre','Circunscripción 1'),
('Distrito Nacional','Mejoramiento Social','Circunscripción 3'),
('Distrito Nacional','Mirador Norte','Circunscripción 1'),
('Distrito Nacional','Mirador Sur','Circunscripción 1'),
('Distrito Nacional','Miraflores','Circunscripción 1'),
('Distrito Nacional','Miramar','Circunscripción 1'),
('Distrito Nacional','Nuestra Señora de la Paz','Circunscripción 1'),
('Distrito Nacional','Nuevo Arroyo Hondo','Circunscripción 2'),
('Distrito Nacional','Palma Real','Circunscripción 2'),
('Distrito Nacional','Paraíso','Circunscripción 1'),
('Distrito Nacional','Paseo de los Indios','Circunscripción 1'),
('Distrito Nacional','Piantini','Circunscripción 1'),
('Distrito Nacional','Renacimiento','Circunscripción 1'),
('Distrito Nacional','San Carlos','Circunscripción 1'),
('Distrito Nacional','San Diego','Circunscripción 1'),
('Distrito Nacional','San Gerónimo','Circunscripción 1'),
('Distrito Nacional','San Juan Bosco','Circunscripción 1'),
('Distrito Nacional','Serrallés','Circunscripción 1'),
('Distrito Nacional','Simón Bolívar','Circunscripción 3'),
('Distrito Nacional','Tropical Metaldom','Circunscripción 1'),
('Distrito Nacional','Viejo Arroyo Hondo','Circunscripción 2'),
('Distrito Nacional','Villa Consuelo','Circunscripción 3'),
('Distrito Nacional','Villa Francisca','Circunscripción 3'),
('Distrito Nacional','Villa Juana','Circunscripción 3'),
('Distrito Nacional','Villas Agrícolas','Circunscripción 3'),
('Duarte','Arenoso','Única'),
('Duarte','Castillo','Única'),
('Duarte','Hostos','Única'),
('Duarte','Las Guáranas','Única'),
('Duarte','Pimentel','Única'),
('Duarte','San Francisco de Macorís','Única'),
('Duarte','Villa Riva','Única'),
('El Seibo','El Seibo','Única'),
('El Seibo','Miches','Única'),
('Elías Piña','Bánica','Única'),
('Elías Piña','Comendador','Única'),
('Elías Piña','El Llano','Única'),
('Elías Piña','Hondo Valle','Única'),
('Elías Piña','Juan Santiago','Única'),
('Elías Piña','Pedro Santana','Única'),
('Espaillat','Cayetano Germosén','Única'),
('Espaillat','Gaspar Hernández','Única'),
('Espaillat','Jamao Al Norte','Única'),
('Espaillat','Moca','Única'),
('Espaillat','San Víctor','Única'),
('Hato Mayor','El Valle','Única'),
('Hato Mayor','Hato Mayor','Única'),
('Hato Mayor','Sabana de la Mar','Única'),
('Hermanas Mirabal','Salcedo','Única'),
('Hermanas Mirabal','Tenares','Única'),
('Hermanas Mirabal','Villa Tapia','Única'),
('Independencia','Cristóbal','Única'),
('Independencia','Duvergé','Única'),
('Independencia','Jimaní','Única'),
('Independencia','La Descubierta','Única'),
('Independencia','Mella','Única'),
('Independencia','Postrer Río','Única'),
('La Altagracia','Higüey','Única'),
('La Altagracia','San Rafael del Yuma','Única'),
('La Romana','Guaymate','Única'),
('La Romana','La Romana','Única'),
('La Romana','Villa Hermosa','Única'),
('La Vega','Buena Vista','Circunscripción 2'),
('La Vega','Constanza','Circunscripción 2'),
('La Vega','El Ranchito','Circunscripción 1'),
('La Vega','Jarabacoa','Circunscripción 2'),
('La Vega','Jima Abajo','Circunscripción 1'),
('La Vega','La Sabina','Circunscripción 2'),
('La Vega','La Vega','Circunscripción 1'),
('La Vega','Manabao','Circunscripción 2'),
('La Vega','Rincón','Circunscripción 1'),
('La Vega','Río Verde Arriba','Circunscripción 1'),
('La Vega','Tireo','Circunscripción 2'),
('María Trinidad Sánchez','Cabrera','Única'),
('María Trinidad Sánchez','El Factor','Única'),
('María Trinidad Sánchez','Nagua','Única'),
('María Trinidad Sánchez','Río San Juan','Única'),
('Monseñor Nouel','Bonao','Única'),
('Monseñor Nouel','Maimón','Única'),
('Monseñor Nouel','Piedra Blanca','Única'),
('Monte Cristi','Castañuelas','Única'),
('Monte Cristi','Guayubín','Única'),
('Monte Cristi','Las Matas de Santa Cruz','Única'),
('Monte Cristi','Monte Cristi','Única'),
('Monte Cristi','Pepillo Salcedo','Única'),
('Monte Cristi','Villa Vásquez','Única'),
('Monte Plata','Bayaguana','Única'),
('Monte Plata','Monte Plata','Única'),
('Monte Plata','Peralvillo','Única'),
('Monte Plata','Sabana Grande de Boyá','Única'),
('Monte Plata','Yamasá','Única'),
('Pedernales','Oviedo','Única'),
('Pedernales','Pedernales','Única'),
('Peravia','Baní','Única'),
('Peravia','Matanzas','Única'),
('Peravia','Nizao','Única'),
('Puerto Plata','Altamira','Circunscripción 2'),
('Puerto Plata','Belloso','Circunscripción 2'),
('Puerto Plata','Cabarete','Circunscripción 1'),
('Puerto Plata','Estero Hondo','Circunscripción 2'),
('Puerto Plata','Estrecho','Circunscripción 2'),
('Puerto Plata','Guananico','Circunscripción 2'),
('Puerto Plata','Imbert','Circunscripción 2'),
('Puerto Plata','La Isabela','Circunscripción 2'),
('Puerto Plata','La Jaiba','Circunscripción 2'),
('Puerto Plata','Los Hidalgos','Circunscripción 2'),
('Puerto Plata','Luperón','Circunscripción 2'),
('Puerto Plata','Maimón','Circunscripción 1'),
('Puerto Plata','Navas','Circunscripción 2'),
('Puerto Plata','Puerto Plata','Circunscripción 1'),
('Puerto Plata','Río Grande','Circunscripción 2'),
('Puerto Plata','Sabaneta de Yásica','Circunscripción 1'),
('Puerto Plata','Sosúa','Circunscripción 1'),
('Puerto Plata','Villa Isabela','Circunscripción 2'),
('Puerto Plata','Villa Montellano','Circunscripción 1'),
('Puerto Plata','Yásica Arriba','Circunscripción 1'),
('Samaná','Las Terrenas','Única'),
('Samaná','Samaná','Única'),
('Samaná','Sánchez','Única'),
('San Cristóbal','Cambita Garabitos','Circunscripción 2'),
('San Cristóbal','Doña Ana','Circunscripción 2'),
('San Cristóbal','El Carril','Circunscripción 3'),
('San Cristóbal','El Pueblecito','Circunscripción 2'),
('San Cristóbal','Haina','Circunscripción 3'),
('San Cristóbal','Hato Damas','Circunscripción 1'),
('San Cristóbal','La Cuchilla','Circunscripción 2'),
('San Cristóbal','Los Cacaos','Circunscripción 2'),
('San Cristóbal','Medina','Circunscripción 2'),
('San Cristóbal','Nigua','Circunscripción 3'),
('San Cristóbal','Sabana Grande de Palenque','Circunscripción 2'),
('San Cristóbal','San Cristóbal','Circunscripción 1'),
('San Cristóbal','San José del Puerto','Circunscripción 2'),
('San Cristóbal','Villa Altagracia','Circunscripción 2'),
('San Cristóbal','Yaguate','Circunscripción 2'),
('San José de Ocoa','Rancho Arriba','Única'),
('San José de Ocoa','Sabana Larga','Única'),
('San José de Ocoa','San José de Ocoa','Única'),
('San Juan','Bohechío','Única'),
('San Juan','El Cercado','Única'),
('San Juan','Juan de Herrera','Única'),
('San Juan','Las Matas de Farfán','Única'),
('San Juan','San Juan','Única'),
('San Juan','Vallejuelo','Única'),
('San Pedro de Macorís','Consuelo','Única'),
('San Pedro de Macorís','Guayacanes','Única'),
('San Pedro de Macorís','Los Llanos','Única'),
('San Pedro de Macorís','Quisqueya','Única'),
('San Pedro de Macorís','Ramón Santana','Única'),
('San Pedro de Macorís','San Pedro de Macorís','Única'),
('Santiago','Arroyo Hondo (Santiago)','Circunscripción 3'),
('Santiago','Baitoa','Circunscripción 2'),
('Santiago','Baracoa','Circunscripción 1'),
('Santiago','Bella Vista','Circunscripción 1'),
('Santiago','Camboya','Circunscripción 2'),
('Santiago','Canabacoa','Circunscripción 3'),
('Santiago','Canca La Piedra','Circunscripción 3'),
('Santiago','Centro de la Ciudad','Circunscripción 1'),
('Santiago','Cerros de Gurabo','Circunscripción 1'),
('Santiago','Cienfuegos','Circunscripción 1'),
('Santiago','El Caimito','Circunscripción 2'),
('Santiago','El Ensueño','Circunscripción 1'),
('Santiago','El Limón','Circunscripción 1'),
('Santiago','El Rubio','Circunscripción 2'),
('Santiago','Ensanche Bermúdez','Circunscripción 2'),
('Santiago','Ensanche Espaillat (Santiago)','Circunscripción 3'),
('Santiago','Ensanche Libertad','Circunscripción 1'),
('Santiago','Guayabal','Circunscripción 3'),
('Santiago','Gurabo','Circunscripción 3'),
('Santiago','Hato Mayor (Santiago)','Circunscripción 2'),
('Santiago','Hato del Yaque','Circunscripción 2'),
('Santiago','Hoya del Caimito','Circunscripción 3'),
('Santiago','Juncalito','Circunscripción 2'),
('Santiago','Jánico','Circunscripción 2'),
('Santiago','La Canela','Circunscripción 2'),
('Santiago','La Cuesta','Circunscripción 2'),
('Santiago','La Herradura','Circunscripción 2'),
('Santiago','La Joya','Circunscripción 1'),
('Santiago','La Otra Banda','Circunscripción 3'),
('Santiago','La Unión','Circunscripción 1'),
('Santiago','Las Charcas (Santiago)','Circunscripción 2'),
('Santiago','Las Palomas','Circunscripción 3'),
('Santiago','Las Placetas','Circunscripción 2'),
('Santiago','Licey (zona sur)','Circunscripción 3'),
('Santiago','Licey al Medio','Circunscripción 3'),
('Santiago','Los Cerros','Circunscripción 3'),
('Santiago','Los Jardines Metropolitanos','Circunscripción 1'),
('Santiago','Los Jazmines','Circunscripción 1'),
('Santiago','Los Pepines','Circunscripción 1'),
('Santiago','Los Reyes','Circunscripción 3'),
('Santiago','Los Salados','Circunscripción 1'),
('Santiago','Mejoramiento Social','Circunscripción 1'),
('Santiago','Monte Rico','Circunscripción 1'),
('Santiago','Nibaje','Circunscripción 1'),
('Santiago','Palmar Arriba','Circunscripción 1'),
('Santiago','Pedro García','Circunscripción 3'),
('Santiago','Pekín','Circunscripción 3'),
('Santiago','Pueblo Nuevo','Circunscripción 1'),
('Santiago','Puñal','Circunscripción 3'),
('Santiago','Rafey','Circunscripción 2'),
('Santiago','Sabana Iglesia','Circunscripción 2'),
('Santiago','San Francisco de Jacagua','Circunscripción 1'),
('Santiago','San José de las Matas','Circunscripción 2'),
('Santiago','Santiago Oeste','Circunscripción 2'),
('Santiago','Tamboril','Circunscripción 3'),
('Santiago','Villa Bisonó','Circunscripción 1'),
('Santiago','Villa González','Circunscripción 1'),
('Santiago','Villa Olga','Circunscripción 1'),
('Santiago','Villa Olímpica','Circunscripción 3'),
('Santiago','Villa Progreso','Circunscripción 2'),
('Santiago Rodríguez','Monción','Única'),
('Santiago Rodríguez','Sabaneta','Única'),
('Santiago Rodríguez','Villa Los Almácigos','Única'),
('Santo Domingo','Agua Loca','Circunscripción 3'),
('Santo Domingo','Alma Rosa','Circunscripción 1'),
('Santo Domingo','Alma Rosa II','Circunscripción 1'),
('Santo Domingo','Altos De Cancino','Circunscripción 2'),
('Santo Domingo','Altos del Poli','Circunscripción 3'),
('Santo Domingo','Ana Virginia','Circunscripción 3'),
('Santo Domingo','Andrés','Circunscripción 3'),
('Santo Domingo','Arcoiris','Circunscripción 1'),
('Santo Domingo','Arpe I','Circunscripción 1'),
('Santo Domingo','Arpe II','Circunscripción 1'),
('Santo Domingo','Barrio Landia','Circunscripción 5'),
('Santo Domingo','Batey Montserrat','Circunscripción 3'),
('Santo Domingo','Bayona','Circunscripción 4'),
('Santo Domingo','Bello Campo','Circunscripción 1'),
('Santo Domingo','Bo. Ambar','Circunscripción 2'),
('Santo Domingo','Bo. Anacaona','Circunscripción 1'),
('Santo Domingo','Bo. Brisas Del Edén','Circunscripción 3'),
('Santo Domingo','Bo. Brisas del Este','Circunscripción 3'),
('Santo Domingo','Bo. Buenaventura','Circunscripción 3'),
('Santo Domingo','Bo. Canaán','Circunscripción 3'),
('Santo Domingo','Bo. Cancela','Circunscripción 3'),
('Santo Domingo','Bo. Canta La Rana','Circunscripción 2'),
('Santo Domingo','Bo. El Cachon de la Rubia','Circunscripción 2'),
('Santo Domingo','Bo. El Dique','Circunscripción 1'),
('Santo Domingo','Bo. El Mango','Circunscripción 3'),
('Santo Domingo','Bo. El Paredon','Circunscripción 3'),
('Santo Domingo','Bo. Francisco del Rosario Sánchez','Circunscripción 3'),
('Santo Domingo','Bo. John F. Kennedy','Circunscripción 3'),
('Santo Domingo','Bo. La Campana','Circunscripción 1'),
('Santo Domingo','Bo. La Caña','Circunscripción 3'),
('Santo Domingo','Bo. La Isabelita','Circunscripción 1'),
('Santo Domingo','Bo. La Policia','Circunscripción 3'),
('Santo Domingo','Bo. La Tablita','Circunscripción 1'),
('Santo Domingo','Bo. La Toronja','Circunscripción 3'),
('Santo Domingo','Bo. La Ureña','Circunscripción 3'),
('Santo Domingo','Bo. Las Enfermeras','Circunscripción 3'),
('Santo Domingo','Bo. Las Flores','Circunscripción 3'),
('Santo Domingo','Bo. Las Lilas','Circunscripción 2'),
('Santo Domingo','Bo. Los Coquitos','Circunscripción 1'),
('Santo Domingo','Bo. Los Restauradores','Circunscripción 3'),
('Santo Domingo','Bo. Los Solares','Circunscripción 3'),
('Santo Domingo','Bo. Margara','Circunscripción 3'),
('Santo Domingo','Bo. Nuevo','Circunscripción 3'),
('Santo Domingo','Bo. Nuevo Amanecer','Circunscripción 3'),
('Santo Domingo','Bo. Oxigeno','Circunscripción 1'),
('Santo Domingo','Bo. Paraiso Oriental','Circunscripción 1'),
('Santo Domingo','Bo. Rivera Del Ozama','Circunscripción 2'),
('Santo Domingo','Bo. San Bartolo','Circunscripción 3'),
('Santo Domingo','Bo. San Ramón','Circunscripción 3'),
('Santo Domingo','Bo. Valle Del Este','Circunscripción 1'),
('Santo Domingo','Bo. Villa Esfuerzo','Circunscripción 3'),
('Santo Domingo','Bo. Villa Liberación','Circunscripción 3'),
('Santo Domingo','Bo.Puerto Rico','Circunscripción 2'),
('Santo Domingo','Boca Chica','Circunscripción 3'),
('Santo Domingo','Brisa Oriental','Circunscripción 3'),
('Santo Domingo','Brisa Oriental I','Circunscripción 3'),
('Santo Domingo','Brisa Oriental II-V','Circunscripción 3'),
('Santo Domingo','Brisa Oriental VI-VII','Circunscripción 3'),
('Santo Domingo','Brisa Oriental VIII','Circunscripción 3'),
('Santo Domingo','Brisa de las Américas','Circunscripción 3'),
('Santo Domingo','Brisas Del Mar','Circunscripción 1'),
('Santo Domingo','Brisas del Este','Circunscripción 3'),
('Santo Domingo','Buenos Aires de Herrera','Circunscripción 4'),
('Santo Domingo','Calero','Circunscripción 1'),
('Santo Domingo','Cancino','Circunscripción 2'),
('Santo Domingo','Cancino Adentro','Circunscripción 3'),
('Santo Domingo','Cancino Afuera','Circunscripción 2'),
('Santo Domingo','Cancino I','Circunscripción 1'),
('Santo Domingo','Cancino II','Circunscripción 1'),
('Santo Domingo','Carolina','Circunscripción 1'),
('Santo Domingo','Cerromar','Circunscripción 2'),
('Santo Domingo','Ciudad Ecológica De Las Américas','Circunscripción 3'),
('Santo Domingo','Ciudad Kolosal','Circunscripción 3'),
('Santo Domingo','Ciudad Modelo','Circunscripción 6'),
('Santo Domingo','Ciudad Satélite','Circunscripción 3'),
('Santo Domingo','Ciudad Satélite III','Circunscripción 3'),
('Santo Domingo','Ciudad del Almirante','Circunscripción 3'),
('Santo Domingo','Ciudad del Este II','Circunscripción 3'),
('Santo Domingo','Ciudades de España','Circunscripción 1'),
('Santo Domingo','Colinas Del Este','Circunscripción 2'),
('Santo Domingo','Comunidades Catalanas','Circunscripción 1'),
('Santo Domingo','Conjunto Hab. Los Tres Ojos','Circunscripción 1'),
('Santo Domingo','Corales del Sur','Circunscripción 3'),
('Santo Domingo','Damer III','Circunscripción 2'),
('Santo Domingo','Damer IV-V','Circunscripción 2'),
('Santo Domingo','Delta Amarilis I','Circunscripción 1'),
('Santo Domingo','Delta Amarilis II','Circunscripción 1'),
('Santo Domingo','Dinna I','Circunscripción 1'),
('Santo Domingo','Duarte (Herrera)','Circunscripción 4'),
('Santo Domingo','El Alba','Circunscripción 1'),
('Santo Domingo','El Almendro','Circunscripción 1'),
('Santo Domingo','El Almirante','Circunscripción 3'),
('Santo Domingo','El Almirante Adentro','Circunscripción 3'),
('Santo Domingo','El Brisal','Circunscripción 1'),
('Santo Domingo','El Café de Herrera','Circunscripción 4'),
('Santo Domingo','El Invi','Circunscripción 2'),
('Santo Domingo','El Maimón','Circunscripción 3'),
('Santo Domingo','El Rosal','Circunscripción 1'),
('Santo Domingo','El Tamarindo','Circunscripción 3'),
('Santo Domingo','Engombe','Circunscripción 4'),
('Santo Domingo','Enriquillo (Herrera)','Circunscripción 4'),
('Santo Domingo','Ens. Alma Rosa','Circunscripción 1'),
('Santo Domingo','Ens. Isabelita','Circunscripción 1'),
('Santo Domingo','Ens. Los Tainos','Circunscripción 3'),
('Santo Domingo','Ensanche Felicidad','Circunscripción 2'),
('Santo Domingo','Ensanche Ozama','Circunscripción 1'),
('Santo Domingo','Eugenio Ma. De Hostos','Circunscripción 3'),
('Santo Domingo','Exclusividad del Italia','Circunscripción 1'),
('Santo Domingo','Francisco del Rosario Sanchez (Las Frutas)','Circunscripción 2'),
('Santo Domingo','Futuro Curazao','Circunscripción 1'),
('Santo Domingo','Guaricano','Circunscripción 6'),
('Santo Domingo','Guillermo Antonio V','Circunscripción 2'),
('Santo Domingo','Hainamosa','Circunscripción 3'),
('Santo Domingo','Hainamosa II','Circunscripción 3'),
('Santo Domingo','Hamarap','Circunscripción 1'),
('Santo Domingo','Hato Nuevo','Circunscripción 4'),
('Santo Domingo','Hato Viejo','Circunscripción 3'),
('Santo Domingo','Herradura','Circunscripción 1'),
('Santo Domingo','Herrera','Circunscripción 4'),
('Santo Domingo','Herva','Circunscripción 1'),
('Santo Domingo','Higüero','Circunscripción 6'),
('Santo Domingo','Invi-Dorex','Circunscripción 3'),
('Santo Domingo','Invi-Villa Progreso del Este','Circunscripción 3'),
('Santo Domingo','Invimosa','Circunscripción 3'),
('Santo Domingo','Invivienda','Circunscripción 3'),
('Santo Domingo','Isabel','Circunscripción 1'),
('Santo Domingo','Issafapol','Circunscripción 3'),
('Santo Domingo','Issfa-Hainamosa','Circunscripción 3'),
('Santo Domingo','Ivette','Circunscripción 1'),
('Santo Domingo','Jacagua (SDN)','Circunscripción 6'),
('Santo Domingo','Jardines De Alma Rosa','Circunscripción 1'),
('Santo Domingo','Jardines de la Charles','Circunscripción 3'),
('Santo Domingo','Jardines del Este','Circunscripción 3'),
('Santo Domingo','Katanga','Circunscripción 2'),
('Santo Domingo','La Barquita','Circunscripción 2'),
('Santo Domingo','La Caleta','Circunscripción 3'),
('Santo Domingo','La Corporanea','Circunscripción 3'),
('Santo Domingo','La Cuaba','Circunscripción 5'),
('Santo Domingo','La Esperanza','Circunscripción 1'),
('Santo Domingo','La Filipina','Circunscripción 3'),
('Santo Domingo','La Francia','Circunscripción 1'),
('Santo Domingo','La Grúa','Circunscripción 3'),
('Santo Domingo','La Guáyiga','Circunscripción 5'),
('Santo Domingo','La Isabelita','Circunscripción 1'),
('Santo Domingo','La Javilla','Circunscripción 3'),
('Santo Domingo','La Milagrosa','Circunscripción 2'),
('Santo Domingo','La Piña (Los Alcarrizos)','Circunscripción 5'),
('Santo Domingo','La Ureña','Circunscripción 3'),
('Santo Domingo','La Victoria','Circunscripción 6'),
('Santo Domingo','Las Acacias','Circunscripción 3'),
('Santo Domingo','Las Américas','Circunscripción 1'),
('Santo Domingo','Las Asturias','Circunscripción 3'),
('Santo Domingo','Las Caobas','Circunscripción 4'),
('Santo Domingo','Las Enfermeras','Circunscripción 2'),
('Santo Domingo','Las Estrellas','Circunscripción 1'),
('Santo Domingo','Las Palmas De Alma Rosa','Circunscripción 1'),
('Santo Domingo','Las Palmas de Herrera','Circunscripción 4'),
('Santo Domingo','Laura MarieI','Circunscripción 3'),
('Santo Domingo','Lechería','Circunscripción 5'),
('Santo Domingo','Libertador de Herrera','Circunscripción 4'),
('Santo Domingo','Los Alcarrizos','Circunscripción 5'),
('Santo Domingo','Los Alcarrizos Viejo (Herrera)','Circunscripción 4'),
('Santo Domingo','Los Americanos','Circunscripción 5'),
('Santo Domingo','Los Barrancones de Los Mina','Circunscripción 2'),
('Santo Domingo','Los Casabes','Circunscripción 6'),
('Santo Domingo','Los Educadores','Circunscripción 3'),
('Santo Domingo','Los Faralllones','Circunscripción 1'),
('Santo Domingo','Los Frailes','Circunscripción 3'),
('Santo Domingo','Los Frailes I','Circunscripción 3'),
('Santo Domingo','Los Frailes II','Circunscripción 3'),
('Santo Domingo','Los Guaricanos','Circunscripción 6'),
('Santo Domingo','Los Mameyes','Circunscripción 1'),
('Santo Domingo','Los Mina Norte','Circunscripción 2'),
('Santo Domingo','Los Mina Sur','Circunscripción 2'),
('Santo Domingo','Los Minas Viejo','Circunscripción 2'),
('Santo Domingo','Los Molinos','Circunscripción 1'),
('Santo Domingo','Los Pinos','Circunscripción 3'),
('Santo Domingo','Los Profesionales','Circunscripción 1'),
('Santo Domingo','Los Rosales','Circunscripción 3'),
('Santo Domingo','Los Tres Brazos','Circunscripción 2'),
('Santo Domingo','Los Tres Ojos','Circunscripción 1'),
('Santo Domingo','Los Trinitarios','Circunscripción 1'),
('Santo Domingo','Los Trinitarios II','Circunscripción 3'),
('Santo Domingo','Loteria','Circunscripción 1'),
('Santo Domingo','Lotificación del Este','Circunscripción 3'),
('Santo Domingo','Lucerna','Circunscripción 2'),
('Santo Domingo','Mandinga','Circunscripción 1'),
('Santo Domingo','Manoguayabo','Circunscripción 4'),
('Santo Domingo','Maquiteria','Circunscripción 1'),
('Santo Domingo','Marañón','Circunscripción 6'),
('Santo Domingo','Marlin IV','Circunscripción 1'),
('Santo Domingo','Mendoza','Circunscripción 1'),
('Santo Domingo','Mi Casa','Circunscripción 3'),
('Santo Domingo','Mi Hogar','Circunscripción 1'),
('Santo Domingo','Mi Sueño I-II','Circunscripción 1'),
('Santo Domingo','Mirador del Ozama','Circunscripción 2'),
('Santo Domingo','Molinuevo','Circunscripción 1'),
('Santo Domingo','Narciza','Circunscripción 1'),
('Santo Domingo','Nueva Jerusalen','Circunscripción 3'),
('Santo Domingo','Nuevo Amanecer','Circunscripción 3'),
('Santo Domingo','Nuevo Renacer','Circunscripción 3'),
('Santo Domingo','Nuevo Sol Naciente','Circunscripción 1'),
('Santo Domingo','Orquidea I','Circunscripción 3'),
('Santo Domingo','Orquidea II','Circunscripción 3'),
('Santo Domingo','Orquidea III','Circunscripción 3'),
('Santo Domingo','Ozama','Circunscripción 1'),
('Santo Domingo','Palmarejo-Villa Linda','Circunscripción 5'),
('Santo Domingo','Pantoja','Circunscripción 5'),
('Santo Domingo','Parque Del Este (El Pensador)','Circunscripción 1'),
('Santo Domingo','Parque Del Este II','Circunscripción 1'),
('Santo Domingo','Parque del Este III','Circunscripción 1'),
('Santo Domingo','Pedro Brand','Circunscripción 5'),
('Santo Domingo','Perla Antillana','Circunscripción 3'),
('Santo Domingo','Pidoca','Circunscripción 2'),
('Santo Domingo','Portofino','Circunscripción 3'),
('Santo Domingo','Prado Oriental','Circunscripción 3'),
('Santo Domingo','Prados Del Cachón','Circunscripción 2'),
('Santo Domingo','Profesionales Agropecuarios','Circunscripción 3'),
('Santo Domingo','Proyecto Turistico San Souci','Circunscripción 1'),
('Santo Domingo','Pueblo Nuevo','Circunscripción 1'),
('Santo Domingo','Pueblo Nuevo (Los Alcarrizos)','Circunscripción 5'),
('Santo Domingo','Puerca Brava','Circunscripción 1'),
('Santo Domingo','Radiante Amanecer','Circunscripción 3'),
('Santo Domingo','Ralma','Circunscripción 1'),
('Santo Domingo','Ramón Matías Mella','Circunscripción 1'),
('Santo Domingo','Rep. Alma Rosa','Circunscripción 1'),
('Santo Domingo','Rep. Los Tres Ojos','Circunscripción 1'),
('Santo Domingo','Rep. Patria Mella','Circunscripción 1'),
('Santo Domingo','Rep. Santa Lucía','Circunscripción 1'),
('Santo Domingo','Rep. Villa Carmen','Circunscripción 3'),
('Santo Domingo','Res. Acuario','Circunscripción 1'),
('Santo Domingo','Res. Altagracia II','Circunscripción 3'),
('Santo Domingo','Res. Altavista I','Circunscripción 3'),
('Santo Domingo','Res. Amalia','Circunscripción 3'),
('Santo Domingo','Res. Amapola','Circunscripción 2'),
('Santo Domingo','Res. Amarilis III','Circunscripción 3'),
('Santo Domingo','Res. Amarilis IV','Circunscripción 3'),
('Santo Domingo','Res. Arpe IV','Circunscripción 3'),
('Santo Domingo','Res. Belinda','Circunscripción 2'),
('Santo Domingo','Res. Belleza De Los Altos','Circunscripción 3'),
('Santo Domingo','Res. Charlotte','Circunscripción 2'),
('Santo Domingo','Res. Don Miguel','Circunscripción 3'),
('Santo Domingo','Res. Don Oscar','Circunscripción 2'),
('Santo Domingo','Res. Don Paco III','Circunscripción 3'),
('Santo Domingo','Res. Doña Lidia','Circunscripción 3'),
('Santo Domingo','Res. Ebano','Circunscripción 3'),
('Santo Domingo','Res. El Bosque','Circunscripción 2'),
('Santo Domingo','Res. Estrella del Este','Circunscripción 3'),
('Santo Domingo','Res. Fedomar','Circunscripción 3'),
('Santo Domingo','Res. Fernandez Oriental','Circunscripción 3'),
('Santo Domingo','Res. Florivic','Circunscripción 3'),
('Santo Domingo','Res. Idalia I','Circunscripción 2'),
('Santo Domingo','Res. Ines II','Circunscripción 1'),
('Santo Domingo','Res. Jardines del V Centenario','Circunscripción 3'),
('Santo Domingo','Res. Juan Carlos','Circunscripción 1'),
('Santo Domingo','Res. La Moneda','Circunscripción 3'),
('Santo Domingo','Res. La Moneda II','Circunscripción 3'),
('Santo Domingo','Res. La Primavera','Circunscripción 1'),
('Santo Domingo','Res. Las Palmeras','Circunscripción 3'),
('Santo Domingo','Res. Las Praderas','Circunscripción 3'),
('Santo Domingo','Res. Las Terrazas','Circunscripción 2'),
('Santo Domingo','Res. Los Maestros','Circunscripción 3'),
('Santo Domingo','Res. Los Tres Ojos','Circunscripción 1'),
('Santo Domingo','Res. Magdalen','Circunscripción 1'),
('Santo Domingo','Res. Maranatha','Circunscripción 3'),
('Santo Domingo','Res. Mella','Circunscripción 1'),
('Santo Domingo','Res. Mendoza','Circunscripción 1'),
('Santo Domingo','Res. Milenium','Circunscripción 1'),
('Santo Domingo','Res. Mirador del Este','Circunscripción 3'),
('Santo Domingo','Res. Monty I','Circunscripción 3'),
('Santo Domingo','Res. Nancy Nadesha (Monte Verde, Res. Clarimel)','Circunscripción 3'),
('Santo Domingo','Res. Oasis','Circunscripción 1'),
('Santo Domingo','Res. Oriental','Circunscripción 1'),
('Santo Domingo','Res. Oriente','Circunscripción 2'),
('Santo Domingo','Res. Paco I','Circunscripción 3'),
('Santo Domingo','Res. Paco II','Circunscripción 3'),
('Santo Domingo','Res. Parque del Este','Circunscripción 1'),
('Santo Domingo','Res. Paseo Del Este II','Circunscripción 3'),
('Santo Domingo','Res. Paseo Oriental','Circunscripción 3'),
('Santo Domingo','Res. Pradera Oriental','Circunscripción 3'),
('Santo Domingo','Res. Pradera Tropical','Circunscripción 3'),
('Santo Domingo','Res. Proesa','Circunscripción 2'),
('Santo Domingo','Res. Reyoli','Circunscripción 3'),
('Santo Domingo','Res. Rosario Mieses','Circunscripción 1'),
('Santo Domingo','Res. Shalom','Circunscripción 3'),
('Santo Domingo','Res. Sharae','Circunscripción 1'),
('Santo Domingo','Res. Terrazas del Atlantico','Circunscripción 1'),
('Santo Domingo','Res. Tito III','Circunscripción 1'),
('Santo Domingo','Res. Tito IV','Circunscripción 2'),
('Santo Domingo','Res. Vereda Tropical','Circunscripción 3'),
('Santo Domingo','Res. Viñas Del Mar','Circunscripción 3'),
('Santo Domingo','Res. Wendy','Circunscripción 1'),
('Santo Domingo','Residencial Apolo','Circunscripción 2'),
('Santo Domingo','Residencial Del Este','Circunscripción 1'),
('Santo Domingo','Residencial Islas Canarias','Circunscripción 3'),
('Santo Domingo','Residencial San Souci','Circunscripción 1'),
('Santo Domingo','Rosales del Este','Circunscripción 3'),
('Santo Domingo','Sabana Perdida','Circunscripción 6'),
('Santo Domingo','San Antonio','Circunscripción 2'),
('Santo Domingo','San Antonio de Guerra','Circunscripción 3'),
('Santo Domingo','San José de Mendoza','Circunscripción 3'),
('Santo Domingo','San Lorenzo','Circunscripción 2'),
('Santo Domingo','San Pablo II (Los Cartones)','Circunscripción 2'),
('Santo Domingo','Santo Domingo Norte','Circunscripción 6'),
('Santo Domingo','Santo Domingo Oeste','Circunscripción 4'),
('Santo Domingo','Savica','Circunscripción 1'),
('Santo Domingo','Savica (Los Alcarrizos)','Circunscripción 5'),
('Santo Domingo','Simonico','Circunscripción 1'),
('Santo Domingo','Tropical del Este','Circunscripción 3'),
('Santo Domingo','Urb. Amanda I','Circunscripción 1'),
('Santo Domingo','Urb. Amanda II','Circunscripción 1'),
('Santo Domingo','Urb. Ana Teresa Balaguer','Circunscripción 3'),
('Santo Domingo','Urb. Argentina','Circunscripción 3'),
('Santo Domingo','Urb. Arismar','Circunscripción 3'),
('Santo Domingo','Urb. Brisa Fresca III','Circunscripción 3'),
('Santo Domingo','Urb. Buenaventura','Circunscripción 3'),
('Santo Domingo','Urb. Buenaventura II','Circunscripción 3'),
('Santo Domingo','Urb. Cabirma Del Este I','Circunscripción 2'),
('Santo Domingo','Urb. Cabirna Del Este II','Circunscripción 2'),
('Santo Domingo','Urb. Cancino','Circunscripción 2'),
('Santo Domingo','Urb. Capotillo','Circunscripción 1'),
('Santo Domingo','Urb. Carola','Circunscripción 1'),
('Santo Domingo','Urb. Cerros Del Ozama','Circunscripción 2'),
('Santo Domingo','Urb. Charles de Gaulle','Circunscripción 3'),
('Santo Domingo','Urb. Corambar','Circunscripción 3'),
('Santo Domingo','Urb. Doña Lucia','Circunscripción 1'),
('Santo Domingo','Urb. Duarte','Circunscripción 1'),
('Santo Domingo','Urb. El Cachon','Circunscripción 2'),
('Santo Domingo','Urb. El Doral','Circunscripción 3'),
('Santo Domingo','Urb. El Mirador Del Ozama','Circunscripción 2'),
('Santo Domingo','Urb. El Palmar','Circunscripción 1'),
('Santo Domingo','Urb. El Tamarindo (Paseo De Las Rosas)','Circunscripción 3'),
('Santo Domingo','Urb. Eva Josefina','Circunscripción 3'),
('Santo Domingo','Urb. Fernandez II','Circunscripción 3'),
('Santo Domingo','Urb. Flor Del Tamarindo','Circunscripción 3'),
('Santo Domingo','Urb. Franconia','Circunscripción 1'),
('Santo Domingo','Urb. Genésis','Circunscripción 2'),
('Santo Domingo','Urb. Italia','Circunscripción 1'),
('Santo Domingo','Urb. Jardines Del Ozama','Circunscripción 2'),
('Santo Domingo','Urb. Jardines de Isabel','Circunscripción 3'),
('Santo Domingo','Urb. Jardines del Cachon','Circunscripción 2'),
('Santo Domingo','Urb. Jeanca II','Circunscripción 3'),
('Santo Domingo','Urb. Josue','Circunscripción 3'),
('Santo Domingo','Urb. La Rubia (Universo III)','Circunscripción 2'),
('Santo Domingo','Urb. Las Americas','Circunscripción 3'),
('Santo Domingo','Urb. Las Americas II','Circunscripción 3'),
('Santo Domingo','Urb. Lomisa','Circunscripción 2'),
('Santo Domingo','Urb. Los Antares','Circunscripción 1'),
('Santo Domingo','Urb. Los Corales','Circunscripción 3'),
('Santo Domingo','Urb. Los Molinos','Circunscripción 3'),
('Santo Domingo','Urb. Los Trabajadores','Circunscripción 3'),
('Santo Domingo','Urb. Los Triunfadores','Circunscripción 3'),
('Santo Domingo','Urb. Los Ángeles','Circunscripción 1'),
('Santo Domingo','Urb. Lucena del Mar','Circunscripción 3'),
('Santo Domingo','Urb. Luz Maria','Circunscripción 3'),
('Santo Domingo','Urb. Marbella I','Circunscripción 3'),
('Santo Domingo','Urb. Marbella II','Circunscripción 3'),
('Santo Domingo','Urb. Marbella III','Circunscripción 3'),
('Santo Domingo','Urb. Margarita','Circunscripción 1'),
('Santo Domingo','Urb. Margarita II','Circunscripción 1'),
('Santo Domingo','Urb. Maria Mercedes','Circunscripción 3'),
('Santo Domingo','Urb. María Dolores','Circunscripción 1'),
('Santo Domingo','Urb. María Trinidad Sánchez','Circunscripción 2'),
('Santo Domingo','Urb. María del Mar','Circunscripción 3'),
('Santo Domingo','Urb. Mendoza I','Circunscripción 1'),
('Santo Domingo','Urb. Mendoza II','Circunscripción 1'),
('Santo Domingo','Urb. Mercedes','Circunscripción 1'),
('Santo Domingo','Urb. Mil Flores','Circunscripción 2'),
('Santo Domingo','Urb. Moisés','Circunscripción 2'),
('Santo Domingo','Urb. Paraiso','Circunscripción 3'),
('Santo Domingo','Urb. Paraiso Oriental','Circunscripción 3'),
('Santo Domingo','Urb. Paraiso del Mar','Circunscripción 3'),
('Santo Domingo','Urb. Pradera del Tamarindo','Circunscripción 3'),
('Santo Domingo','Urb. Prados del Este','Circunscripción 3'),
('Santo Domingo','Urb. Ramón Matías Mella','Circunscripción 2'),
('Santo Domingo','Urb. Real Cancino','Circunscripción 2'),
('Santo Domingo','Urb. Regina','Circunscripción 3'),
('Santo Domingo','Urb. Riviera del Caribe','Circunscripción 3'),
('Santo Domingo','Valle de las Américas','Circunscripción 3'),
('Santo Domingo','Vecinos Unidos','Circunscripción 1'),
('Santo Domingo','Vietnam','Circunscripción 2'),
('Santo Domingo','Villa Adela','Circunscripción 3'),
('Santo Domingo','Villa Carmen','Circunscripción 3'),
('Santo Domingo','Villa Duarte','Circunscripción 1'),
('Santo Domingo','Villa Eloisa','Circunscripción 3'),
('Santo Domingo','Villa Esperanza','Circunscripción 3'),
('Santo Domingo','Villa Faro','Circunscripción 1'),
('Santo Domingo','Villa Hermosa Invi-Cea','Circunscripción 3'),
('Santo Domingo','Villa María','Circunscripción 1'),
('Santo Domingo','Villa Mella','Circunscripción 6'),
('Santo Domingo','Villa Mella Centro','Circunscripción 6'),
('Santo Domingo','Villa Olímpica','Circunscripción 1'),
('Santo Domingo','Villa Tropicalia','Circunscripción 3'),
('Santo Domingo','Villas San Isidro','Circunscripción 3'),
('Santo Domingo','Vista Hermosa','Circunscripción 2'),
('Santo Domingo','Vista del Sol','Circunscripción 3'),
('Santo Domingo','Viviendas Aisladas Aniversario','Circunscripción 1'),
('Sánchez Ramírez','Cevicos','Única'),
('Sánchez Ramírez','Cotuí','Única'),
('Sánchez Ramírez','Fantino','Única'),
('Sánchez Ramírez','La Mata','Única'),
('Valverde','Esperanza','Única'),
('Valverde','Laguna Salada','Única'),
('Valverde','Mao','Única')
on conflict (provincia, sector) do nothing;

-- Usuario administrador inicial
set search_path = public, extensions;
insert into public.usuarios (usuario, nombre, password_hash, rol)
values ('admin', 'Administrador', crypt(:'admin_clave', gen_salt('bf')), 'admin')
on conflict (usuario) do nothing;
