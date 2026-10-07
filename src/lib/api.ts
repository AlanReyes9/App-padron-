import { cache } from "react";
import type { Pool } from "pg";
import type { Config, Sector } from "./tipos";

/**
 * Acceso a la base de datos. Dos modos:
 * - DATABASE_URL: conexión directa a PostgreSQL (servidor propio).
 * - SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY: API REST de Supabase.
 * En ambos casos solo se llaman las funciones `fn_*` definidas en database/instalar.sql.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const URL_BASE = process.env.SUPABASE_URL;
const CLAVE = process.env.SUPABASE_PUBLISHABLE_KEY;

/** Error devuelto por una función de la base de datos (código en `message`). */
export class ErrorApi extends Error {}

const globalPg = globalThis as unknown as { poolPadron?: Pool };

async function pool() {
  if (!globalPg.poolPadron) {
    const { Pool } = await import("pg");
    globalPg.poolPadron = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return globalPg.poolPadron;
}

async function rpcPostgres<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!/^fn_\w+$/.test(fn)) throw new Error(`Función no permitida: ${fn}`);
  const claves = Object.keys(args);
  const valores = claves.map((k) => {
    const v = args[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const sql = `select public.${fn}(${claves.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
  try {
    const res = await (await pool()).query(sql, valores);
    return (res.rows[0]?.r ?? null) as T;
  } catch (e) {
    const msg = (e as { message?: string }).message ?? "";
    // Las funciones lanzan códigos como NO_AUTORIZADO o CEDULA_DUPLICADA:...
    if (/^[A-Z_]+(:|$)/.test(msg)) throw new ErrorApi(msg);
    throw e;
  }
}

async function rpcSupabase<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  if (!URL_BASE || !CLAVE) throw new Error("Configura DATABASE_URL o SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
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

/** Llama a una función `fn_*` de Postgres. */
export function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return DATABASE_URL ? rpcPostgres<T>(fn, args) : rpcSupabase<T>(fn, args);
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
