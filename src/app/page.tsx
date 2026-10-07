import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { configPublica } from "@/lib/api";
import { usuarioActual } from "@/lib/sesion";
import { Logo } from "@/components/Marca";
import { BotonAcceso } from "@/components/landing/BotonAcceso";
import { BuscadorCedula } from "@/components/landing/BuscadorCedula";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const [cfg, usuario] = await Promise.all([configPublica(), usuarioActual()]);

  return (
    <main className="bg-hero relative flex min-h-screen flex-col overflow-hidden text-white">
      <div className="bg-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="absolute -top-24 -right-24 size-96 rounded-full bg-oro/20 blur-3xl" />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo cfg={cfg} size={48} className="shadow-lg shadow-black/20" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-lg font-extrabold">{cfg.nombre_org}</p>
            <p className="truncate text-xs font-medium text-prm-200">{cfg.lema}</p>
          </div>
        </div>
        {usuario ? (
          <Link href="/panel" className="btn shrink-0 bg-white text-prm-800 hover:bg-prm-50">
            <LayoutDashboard className="size-4" /> Ir al panel
          </Link>
        ) : (
          <BotonAcceso nombreOrg={cfg.nombre_org} />
        )}
      </header>

      <section className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-12 text-center">
        <Logo cfg={cfg} size={96} className="mx-auto mb-6 shadow-2xl shadow-black/30" />
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
          Consulta si estás en <span className="bg-gradient-to-r from-oro to-white bg-clip-text text-transparent">nuestro padrón</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-prm-100 sm:text-lg">
          Escribe tu número de cédula y verifica tus datos de registro, tu sector, tu circunscripción y el coordinador que te inscribió.
        </p>
        <div className="mt-8 text-left">
          <BuscadorCedula />
        </div>
      </section>

      <footer className="relative px-5 py-5 text-center text-xs text-prm-200">
        {cfg.nombre_org} · {new Date().getFullYear()} · Los datos personales se usan solo para fines de organización interna.
      </footer>
    </main>
  );
}
