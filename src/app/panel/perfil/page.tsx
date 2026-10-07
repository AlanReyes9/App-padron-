import { requerirUsuario } from "@/lib/sesion";
import { Encabezado } from "@/components/panel/Encabezado";
import { FormClavePropia, FormPerfil } from "@/components/panel/FormPerfil";

export default async function Perfil() {
  const u = await requerirUsuario();
  return (
    <>
      <Encabezado titulo="Mi perfil" descripcion="Actualiza tus datos y tu contraseña." />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormPerfil u={u} />
        <FormClavePropia />
      </div>
    </>
  );
}
