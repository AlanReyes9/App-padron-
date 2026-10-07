import { rpc, sectores as cargarSectores } from "@/lib/api";
import { requerirUsuario, token } from "@/lib/sesion";
import { VistaVotantes } from "@/components/panel/VistaVotantes";
import type { Coordinador, Filtros, Votante } from "@/lib/tipos";

export default async function Votantes({ searchParams }: { searchParams: Promise<Filtros & { nuevo?: string }> }) {
  const usuario = await requerirUsuario();
  const f = await searchParams;
  const t = await token();
  const admin = usuario.rol === "admin";

  const [votantes, sectores, coordinadores] = await Promise.all([
    rpc<Votante[]>("fn_votantes", {
      p_token: t,
      p_provincia: f.provincia || null,
      p_sector: f.sector || null,
      p_circunscripcion: f.circunscripcion || null,
      p_coordinador: admin && f.coordinador ? f.coordinador : null,
      p_q: f.q || null,
    }),
    cargarSectores(),
    admin ? rpc<Coordinador[]>("fn_coordinadores", { p_token: t }) : Promise.resolve([]),
  ]);

  return (
    <VistaVotantes
      usuario={usuario}
      votantes={votantes}
      sectores={sectores}
      coordinadores={coordinadores}
      filtros={{ provincia: f.provincia, sector: f.sector, circunscripcion: f.circunscripcion, coordinador: f.coordinador, q: f.q }}
      abrirNuevo={f.nuevo === "1"}
    />
  );
}
