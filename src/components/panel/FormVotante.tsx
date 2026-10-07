"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckCircle2, CircleX, Loader2, Save } from "lucide-react";
import { cedulaRegistrada, guardarVotante, type DatosVotante } from "@/app/acciones";
import { Aviso } from "@/components/Modal";
import { ComboSector, provinciasDe } from "@/components/SelectorSector";
import { formatoCedula, soloDigitos } from "@/lib/formato";
import type { Sector, Votante } from "@/lib/tipos";

const VACIO: DatosVotante = { nombre: "", apellido: "", cedula: "", telefono: "", direccion: "", provincia: "", sector: "" };

export function FormVotante({ sectores, votante, onListo }: { sectores: Sector[]; votante: Votante | null; onListo: (seguir: boolean) => void }) {
  const [d, setD] = useState<DatosVotante>(
    votante
      ? { nombre: votante.nombre, apellido: votante.apellido, cedula: formatoCedula(votante.cedula), telefono: votante.telefono ?? "", direccion: votante.direccion ?? "", provincia: votante.provincia, sector: votante.sector }
      : VACIO,
  );
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [cargando, iniciar] = useTransition();
  const provincias = useMemo(() => provinciasDe(sectores), [sectores]);
  const circ = sectores.find((s) => s.provincia === d.provincia && s.sector === d.sector)?.circunscripcion;

  const set = (k: keyof DatosVotante, v: string) => setD((x) => ({ ...x, [k]: v }));

  // Validación de la cédula en tiempo real: al completar los 11 dígitos se consulta si ya existe
  const [estadoCedula, setEstadoCedula] = useState<"vacia" | "verificando" | "libre" | "registrada">("vacia");
  const digitos = soloDigitos(d.cedula);
  useEffect(() => {
    if (digitos.length !== 11 || digitos === votante?.cedula) {
      setEstadoCedula("vacia");
      return;
    }
    let vigente = true;
    setEstadoCedula("verificando");
    cedulaRegistrada(digitos).then((existe) => vigente && setEstadoCedula(existe ? "registrada" : "libre"));
    return () => {
      vigente = false;
    };
  }, [digitos, votante?.cedula]);

  function enviar(seguir: boolean) {
    setError("");
    setExito("");
    if (digitos.length !== 11) return setError("La cédula debe tener 11 dígitos.");
    if (estadoCedula === "registrada") return setError("Esta cédula ya está registrada en el sistema.");
    if (!d.provincia || !d.sector) return setError("Selecciona la provincia y el sector.");
    iniciar(async () => {
      const r = await guardarVotante(votante?.id ?? null, d);
      if (!r.ok) return setError(r.error);
      if (seguir) {
        setExito(`${d.nombre} ${d.apellido} fue registrado. Puedes registrar el siguiente.`);
        setD({ ...VACIO, provincia: d.provincia, sector: d.sector });
      }
      onListo(seguir);
    });
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); enviar(false); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Nombre *</label>
          <input className="input" value={d.nombre} onChange={(e) => set("nombre", e.target.value)} required autoFocus />
        </div>
        <div>
          <label className="label">Apellido *</label>
          <input className="input" value={d.apellido} onChange={(e) => set("apellido", e.target.value)} required />
        </div>
        <div>
          <label className="label">Cédula *</label>
          <input
            className={`input font-mono tracking-wider ${estadoCedula === "registrada" ? "border-red-400 focus:border-red-500 focus:ring-red-100" : estadoCedula === "libre" ? "border-emerald-400" : ""}`}
            inputMode="numeric"
            placeholder="000-0000000-0"
            value={d.cedula}
            onChange={(e) => set("cedula", formatoCedula(e.target.value))}
            required
          />
          {estadoCedula === "verificando" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="size-3.5 animate-spin" /> Verificando…</p>
          )}
          {estadoCedula === "registrada" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-red-600"><CircleX className="size-3.5" /> Esta cédula ya está registrada</p>
          )}
          {estadoCedula === "libre" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 className="size-3.5" /> Cédula disponible</p>
          )}
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" inputMode="tel" placeholder="809-000-0000" value={d.telefono} onChange={(e) => set("telefono", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Dirección</label>
          <input className="input" placeholder="Calle, número, referencia" value={d.direccion} onChange={(e) => set("direccion", e.target.value)} />
        </div>
        <div>
          <label className="label">Provincia *</label>
          <select className="input" value={d.provincia} onChange={(e) => setD((x) => ({ ...x, provincia: e.target.value, sector: "" }))} required>
            <option value="">Selecciona…</option>
            {provincias.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Sector *</label>
          <ComboSector sectores={sectores} provincia={d.provincia} valor={d.sector} onCambio={(s) => set("sector", s)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Circunscripción</label>
          <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${circ ? "border-prm-200 bg-prm-50 font-bold text-prm-800" : "border-dashed border-slate-200 text-slate-400"}`}>
            {circ ? <><CheckCircle2 className="size-4" /> {circ}</> : "Se completa al elegir el sector"}
          </div>
        </div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      {exito && <Aviso tipo="ok">{exito}</Aviso>}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {!votante && (
          <button type="button" disabled={cargando || estadoCedula === "registrada"} onClick={() => enviar(true)} className="btn-light">
            Guardar y registrar otro
          </button>
        )}
        <button disabled={cargando || estadoCedula === "registrada"} className="btn-primary">
          {cargando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {votante ? "Guardar cambios" : "Registrar"}
        </button>
      </div>
    </form>
  );
}
