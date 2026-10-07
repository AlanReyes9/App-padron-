"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Mail, Pencil, Phone, Plus, Save, Trash2, UserCog, UsersRound } from "lucide-react";
import { claveCoordinador, eliminarCoordinador, guardarCoordinador } from "@/app/acciones";
import { Aviso, Modal } from "@/components/Modal";
import { Encabezado } from "@/components/panel/Encabezado";
import { formatoTelefono, iniciales } from "@/lib/formato";
import type { Coordinador } from "@/lib/tipos";

type Dialogo = { tipo: "editar"; c: Coordinador | null } | { tipo: "clave"; c: Coordinador } | { tipo: "eliminar"; c: Coordinador } | null;

export function VistaCoordinadores({ lista }: { lista: Coordinador[] }) {
  const router = useRouter();
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const cerrar = () => setDialogo(null);
  const listo = () => {
    router.refresh();
    cerrar();
  };

  return (
    <>
      <Encabezado titulo="Coordinadores" descripcion="Crea las cuentas de quienes registrarán votantes.">
        <button onClick={() => setDialogo({ tipo: "editar", c: null })} className="btn-primary">
          <Plus className="size-4" /> Nuevo coordinador
        </button>
      </Encabezado>

      {lista.length === 0 ? (
        <div className="card flex flex-col items-center p-12 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-prm-50 text-prm-600"><UserCog className="size-7" /></span>
          <p className="mt-4 font-bold text-slate-800">Todavía no hay coordinadores</p>
          <p className="mt-1 text-sm text-slate-500">Crea el primero para que empiece a registrar votantes.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((c) => (
            <div key={c.id} className="card flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-prm-700 to-prm-500 font-extrabold text-white">
                  {iniciales(c.nombre) || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{c.nombre}</p>
                  <p className="text-sm text-slate-500">@{c.usuario}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.activo ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                {c.telefono && <p className="flex items-center gap-2"><Phone className="size-3.5 text-prm-500" /> {formatoTelefono(c.telefono)}</p>}
                {c.email && <p className="flex items-center gap-2 truncate"><Mail className="size-3.5 text-prm-500" /> {c.email}</p>}
                <Link href={`/panel/votantes?coordinador=${c.id}`} className="flex items-center gap-2 font-semibold text-prm-700 hover:underline">
                  <UsersRound className="size-3.5" /> {c.votantes.toLocaleString("es-DO")} votantes registrados
                </Link>
              </div>
              <div className="mt-auto flex gap-1.5 border-t border-slate-100 pt-4">
                <button onClick={() => setDialogo({ tipo: "editar", c })} className="btn-light flex-1 px-2 py-2 text-xs"><Pencil className="size-3.5" /> Editar</button>
                <button onClick={() => setDialogo({ tipo: "clave", c })} className="btn-light flex-1 px-2 py-2 text-xs"><KeyRound className="size-3.5" /> Contraseña</button>
                <button onClick={() => setDialogo({ tipo: "eliminar", c })} className="btn-light px-2.5 py-2 text-red-600" title="Eliminar"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal abierto={dialogo?.tipo === "editar"} titulo={dialogo?.tipo === "editar" && dialogo.c ? "Editar coordinador" : "Nuevo coordinador"} onCerrar={cerrar}>
        {dialogo?.tipo === "editar" && <FormCoordinador c={dialogo.c} onListo={listo} />}
      </Modal>
      <Modal abierto={dialogo?.tipo === "clave"} titulo="Cambiar contraseña" subtitulo={dialogo?.c?.nombre} onCerrar={cerrar} ancho="max-w-md">
        {dialogo?.tipo === "clave" && <FormClave c={dialogo.c} onListo={listo} />}
      </Modal>
      <Modal abierto={dialogo?.tipo === "eliminar"} titulo="Eliminar coordinador" onCerrar={cerrar} ancho="max-w-md">
        {dialogo?.tipo === "eliminar" && <ConfirmarEliminar c={dialogo.c} onListo={listo} onCancelar={cerrar} />}
      </Modal>
    </>
  );
}

function FormCoordinador({ c, onListo }: { c: Coordinador | null; onListo: () => void }) {
  const [d, setD] = useState({ nombre: c?.nombre ?? "", usuario: c?.usuario ?? "", telefono: c?.telefono ?? "", email: c?.email ?? "", activo: c?.activo ?? true, clave: "" });
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        iniciar(async () => {
          const r = await guardarCoordinador(c?.id ?? null, { ...d, clave: c ? undefined : d.clave });
          if (r.ok) onListo();
          else setError(r.error);
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">Nombre completo *</label>
          <input className="input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required autoFocus />
        </div>
        <div>
          <label className="label">Usuario *</label>
          <input className="input" value={d.usuario} onChange={(e) => setD({ ...d, usuario: e.target.value.replace(/\s/g, "").toLowerCase() })} required />
        </div>
        <div>
          <label className="label">Teléfono</label>
          <input className="input" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
        </div>
        <div className={c ? "sm:col-span-2" : ""}>
          <label className="label">Correo</label>
          <input className="input" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </div>
        {!c && (
          <div>
            <label className="label">Contraseña *</label>
            <input className="input" type="text" minLength={6} value={d.clave} onChange={(e) => setD({ ...d, clave: e.target.value })} required placeholder="Mínimo 6 caracteres" />
          </div>
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <input type="checkbox" className="size-4 accent-prm-700" checked={d.activo} onChange={(e) => setD({ ...d, activo: e.target.checked })} />
        <span><b>Cuenta activa</b> — si la desactivas, no podrá iniciar sesión.</span>
      </label>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex justify-end">
        <button disabled={cargando} className="btn-primary">
          {cargando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar
        </button>
      </div>
    </form>
  );
}

function FormClave({ c, onListo }: { c: Coordinador; onListo: () => void }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await claveCoordinador(c.id, clave);
          if (r.ok) onListo();
          else setError(r.error);
        });
      }}
      className="space-y-4"
    >
      <div>
        <label className="label">Nueva contraseña</label>
        <input className="input" minLength={6} value={clave} onChange={(e) => setClave(e.target.value)} required autoFocus placeholder="Mínimo 6 caracteres" />
        <p className="mt-1.5 text-xs text-slate-500">Se cerrarán las sesiones abiertas de {c.nombre}.</p>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex justify-end">
        <button disabled={cargando} className="btn-primary">{cargando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Cambiar</button>
      </div>
    </form>
  );
}

function ConfirmarEliminar({ c, onListo, onCancelar }: { c: Coordinador; onListo: () => void; onCancelar: () => void }) {
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        ¿Eliminar la cuenta de <b className="text-slate-900">{c.nombre}</b>?
        {c.votantes > 0 && <> Sus <b>{c.votantes}</b> votantes registrados pasarán a tu cuenta de administrador para no perderlos.</>}
      </p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancelar} className="btn-light">Cancelar</button>
        <button
          disabled={cargando}
          onClick={() =>
            iniciar(async () => {
              const r = await eliminarCoordinador(c.id);
              if (r.ok) onListo();
              else setError(r.error);
            })
          }
          className="btn-danger"
        >
          {cargando ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Eliminar
        </button>
      </div>
    </div>
  );
}
