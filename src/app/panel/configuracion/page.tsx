import { configPublica } from "@/lib/api";
import { requerirAdmin } from "@/lib/sesion";
import { FormConfig } from "@/components/panel/FormConfig";
import { Encabezado } from "@/components/panel/Encabezado";

export default async function Configuracion() {
  await requerirAdmin();
  const cfg = await configPublica();
  return (
    <>
      <Encabezado titulo="Configuración" descripcion="Identidad del movimiento o comité. Aparece en la página pública, el panel y el padrón en Excel." />
      <FormConfig cfg={cfg} />
    </>
  );
}
