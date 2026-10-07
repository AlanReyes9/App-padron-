export function soloDigitos(v: string) {
  return v.replace(/\D/g, "");
}

/** 00112345678 -> 001-1234567-8 */
export function formatoCedula(v: string) {
  const d = soloDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`;
}

export function formatoTelefono(v: string | null) {
  const d = soloDigitos(v ?? "");
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return v ?? "";
}

export function circCorta(c: string) {
  return c.startsWith("Circunscripción ") ? `C-${c.slice(16)}` : c;
}

export function iniciales(nombre: string) {
  return nombre
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÁÉÍÓÚÑ]/.test(p))
    .slice(0, 3)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-DO", {
    timeZone: "America/Santo_Domingo",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
