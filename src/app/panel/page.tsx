import Link from "next/link";
import { CalendarCheck, FileSpreadsheet, MapPinned, Plus, UserCog, UsersRound } from "lucide-react";
import { rpc } from "@/lib/api";
import { requerirUsuario, token } from "@/lib/sesion";
import { Encabezado } from "@/components/panel/Encabezado";
import type { Resumen } from "@/lib/tipos";

export default async function PanelInicio() {
  const usuario = await requerirUsuario();
  const r = await rpc<Resumen>("fn_resumen", { p_token: await token() });
  const admin = usuario.rol === "admin";
  const maxProv = Math.max(1, ...r.por_provincia.map((p) => p.total));
  const maxCoord = Math.max(1, ...r.por_coordinador.map((p) => p.total));

  return (
    <>
      <Encabezado titulo={`¡Hola, ${usuario.nombre.split(" ")[0]}!`} descripcion={admin ? "Resumen general del padrón del comité." : "Resumen de tu trabajo de registro."}>
        <Link href="/panel/votantes?nuevo=1" className="btn-primary">
          <Plus className="size-4" /> Registrar votante
        </Link>
      </Encabezado>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tarjeta icono={<UsersRound />} titulo={admin ? "Votantes registrados" : "Mis votantes"} valor={r.total} acento />
        <Tarjeta icono={<CalendarCheck />} titulo="Registrados hoy" valor={r.hoy} />
        {admin ? (
          <Tarjeta icono={<UserCog />} titulo="Coordinadores" valor={r.coordinadores} />
        ) : (
          <Link href="/api/exportar" className="card group flex items-center gap-4 p-5 transition hover:border-prm-300">
            <span className="grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <FileSpreadsheet />
            </span>
            <div>
              <p className="font-bold text-slate-900 group-hover:text-prm-700">Descargar mi padrón</p>
              <p className="text-sm text-slate-500">Archivo Excel listo para imprimir</p>
            </div>
          </Link>
        )}
      </div>

      <div className={`mt-6 grid gap-6 ${admin ? "lg:grid-cols-2" : ""}`}>
        <Barras titulo="Votantes por provincia" icono={<MapPinned className="size-4" />} datos={r.por_provincia.map((p) => ({ n: p.provincia, v: p.total }))} max={maxProv} />
        {admin && <Barras titulo="Top coordinadores" icono={<UserCog className="size-4" />} datos={r.por_coordinador.map((p) => ({ n: p.nombre, v: p.total }))} max={maxCoord} />}
      </div>
    </>
  );
}

function Tarjeta({ icono, titulo, valor, acento }: { icono: React.ReactNode; titulo: string; valor: number; acento?: boolean }) {
  return (
    <div className={`card flex items-center gap-4 p-5 ${acento ? "bg-hero border-0 text-white" : ""}`}>
      <span className={`grid size-12 place-items-center rounded-2xl ${acento ? "bg-white/15 text-white" : "bg-prm-50 text-prm-700 ring-1 ring-prm-100"}`}>{icono}</span>
      <div>
        <p className={`text-sm font-medium ${acento ? "text-prm-100" : "text-slate-500"}`}>{titulo}</p>
        <p className="text-3xl font-extrabold tabular-nums">{valor.toLocaleString("es-DO")}</p>
      </div>
    </div>
  );
}

function Barras({ titulo, icono, datos, max }: { titulo: string; icono: React.ReactNode; datos: { n: string; v: number }[]; max: number }) {
  return (
    <div className="card p-6">
      <h2 className="flex items-center gap-2 font-bold text-slate-900">
        <span className="text-prm-600">{icono}</span> {titulo}
      </h2>
      {datos.length === 0 ? (
        <p className="mt-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Aún no hay datos para mostrar.</p>
      ) : (
        <ul className="mt-5 space-y-3.5">
          {datos.map((d) => (
            <li key={d.n}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium text-slate-700">{d.n}</span>
                <span className="font-bold text-prm-800 tabular-nums">{d.v.toLocaleString("es-DO")}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-prm-50">
                <div className="h-full rounded-full bg-gradient-to-r from-prm-700 to-oro" style={{ width: `${(d.v / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
