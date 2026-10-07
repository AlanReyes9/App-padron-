"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, Save, Trash2 } from "lucide-react";
import { guardarConfig } from "@/app/acciones";
import { Aviso } from "@/components/Modal";
import { Logo } from "@/components/Marca";
import type { Config } from "@/lib/tipos";

/** Convierte la imagen a PNG de máx. 512px para guardarla y usarla en el Excel. */
function aPng(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const max = 512;
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/png"));
    };
    img.onerror = () => mal(new Error("Imagen no válida"));
    img.src = URL.createObjectURL(archivo);
  });
}

export function FormConfig({ cfg }: { cfg: Config }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(cfg.nombre_org);
  const [lema, setLema] = useState(cfg.lema);
  const [logo, setLogo] = useState<string | null>(cfg.logo);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; t: string } | null>(null);
  const [cargando, iniciar] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setLogo(await aPng(f));
    } catch {
      setMsg({ tipo: "error", t: "No se pudo leer la imagen. Usa PNG, JPG o SVG." });
    }
    e.target.value = "";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        iniciar(async () => {
          const r = await guardarConfig(nombre, lema, logo);
          if (r.ok) {
            setMsg({ tipo: "ok", t: "Configuración guardada." });
            router.refresh();
          } else setMsg({ tipo: "error", t: r.error });
        });
      }}
      className="grid gap-6 lg:grid-cols-[1fr_380px]"
    >
      <div className="card space-y-5 p-6">
        <div>
          <label className="label">Nombre del movimiento o comité *</label>
          <input className="input text-base font-semibold" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div>
          <label className="label">Lema o subtítulo</label>
          <input className="input" value={lema} onChange={(e) => setLema(e.target.value)} placeholder="Ej.: Comité de Base · Circunscripción 1" />
        </div>
        <div>
          <label className="label">Logo</label>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 p-4">
            <Logo cfg={{ nombre_org: nombre, lema, logo }} size={80} className="ring-1 ring-slate-200" />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => archivo.current?.click()} className="btn-light">
                <ImageUp className="size-4" /> Subir logo
              </button>
              {logo && (
                <button type="button" onClick={() => setLogo(null)} className="btn-light text-red-600">
                  <Trash2 className="size-4" /> Quitar
                </button>
              )}
            </div>
            <input ref={archivo} type="file" accept="image/*" className="hidden" onChange={elegir} />
            <p className="w-full text-xs text-slate-500">Recomendado: PNG con fondo transparente. Se ajusta automáticamente.</p>
          </div>
        </div>
        {msg && <Aviso tipo={msg.tipo}>{msg.t}</Aviso>}
        <div className="flex justify-end">
          <button disabled={cargando} className="btn-primary">
            {cargando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar configuración
          </button>
        </div>
      </div>

      <div>
        <p className="label">Vista previa del encabezado del padrón</p>
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 bg-prm-900 p-4 text-white">
            <Logo cfg={{ nombre_org: nombre, lema, logo }} size={52} />
            <div>
              <p className="font-extrabold uppercase">{nombre || "Nombre del comité"}</p>
              <p className="text-xs text-prm-200">{lema}</p>
            </div>
          </div>
          <div className="bg-celeste px-4 py-1.5 text-center text-xs font-bold tracking-widest text-prm-950">PADRÓN ELECTORAL</div>
          <div className="space-y-1.5 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-3 rounded ${i % 2 ? "bg-slate-100" : "bg-prm-50"}`} />
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
