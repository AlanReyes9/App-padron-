"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, CircleAlert, IdCard, Loader2, MapPin, Search, UserRound } from "lucide-react";
import { buscarCedula } from "@/app/acciones";
import { fechaCorta, formatoCedula, soloDigitos } from "@/lib/formato";
import type { ResultadoBusqueda } from "@/lib/tipos";

type Estado = { tipo: "inicio" } | { tipo: "encontrado"; r: ResultadoBusqueda } | { tipo: "no"; cedula: string } | { tipo: "error"; msg: string };

export function BuscadorCedula() {
  const [cedula, setCedula] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicio" });
  const [cargando, iniciar] = useTransition();

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (soloDigitos(cedula).length !== 11) {
      setEstado({ tipo: "error", msg: "Escribe los 11 dígitos de la cédula." });
      return;
    }
    iniciar(async () => {
      const r = await buscarCedula(cedula);
      if (!r.ok) setEstado({ tipo: "error", msg: r.error });
      else if (r.data) setEstado({ tipo: "encontrado", r: r.data });
      else setEstado({ tipo: "no", cedula: formatoCedula(cedula) });
    });
  }

  return (
    <div>
      <form onSubmit={buscar} className="flex flex-col gap-2 rounded-2xl bg-white/10 p-2 ring-1 ring-white/20 backdrop-blur sm:flex-row">
        <label className="flex flex-1 items-center gap-3 rounded-xl bg-white px-4">
          <IdCard className="size-5 shrink-0 text-prm-600" />
          <input
            value={cedula}
            onChange={(e) => setCedula(formatoCedula(e.target.value))}
            inputMode="numeric"
            placeholder="000-0000000-0"
            aria-label="Número de cédula"
            className="w-full bg-transparent py-3.5 text-lg font-semibold tracking-wider text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400"
          />
        </label>
        <button disabled={cargando} className="btn bg-oro px-6 py-3.5 text-base text-prm-950 hover:bg-oro-claro">
          {cargando ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
          Consultar
        </button>
      </form>

      <div className="mt-4 min-h-6" aria-live="polite">
        {estado.tipo === "error" && (
          <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <CircleAlert className="size-4" /> {estado.msg}
          </p>
        )}
        {estado.tipo === "no" && (
          <div className="flex items-start gap-3 rounded-2xl bg-white p-4 text-slate-800 shadow-xl">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600">
              <CircleAlert className="size-5" />
            </span>
            <div>
              <p className="font-bold">No está registrado</p>
              <p className="text-sm text-slate-500">
                La cédula <b className="text-slate-700">{estado.cedula}</b> no figura en nuestro padrón. Contacta a un coordinador para
                inscribirte.
              </p>
            </div>
          </div>
        )}
        {estado.tipo === "encontrado" && <Ficha r={estado.r} />}
      </div>
    </div>
  );
}

function Ficha({ r }: { r: ResultadoBusqueda }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl">
      <div className="flex items-center gap-3 bg-gradient-to-r from-prm-700 to-prm-500 px-5 py-3 text-white">
        <BadgeCheck className="size-5" />
        <span className="text-sm font-semibold">Registrado en el padrón</span>
        <span className="ml-auto text-xs text-white/80">desde {fechaCorta(r.registrado)}</span>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Nombre</p>
          <p className="text-xl font-extrabold text-prm-950">
            {r.nombre} {r.apellido}
          </p>
          <p className="font-mono text-sm text-slate-500">{formatoCedula(r.cedula)}</p>
        </div>
        <Dato icono={<MapPin className="size-4" />} titulo="Provincia" valor={r.provincia} />
        <Dato icono={<MapPin className="size-4" />} titulo="Sector" valor={r.sector} />
        <Dato icono={<MapPin className="size-4" />} titulo="Circunscripción" valor={r.circunscripcion} />
        <Dato icono={<UserRound className="size-4" />} titulo="Registrado por" valor={r.coordinador} destacado />
      </div>
    </div>
  );
}

function Dato({ icono, titulo, valor, destacado }: { icono: React.ReactNode; titulo: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-xl p-3 ${destacado ? "bg-prm-50 ring-1 ring-prm-100" : "bg-slate-50"}`}>
      <span className="mt-0.5 text-prm-500">{icono}</span>
      <div>
        <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{titulo}</p>
        <p className="font-semibold text-slate-800">{valor}</p>
      </div>
    </div>
  );
}
