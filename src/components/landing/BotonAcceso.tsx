"use client";

import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { Modal } from "@/components/Modal";
import { FormLogin } from "@/components/landing/FormLogin";

/** Botón "Iniciar sesión" que abre el formulario de acceso en una ventana. */
export function BotonAcceso({ nombreOrg }: { nombreOrg: string }) {
  const [abierto, setAbierto] = useState(false);

  // Las páginas protegidas redirigen a /?login=1 cuando la sesión expira
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("login") === "1") setAbierto(true);
  }, []);

  return (
    <>
      <button onClick={() => setAbierto(true)} className="btn shrink-0 whitespace-nowrap bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20">
        <LogIn className="size-4" /> <span className="hidden sm:inline">Iniciar sesión</span><span className="sm:hidden">Entrar</span>
      </button>
      <Modal abierto={abierto} titulo="Acceso al sistema" subtitulo={`Para administradores y coordinadores del ${nombreOrg}.`} onCerrar={() => setAbierto(false)} ancho="max-w-md">
        <FormLogin />
      </Modal>
    </>
  );
}
