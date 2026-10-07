import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { rpc } from "./api";
import type { Usuario } from "./tipos";

export const COOKIE = "padron_sesion";

export async function token() {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const t = await token();
  if (!t) return null;
  try {
    return await rpc<Usuario>("fn_sesion", { p_token: t });
  } catch {
    return null;
  }
});

export async function requerirUsuario() {
  const u = await usuarioActual();
  if (!u) redirect("/?login=1#acceso");
  return u;
}

export async function requerirAdmin() {
  const u = await requerirUsuario();
  if (u.rol !== "admin") redirect("/panel");
  return u;
}
