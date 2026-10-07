import { cache } from "react";
import type { Config, Sector } from "./tipos";

const URL_BASE = process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_PUBLISHABLE_KEY;

export class ErrorApi extends Error {}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!URL_BASE || !CLAVE) throw new Error("Faltan SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: CLAVE, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const texto = await res.text();
  if (!res.ok) {
    let msg = texto;
    try {
      msg = JSON.parse(texto).message ?? texto;
    } catch {}
    throw new ErrorApi(msg);
  }
  return (texto ? JSON.parse(texto) : null) as T;
}

const CONFIG_DEFECTO: Config = { nombre_org: "Comité de Base", lema: "Padrón de Simpatizantes", logo: null };

export const configPublica = cache(async (): Promise<Config> => {
  try {
    return (await rpc<Config>("fn_config_publica")) ?? CONFIG_DEFECTO;
  } catch {
    return CONFIG_DEFECTO;
  }
});

export const sectores = cache(() => rpc<Sector[]>("fn_sectores"));
