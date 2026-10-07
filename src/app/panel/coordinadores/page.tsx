import { rpc } from "@/lib/api";
import { requerirAdmin, token } from "@/lib/sesion";
import { VistaCoordinadores } from "@/components/panel/VistaCoordinadores";
import type { Coordinador } from "@/lib/tipos";

export default async function Coordinadores() {
  await requerirAdmin();
  const lista = await rpc<Coordinador[]>("fn_coordinadores", { p_token: await token() });
  return <VistaCoordinadores lista={lista} />;
}
