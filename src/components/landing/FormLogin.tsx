"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { iniciarSesion } from "@/app/acciones";
import { Aviso } from "@/components/Modal";

export function FormLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState("");
  const [cargando, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    iniciar(async () => {
      const r = await iniciarSesion(usuario, clave);
      if (r.ok) router.push("/panel");
      else setError(r.error);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label className="label" htmlFor="usuario">Usuario</label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <input id="usuario" className="input pl-10" autoComplete="username" value={usuario} onChange={(e) => setUsuario(e.target.value)} required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="clave">Contraseña</label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400" />
          <input
            id="clave"
            type={ver ? "text" : "password"}
            className="input pr-10 pl-10"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />
          <button type="button" onClick={() => setVer((v) => !v)} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Mostrar contraseña">
            {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <button disabled={cargando} className="btn-primary w-full py-3">
        {cargando ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        Entrar al sistema
      </button>
    </form>
  );
}
