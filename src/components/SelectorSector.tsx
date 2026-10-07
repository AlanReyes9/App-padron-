"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronDown, MapPin, Search } from "lucide-react";
import type { Sector } from "@/lib/tipos";

export function provinciasDe(sectores: Sector[]) {
  return [...new Set(sectores.map((s) => s.provincia))].sort((a, b) => a.localeCompare(b, "es"));
}

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ComboSector({
  sectores,
  provincia,
  valor,
  onCambio,
  placeholder = "Busca y elige el sector",
}: {
  sectores: Sector[];
  provincia: string;
  valor: string;
  onCambio: (sector: string) => void;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => caja.current && !caja.current.contains(e.target as Node) && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const opciones = useMemo(() => {
    const t = normal(texto);
    return sectores.filter((s) => s.provincia === provincia && (!t || normal(s.sector).includes(t)));
  }, [sectores, provincia, texto]);

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        disabled={!provincia}
        onClick={() => setAbierto((a) => !a)}
        className="input flex items-center justify-between text-left"
      >
        <span className={valor ? "text-slate-900" : "text-slate-400"}>
          {valor || (provincia ? placeholder : "Primero elige la provincia")}
        </span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
      {abierto && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3">
            <Search className="size-4 text-slate-400" />
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escribe para buscar…"
              className="w-full py-2.5 text-sm outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {opciones.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Sin resultados</li>}
            {opciones.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    onCambio(s.sector);
                    setAbierto(false);
                    setTexto("");
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-prm-50 ${
                    s.sector === valor ? "bg-prm-50 font-semibold text-prm-800" : "text-slate-700"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <MapPin className="size-3.5 text-prm-400" />
                    {s.sector}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{s.circunscripcion}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
