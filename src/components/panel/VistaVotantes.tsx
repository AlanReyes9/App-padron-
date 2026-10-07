"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileSpreadsheet, Filter, Loader2, MapPin, Pencil, Phone, Plus, Search, Trash2, UsersRound, X } from "lucide-react";
import { eliminarVotante } from "@/app/acciones";
import { Aviso, Modal } from "@/components/Modal";
import { provinciasDe } from "@/components/SelectorSector";
import { FormVotante } from "@/components/panel/FormVotante";
import { Encabezado } from "@/components/panel/Encabezado";
import { circCorta, fechaCorta, formatoCedula, formatoTelefono } from "@/lib/formato";
import type { Coordinador, Filtros, Sector, Usuario, Votante } from "@/lib/tipos";

export function VistaVotantes({
  usuario,
  votantes,
  sectores,
  coordinadores,
  filtros,
  abrirNuevo,
}: {
  usuario: Usuario;
  votantes: Votante[];
  sectores: Sector[];
  coordinadores: Coordinador[];
  filtros: Filtros;
  abrirNuevo: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const admin = usuario.rol === "admin";
  const [cargando, iniciar] = useTransition();
  const [editando, setEditando] = useState<Votante | "nuevo" | null>(abrirNuevo ? "nuevo" : null);
  const [borrando, setBorrando] = useState<Votante | null>(null);
  const [errorBorrar, setErrorBorrar] = useState("");
  const [q, setQ] = useState(filtros.q ?? "");

  const provincias = useMemo(() => provinciasDe(sectores), [sectores]);
  const sectoresProv = useMemo(() => sectores.filter((s) => s.provincia === filtros.provincia), [sectores, filtros.provincia]);
  const circs = useMemo(() => {
    const base = filtros.provincia ? sectoresProv : sectores;
    return [...new Set(base.map((s) => s.circunscripcion))].sort();
  }, [sectores, sectoresProv, filtros.provincia]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => v && p.set(k, v));
    return p;
  }, [filtros]);

  function filtrar(cambios: Partial<Filtros>) {
    const p = new URLSearchParams(params);
    Object.entries(cambios).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    if ("provincia" in cambios) p.delete("sector");
    iniciar(() => router.replace(`${ruta}?${p.toString()}`, { scroll: false }));
  }

  // Búsqueda por texto con pequeña espera
  useEffect(() => {
    if ((filtros.q ?? "") === q) return;
    const t = setTimeout(() => filtrar({ q }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hayFiltros = Object.values(filtros).some(Boolean);

  async function confirmarBorrado() {
    if (!borrando) return;
    const r = await eliminarVotante(borrando.id);
    if (r.ok) {
      setBorrando(null);
      router.refresh();
    } else setErrorBorrar(r.error);
  }

  return (
    <>
      <Encabezado
        titulo={admin ? "Padrón general" : "Mis votantes"}
        descripcion={admin ? "Todos los votantes registrados por los coordinadores." : "Solo tú puedes ver y descargar esta lista."}
      >
        <a href={`/api/exportar?${params.toString()}`} className="btn-light">
          <FileSpreadsheet className="size-4 text-emerald-600" /> Descargar Excel
        </a>
        <button onClick={() => setEditando("nuevo")} className="btn-primary">
          <Plus className="size-4" /> Registrar votante
        </button>
      </Encabezado>

      <div className="card mb-5 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <Filter className="size-4 text-prm-600" /> Filtros
          {cargando && <Loader2 className="size-4 animate-spin text-prm-500" />}
          {hayFiltros && (
            <button onClick={() => { setQ(""); iniciar(() => router.replace(ruta, { scroll: false })); }} className="ml-auto flex items-center gap-1 text-xs font-semibold text-prm-700 hover:underline">
              <X className="size-3.5" /> Limpiar
            </button>
          )}
        </div>
        <div className={`grid gap-3 sm:grid-cols-2 ${admin ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o cédula" className="input pl-9" />
          </div>
          <select className="input" value={filtros.provincia ?? ""} onChange={(e) => filtrar({ provincia: e.target.value })}>
            <option value="">Todas las provincias</option>
            {provincias.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select className="input" value={filtros.sector ?? ""} disabled={!filtros.provincia} onChange={(e) => filtrar({ sector: e.target.value })}>
            <option value="">{filtros.provincia ? "Todos los sectores" : "Sector (elige provincia)"}</option>
            {sectoresProv.map((s) => <option key={s.id}>{s.sector}</option>)}
          </select>
          <select className="input" value={filtros.circunscripcion ?? ""} onChange={(e) => filtrar({ circunscripcion: e.target.value })}>
            <option value="">Todas las circunscripciones</option>
            {circs.map((c) => <option key={c}>{c}</option>)}
          </select>
          {admin && (
            <select className="input" value={filtros.coordinador ?? ""} onChange={(e) => filtrar({ coordinador: e.target.value })}>
              <option value="">Todos los coordinadores</option>
              {coordinadores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              <option value={usuario.id}>{usuario.nombre} (admin)</option>
            </select>
          )}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-slate-500">
        <span>
          <b className="text-slate-800">{votantes.length.toLocaleString("es-DO")}</b> {votantes.length === 1 ? "votante" : "votantes"}
          {hayFiltros && " con los filtros aplicados"}
        </span>
      </div>

      {votantes.length === 0 ? (
        <div className="card flex flex-col items-center p-12 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-prm-50 text-prm-600"><UsersRound className="size-7" /></span>
          <p className="mt-4 font-bold text-slate-800">{hayFiltros ? "No hay resultados" : "Aún no hay votantes registrados"}</p>
          <p className="mt-1 text-sm text-slate-500">{hayFiltros ? "Prueba con otros filtros." : "Comienza registrando el primero."}</p>
          {!hayFiltros && (
            <button onClick={() => setEditando("nuevo")} className="btn-primary mt-5"><Plus className="size-4" /> Registrar votante</button>
          )}
        </div>
      ) : (
        <>
          {/* Tabla en pantallas grandes */}
          <div className="card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-prm-900 text-xs tracking-wide text-white uppercase">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Votante</th>
                    <th className="px-4 py-3">Cédula</th>
                    <th className="px-4 py-3">Teléfono</th>
                    <th className="px-4 py-3">Ubicación</th>
                    <th className="px-4 py-3">Circ.</th>
                    {admin && <th className="px-4 py-3">Coordinador</th>}
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {votantes.map((v, i) => (
                    <tr key={v.id} className="transition odd:bg-white even:bg-prm-50/40 hover:bg-prm-50">
                      <td className="px-4 py-3 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{v.apellido}, {v.nombre}</p>
                        {v.direccion && <p className="max-w-56 truncate text-xs text-slate-500">{v.direccion}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] whitespace-nowrap text-slate-700">{formatoCedula(v.cedula)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatoTelefono(v.telefono) || "—"}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{v.sector}</p>
                        <p className="text-xs text-slate-500">{v.provincia}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-prm-100 px-2.5 py-1 text-xs font-bold whitespace-nowrap text-prm-800">{circCorta(v.circunscripcion)}</span>
                      </td>
                      {admin && <td className="px-4 py-3 text-slate-700">{v.coordinador}</td>}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditando(v)} className="rounded-lg p-2 text-slate-500 hover:bg-prm-100 hover:text-prm-800" title="Editar"><Pencil className="size-4" /></button>
                          <button onClick={() => { setErrorBorrar(""); setBorrando(v); }} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Eliminar"><Trash2 className="size-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tarjetas en móvil */}
          <div className="space-y-3 md:hidden">
            {votantes.map((v) => (
              <div key={v.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">{v.nombre} {v.apellido}</p>
                    <p className="font-mono text-sm text-slate-500">{formatoCedula(v.cedula)}</p>
                  </div>
                  <span className="rounded-full bg-prm-100 px-2.5 py-1 text-xs font-bold text-prm-800">{circCorta(v.circunscripcion)}</span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p className="flex items-center gap-2"><MapPin className="size-3.5 text-prm-500" /> {v.sector}, {v.provincia}</p>
                  {v.telefono && <p className="flex items-center gap-2"><Phone className="size-3.5 text-prm-500" /> {formatoTelefono(v.telefono)}</p>}
                  {admin && <p className="text-xs text-slate-400">Coordinador: {v.coordinador} · {fechaCorta(v.creado_en)}</p>}
                </div>
                <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
                  <button onClick={() => setEditando(v)} className="btn-light flex-1 py-2"><Pencil className="size-4" /> Editar</button>
                  <button onClick={() => { setErrorBorrar(""); setBorrando(v); }} className="btn-light flex-1 py-2 text-red-600"><Trash2 className="size-4" /> Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal
        abierto={editando !== null}
        titulo={editando === "nuevo" ? "Registrar votante" : "Editar votante"}
        subtitulo="La circunscripción se asigna automáticamente según el sector."
        onCerrar={() => setEditando(null)}
      >
        {editando !== null && (
          <FormVotante
            sectores={sectores}
            votante={editando === "nuevo" ? null : editando}
            onListo={(seguir) => {
              router.refresh();
              if (!seguir) setEditando(null);
            }}
          />
        )}
      </Modal>

      <Modal abierto={borrando !== null} titulo="Eliminar votante" onCerrar={() => setBorrando(null)} ancho="max-w-md">
        {borrando && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              ¿Seguro que deseas eliminar a <b className="text-slate-900">{borrando.nombre} {borrando.apellido}</b> ({formatoCedula(borrando.cedula)}) del padrón?
            </p>
            {errorBorrar && <Aviso tipo="error">{errorBorrar}</Aviso>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setBorrando(null)} className="btn-light">Cancelar</button>
              <button onClick={confirmarBorrado} className="btn-danger"><Trash2 className="size-4" /> Eliminar</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
