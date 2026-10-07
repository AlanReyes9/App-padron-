export type Rol = "admin" | "coordinador";

export interface Usuario {
  id: string;
  usuario: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  rol: Rol;
  activo: boolean;
}

export interface Coordinador extends Usuario {
  creado_en: string;
  votantes: number;
}

export interface Votante {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string;
  telefono: string | null;
  direccion: string | null;
  provincia: string;
  sector: string;
  circunscripcion: string;
  coordinador_id: string;
  coordinador: string;
  creado_en: string;
}

export interface Sector {
  id: number;
  provincia: string;
  sector: string;
  circunscripcion: string;
}

export interface Config {
  nombre_org: string;
  lema: string;
  logo: string | null;
}

export interface Resumen {
  total: number;
  hoy: number;
  coordinadores: number;
  por_provincia: { provincia: string; total: number }[];
  por_coordinador: { nombre: string; total: number }[];
}

export interface ResultadoBusqueda {
  nombre: string;
  apellido: string;
  cedula: string;
  provincia: string;
  sector: string;
  circunscripcion: string;
  coordinador: string;
  registrado: string;
}

export interface Filtros {
  provincia?: string;
  sector?: string;
  circunscripcion?: string;
  coordinador?: string;
  q?: string;
}

export type Resultado<T = null> = { ok: true; data: T } | { ok: false; error: string };
