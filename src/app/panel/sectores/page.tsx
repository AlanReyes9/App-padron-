import { sectores } from "@/lib/api";
import { requerirAdmin } from "@/lib/sesion";
import { VistaSectores } from "@/components/panel/VistaSectores";

export default async function Sectores() {
  await requerirAdmin();
  return <VistaSectores sectores={await sectores()} />;
}
