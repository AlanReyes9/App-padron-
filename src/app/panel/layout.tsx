import { configPublica } from "@/lib/api";
import { requerirUsuario } from "@/lib/sesion";
import { Menu } from "@/components/panel/Menu";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const [usuario, cfg] = await Promise.all([requerirUsuario(), configPublica()]);
  return (
    <div className="min-h-screen">
      <Menu cfg={cfg} usuario={usuario} />
      <main className="px-4 py-6 sm:px-6 lg:ml-68 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
