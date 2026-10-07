import { iniciales } from "@/lib/formato";
import type { Config } from "@/lib/tipos";

/** Logo del comité (o sus iniciales si aún no se ha subido un logo). */
export function Logo({ cfg, size = 44, className = "" }: { cfg: Config; size?: number; className?: string }) {
  if (cfg.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cfg.logo}
        alt={cfg.nombre_org}
        width={size}
        height={size}
        className={`shrink-0 rounded-xl bg-white object-contain p-1 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl bg-white font-extrabold tracking-tight text-prm-800 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {iniciales(cfg.nombre_org) || "CB"}
    </span>
  );
}
