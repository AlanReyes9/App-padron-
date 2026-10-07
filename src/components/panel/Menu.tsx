"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Globe, LayoutDashboard, LogOut, MapPinned, Menu as IconoMenu, Settings, UserCog, UsersRound, X } from "lucide-react";
import { cerrarSesion } from "@/app/acciones";
import { Logo } from "@/components/Marca";
import type { Config, Usuario } from "@/lib/tipos";

export function Menu({ cfg, usuario }: { cfg: Config; usuario: Usuario }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const admin = usuario.rol === "admin";

  const enlaces = [
    { href: "/panel", t: "Inicio", i: LayoutDashboard },
    { href: "/panel/votantes", t: admin ? "Padrón general" : "Mis votantes", i: UsersRound },
    ...(admin
      ? [
          { href: "/panel/coordinadores", t: "Coordinadores", i: UserCog },
          { href: "/panel/sectores", t: "Sectores", i: MapPinned },
          { href: "/panel/configuracion", t: "Configuración", i: Settings },
        ]
      : []),
    { href: "/panel/perfil", t: "Mi perfil", i: UserCog },
  ];

  const contenido = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo cfg={cfg} size={42} />
        <div className="min-w-0 leading-tight">
          <p className="truncate font-extrabold text-white">{cfg.nombre_org}</p>
          <p className="truncate text-xs text-prm-200">{cfg.lema}</p>
        </div>
      </div>
      <nav className="mt-2 flex-1 space-y-1 px-3">
        {enlaces.map(({ href, t, i: Icono }) => {
          const activo = href === "/panel" ? ruta === href : ruta.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setAbierto(false)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                activo ? "bg-white text-prm-800 shadow-lg shadow-black/10" : "text-prm-100 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icono className="size-[18px]" /> {t}
            </Link>
          );
        })}
        <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-prm-100 hover:bg-white/10 hover:text-white">
          <Globe className="size-[18px]" /> Ver página pública
        </Link>
      </nav>
      <div className="m-3 rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
        <p className="truncate text-sm font-bold text-white">{usuario.nombre}</p>
        <p className="text-xs text-prm-200">{admin ? "Administrador" : "Coordinador"} · @{usuario.usuario}</p>
        <form action={cerrarSesion}>
          <button className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white/10 py-2 text-xs font-semibold text-white hover:bg-white/20">
            <LogOut className="size-3.5" /> Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="bg-hero sticky top-0 z-40 flex items-center justify-between px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logo cfg={cfg} size={34} />
          <span className="font-bold text-white">{cfg.nombre_org}</span>
        </div>
        <button onClick={() => setAbierto(true)} className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Abrir menú">
          <IconoMenu className="size-5" />
        </button>
      </div>
      <aside className="bg-hero fixed inset-y-0 left-0 z-30 hidden w-68 lg:block">{contenido}</aside>
      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-prm-950/60" onClick={() => setAbierto(false)} />
          <aside className="bg-hero relative h-full w-72 shadow-2xl">
            <button onClick={() => setAbierto(false)} className="absolute top-5 right-3 rounded-lg p-1.5 text-white/80 hover:bg-white/10" aria-label="Cerrar menú">
              <X className="size-5" />
            </button>
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
