import Link from "next/link";
import { LayoutDashboard, LogIn, UsersRound } from "lucide-react";
import { configPublica } from "@/lib/api";
import { usuarioActual } from "@/lib/sesion";
import { Logo } from "@/components/Marca";
import { BuscadorCedula } from "@/components/landing/BuscadorCedula";
import { FormLogin } from "@/components/landing/FormLogin";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const [cfg, usuario] = await Promise.all([configPublica(), usuarioActual()]);

  return (
    <main className="min-h-screen">
      <section className="bg-hero relative overflow-hidden text-white">
        <div className="bg-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute -top-24 -right-24 size-96 rounded-full bg-celeste/20 blur-3xl" />

        <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <Logo cfg={cfg} size={48} className="shadow-lg shadow-black/20" />
            <div className="leading-tight">
              <p className="text-lg font-extrabold">{cfg.nombre_org}</p>
              <p className="text-xs font-medium text-prm-200">{cfg.lema}</p>
            </div>
          </div>
          {usuario ? (
            <Link href="/panel" className="btn bg-white text-prm-800 hover:bg-prm-50">
              <LayoutDashboard className="size-4" /> Ir al panel
            </Link>
          ) : (
            <a href="#acceso" className="btn bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20">
              <LogIn className="size-4" /> <span className="hidden sm:inline">Iniciar sesión</span><span className="sm:hidden">Entrar</span>
            </a>
          )}
        </header>

        <div className="relative mx-auto grid max-w-6xl items-start gap-10 px-5 pt-8 pb-20 lg:grid-cols-[1.25fr_1fr] lg:pt-14 lg:pb-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
              <span className="size-2 animate-pulse rounded-full bg-celeste" /> Padrón {new Date().getFullYear()}
            </span>
            <h1 className="mt-5 text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
              Consulta si estás en <span className="bg-gradient-to-r from-celeste to-white bg-clip-text text-transparent">nuestro padrón</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-prm-100 sm:text-lg">
              Escribe tu número de cédula y verifica tus datos de registro, tu sector, tu circunscripción y el coordinador que te
              inscribió.
            </p>
            <div className="mt-8 max-w-xl">
              <BuscadorCedula />
            </div>
          </div>

          <div id="acceso" className="scroll-mt-6">
            <div className="card relative overflow-hidden p-6 text-slate-800 sm:p-8">
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-prm-700 via-prm-500 to-celeste" />
              {usuario ? (
                <div className="space-y-4 text-center">
                  <Logo cfg={cfg} size={64} className="mx-auto ring-1 ring-slate-200" />
                  <p className="text-lg font-bold">Hola, {usuario.nombre}</p>
                  <Link href="/panel" className="btn-primary w-full py-3">
                    <LayoutDashboard className="size-4" /> Continuar al panel
                  </Link>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-extrabold text-prm-950">Acceso al sistema</h2>
                  <p className="mt-1 mb-6 text-sm text-slate-500">Para administradores y coordinadores del {cfg.nombre_org}.</p>
                  <FormLogin />
                </>
              )}
            </div>
          </div>
        </div>
        <svg className="absolute bottom-0 left-0 w-full text-[#f4f7fc]" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden>
          <path fill="currentColor" d="M0 60V30C240 0 480 0 720 20s480 40 720 10v30H0Z" />
        </svg>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500 sm:flex-row">
          <div className="flex items-center gap-2">
            <UsersRound className="size-4 text-prm-600" />
            <span>
              {cfg.nombre_org} · {new Date().getFullYear()}
            </span>
          </div>
          <span>Los datos personales se usan solo para fines de organización interna.</span>
        </div>
      </footer>
    </main>
  );
}
