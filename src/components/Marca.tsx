import type { Config } from "@/lib/tipos";

export const LOGO_PRM = "/logo-prm.png";

/** Logo subido por el administrador o, si no hay, el logo del PRM. */
export function Logo({ cfg, size = 44, className = "" }: { cfg: Config; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cfg.logo ?? LOGO_PRM}
      alt={cfg.nombre_org}
      width={size}
      height={size}
      className={`shrink-0 object-contain ${cfg.logo ? "rounded-xl bg-white p-1" : "rounded-full"} ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
