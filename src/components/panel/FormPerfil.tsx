"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Save, UserRound } from "lucide-react";
import { cambiarClave, guardarPerfil } from "@/app/acciones";
import { Aviso } from "@/components/Modal";
import type { Usuario } from "@/lib/tipos";

export function FormPerfil({ u }: { u: Usuario }) {
  const router = useRouter();
  const [d, setD] = useState({ nombre: u.nombre, usuario: u.usuario, telefono: u.telefono ?? "", email: u.email ?? "" });
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; t: string } | null>(null);
  const [cargando, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await guardarPerfil(d.nombre, d.usuario, d.telefono, d.email);
          setMsg(r.ok ? { tipo: "ok", t: "Perfil actualizado." } : { tipo: "error", t: r.error });
          if (r.ok) router.refresh();
        });
      }}
      className="card space-y-4 p-6"
    >
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><UserRound className="size-4 text-prm-600" /> Datos personales</h2>
      <div>
        <label className="label">Nombre completo</label>
        <input className="input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required />
      </div>
      <div>
        <label className="label">Usuario</label>
        <input className="input" value={d.usuario} onChange={(e) => setD({ ...d, usuario: e.target.value.replace(/\s/g, "").toLowerCase() })} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Teléfono</label>
          <input className="input" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} />
        </div>
        <div>
          <label className="label">Correo</label>
          <input className="input" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
        </div>
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}
      <div className="flex justify-end">
        <button disabled={cargando} className="btn-primary">{cargando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar</button>
      </div>
    </form>
  );
}

export function FormClavePropia() {
  const [d, setD] = useState({ actual: "", nueva: "", repetir: "" });
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; t: string } | null>(null);
  const [cargando, iniciar] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (d.nueva !== d.repetir) return setMsg({ tipo: "error", t: "Las contraseñas nuevas no coinciden." });
        iniciar(async () => {
          const r = await cambiarClave(d.actual, d.nueva);
          setMsg(r.ok ? { tipo: "ok", t: "Contraseña cambiada correctamente." } : { tipo: "error", t: r.error });
          if (r.ok) setD({ actual: "", nueva: "", repetir: "" });
        });
      }}
      className="card space-y-4 p-6"
    >
      <h2 className="flex items-center gap-2 font-bold text-slate-900"><KeyRound className="size-4 text-prm-600" /> Cambiar contraseña</h2>
      <div>
        <label className="label">Contraseña actual</label>
        <input className="input" type="password" autoComplete="current-password" value={d.actual} onChange={(e) => setD({ ...d, actual: e.target.value })} required />
      </div>
      <div>
        <label className="label">Nueva contraseña</label>
        <input className="input" type="password" autoComplete="new-password" minLength={6} value={d.nueva} onChange={(e) => setD({ ...d, nueva: e.target.value })} required />
      </div>
      <div>
        <label className="label">Repite la nueva contraseña</label>
        <input className="input" type="password" autoComplete="new-password" minLength={6} value={d.repetir} onChange={(e) => setD({ ...d, repetir: e.target.value })} required />
      </div>
      {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}
      <div className="flex justify-end">
        <button disabled={cargando} className="btn-primary">{cargando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Cambiar contraseña</button>
      </div>
    </form>
  );
}
