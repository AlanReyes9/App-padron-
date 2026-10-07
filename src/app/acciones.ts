"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rpc, ErrorApi } from "@/lib/api";
import { mensajeError } from "@/lib/errores";
import { COOKIE, token } from "@/lib/sesion";
import type { Config, Resultado, ResultadoBusqueda, Usuario } from "@/lib/tipos";

async function ejecutar<T>(fn: string, args: Record<string, unknown>, ruta?: string): Promise<Resultado<T>> {
  try {
    const data = await rpc<T>(fn, args);
    if (ruta) revalidatePath(ruta, "layout");
    return { ok: true, data };
  } catch (e) {
    const codigo = e instanceof ErrorApi ? e.message : "";
    if (codigo === "NO_AUTORIZADO") redirect("/?login=1#acceso");
    return { ok: false, error: mensajeError(codigo) };
  }
}

async function conToken() {
  const t = await token();
  if (!t) redirect("/?login=1#acceso");
  return t;
}

export async function buscarCedula(cedula: string): Promise<Resultado<ResultadoBusqueda | null>> {
  return ejecutar<ResultadoBusqueda | null>("fn_buscar_cedula", { p_cedula: cedula });
}

/** Indica si la cédula ya existe en el padrón (validación en tiempo real del formulario). */
export async function cedulaRegistrada(cedula: string): Promise<boolean> {
  await conToken();
  try {
    return (await rpc<ResultadoBusqueda | null>("fn_buscar_cedula", { p_cedula: cedula })) !== null;
  } catch {
    return false;
  }
}

export async function iniciarSesion(usuario: string, clave: string): Promise<Resultado<null>> {
  let r: { token?: string; error?: string; usuario?: Usuario };
  try {
    r = await rpc("fn_login", { p_usuario: usuario, p_password: clave });
  } catch {
    return { ok: false, error: mensajeError("") };
  }
  if (!r.token) return { ok: false, error: mensajeError(r.error ?? "") };
  (await cookies()).set(COOKIE, r.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true, data: null };
}

export async function cerrarSesion() {
  const t = await token();
  if (t) await rpc("fn_logout", { p_token: t }).catch(() => {});
  (await cookies()).delete(COOKIE);
  redirect("/");
}

export interface DatosVotante {
  nombre: string;
  apellido: string;
  cedula: string;
  telefono: string;
  direccion: string;
  provincia: string;
  sector: string;
}

export async function guardarVotante(id: string | null, datos: DatosVotante) {
  return ejecutar("fn_votante_guardar", { p_token: await conToken(), p_id: id, p_datos: datos }, "/panel");
}

export async function eliminarVotante(id: string) {
  return ejecutar("fn_votante_eliminar", { p_token: await conToken(), p_id: id }, "/panel");
}

export async function guardarPerfil(nombre: string, usuario: string, telefono: string, email: string) {
  return ejecutar<Usuario>(
    "fn_perfil_guardar",
    { p_token: await conToken(), p_nombre: nombre, p_usuario: usuario, p_telefono: telefono, p_email: email },
    "/panel",
  );
}

export async function cambiarClave(actual: string, nueva: string) {
  return ejecutar("fn_cambiar_password", { p_token: await conToken(), p_actual: actual, p_nueva: nueva });
}

export async function guardarCoordinador(
  id: string | null,
  d: { nombre: string; usuario: string; telefono: string; email: string; activo: boolean; clave?: string },
) {
  return ejecutar(
    "fn_coordinador_guardar",
    {
      p_token: await conToken(),
      p_id: id,
      p_nombre: d.nombre,
      p_usuario: d.usuario,
      p_telefono: d.telefono,
      p_email: d.email,
      p_activo: d.activo,
      p_password: d.clave ?? null,
    },
    "/panel",
  );
}

export async function claveCoordinador(id: string, clave: string) {
  return ejecutar("fn_coordinador_password", { p_token: await conToken(), p_id: id, p_password: clave });
}

export async function eliminarCoordinador(id: string) {
  return ejecutar<number>("fn_coordinador_eliminar", { p_token: await conToken(), p_id: id }, "/panel");
}

export async function guardarConfig(nombre: string, lema: string, logo: string | null) {
  return ejecutar<Config>(
    "fn_config_guardar",
    { p_token: await conToken(), p_nombre_org: nombre, p_lema: lema, p_logo: logo },
    "/",
  );
}

export async function guardarSector(id: number | null, provincia: string, sector: string, circunscripcion: string) {
  return ejecutar(
    "fn_sector_guardar",
    { p_token: await conToken(), p_id: id, p_provincia: provincia, p_sector: sector, p_circunscripcion: circunscripcion },
    "/panel",
  );
}

export async function eliminarSector(id: number) {
  return ejecutar("fn_sector_eliminar", { p_token: await conToken(), p_id: id }, "/panel");
}
