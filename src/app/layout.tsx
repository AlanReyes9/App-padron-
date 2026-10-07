import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { configPublica } from "@/lib/api";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await configPublica();
  return {
    title: `${cfg.nombre_org} · Padrón`,
    description: "Sistema de registro de simpatizantes para movimientos y comités de base.",
  };
}

export const viewport: Viewport = { themeColor: "#00478e" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${jakarta.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
