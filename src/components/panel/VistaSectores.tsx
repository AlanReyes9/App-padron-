"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPinned, Pencil, Plus, Save, Search, Trash2 } from "lucide-react";
import { eliminarSector, guardarSector } from "@/app/acciones";
import { Aviso, Modal } from "@/components/Modal";
import { provinciasDe } from "@/components/SelectorSector";
import { Encabezado } from "@/components/panel/Encabezado";
import type { Sector } from "@/lib/tipos";

const CIRCS = ["Única", "Circunscripción 1", "Circunscripción 2", "Circunscripción 3", "Circunscripción 4", "Circunscripción 5", "Circunscripción 6"];
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function VistaSectores({ sectores }: { sectores: Sector[] }) {
  const router = useRouter();
  const provincias = useMemo(() => provinciasDe(sectores), [sectores]);
  const [prov, setProv] = useState(provincias[0] ?? "");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Sector | "nuevo" | null>(null);
  const [error, setError] = useState("");

  const lista = useMemo(
    () => sectores.filter((s) => (q ? normal(s.sector).includes(normal(q)) : s.provincia === prov)),
    [sectores, prov, q],
  );

  return (
    <>
      <Encabezado titulo="Sectores" descripcion={`${sectores.length.toLocaleString("es-DO")} sectores en ${provincias.length} provincias. Corrige o agrega sectores y su circunscripción.`}>
        <button onClick={() => setEditando("nuevo")} className="btn-primary"><Plus className="size-4" /> Agregar sector</button>
      </Encabezado>

      <div className="card mb-5 grid gap-3 p-4 sm:grid-cols-2">
        <select className="input" value={prov} onChange={(e) => { setProv(e.target.value); setQ(""); }}>
          {provincias.map((p) => <option key={p}>{p}</option>)}
        </select>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar sector en todo el país" className="input pl-9" />
        </div>
      </div>
      {error && <div className="mb-4"><Aviso tipo="error">{error}</Aviso></div>}

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-prm-900 text-xs tracking-wide text-white uppercase">
            <tr>
              <th className="px-4 py-3">Sector</th>
              <th className="hidden px-4 py-3 sm:table-cell">Provincia</th>
              <th className="px-4 py-3">Circunscripción</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((s) => (
              <tr key={s.id} className="hover:bg-prm-50">
                <td className="px-4 py-2.5 font-medium text-slate-800"><MapPinned className="mr-2 inline size-3.5 text-prm-400" />{s.sector}</td>
                <td className="hidden px-4 py-2.5 text-slate-500 sm:table-cell">{s.provincia}</td>
                <td className="px-4 py-2.5"><span className="rounded-full bg-prm-100 px-2.5 py-1 text-xs font-bold text-prm-800">{s.circunscripcion}</span></td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditando(s)} className="rounded-lg p-2 text-slate-500 hover:bg-prm-100 hover:text-prm-800" title="Editar"><Pencil className="size-4" /></button>
                    <button
                      onClick={async () => {
                        if (!confirm(`¿Eliminar el sector ${s.sector}?`)) return;
                        const r = await eliminarSector(s.id);
                        if (r.ok) { setError(""); router.refresh(); } else setError(r.error);
                      }}
                      className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
                      title="Eliminar"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Sin resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Agregar sector" : "Editar sector"} subtitulo="Los votantes ya registrados en el sector se actualizan automáticamente." onCerrar={() => setEditando(null)} ancho="max-w-md">
        {editando !== null && (
          <FormSector
            s={editando === "nuevo" ? { id: 0, provincia: prov, sector: "", circunscripcion: "Única" } : editando}
            nuevo={editando === "nuevo"}
            provincias={provincias}
            onListo={() => { setEditando(null); router.refresh(); }}
          />
        )}
      </Modal>
    </>
  );
}

function FormSector({ s, nuevo, provincias, onListo }: { s: Sector; nuevo: boolean; provincias: string[]; onListo: () => void }) {
  const [d, setD] = useState(s);
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await guardarSector(nuevo ? null : s.id, d.provincia, d.sector, d.circunscripcion);
          if (r.ok) onListo();
          else setError(r.error);
        });
      }}
      className="space-y-4"
    >
      <div>
        <label className="label">Provincia</label>
        <select className="input" value={d.provincia} onChange={(e) => setD({ ...d, provincia: e.target.value })}>
          {provincias.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Nombre del sector</label>
        <input className="input" value={d.sector} onChange={(e) => setD({ ...d, sector: e.target.value })} required autoFocus />
      </div>
      <div>
        <label className="label">Circunscripción</label>
        <select className="input" value={d.circunscripcion} onChange={(e) => setD({ ...d, circunscripcion: e.target.value })}>
          {CIRCS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex justify-end">
        <button disabled={cargando} className="btn-primary">{cargando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar</button>
      </div>
    </form>
  );
}
