import type { CSSProperties } from "react";
import { KIT, type KitName } from "@/lib/kit-manifest";
import { SCENE, type SceneName } from "@/lib/scene-manifest";

/**
 * Art for the public site's green world (ADR 012). Files live in public/scene and are made by `pnpm --filter @ffa/ui kit`.
 * Always decorative: hidden from screen readers, never focusable, and sized from the manifest so nothing jumps.
 */
export function Scene({ name, className, style, eager }: { name: SceneName; className?: string; style?: CSSProperties; eager?: boolean }) {
  const { width, height } = SCENE[name];
  return <img src={`/scene/${name}.svg`} alt="" aria-hidden="true" width={width} height={height} loading={eager ? "eager" : "lazy"} decoding="async" className={className} style={style} />;
}

/**
 * Decorative art from the SVG kit (UX-2, UX-9). Files live in public/kit and are made by `pnpm --filter @ffa/ui kit`.
 * Always hidden from screen readers, lazy, and cacheable. Pass `eager` only for art above the fold.
 * The size comes from the manifest, so the browser reserves the right space and nothing jumps (CLS).
 */
export function Kit({ name, className, style, eager }: { name: KitName; className?: string; style?: CSSProperties; eager?: boolean }) {
  const { width, height } = KIT[name];
  return <img src={`/kit/${name}.svg`} alt="" aria-hidden="true" width={width} height={height} loading={eager ? "eager" : "lazy"} decoding="async" className={className} style={style} />;
}

/** The small geometric moth (ADR 005). Used beside the name in the header and anywhere a compact mark is needed. */
export function MothMark({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="-110 -110 220 220" aria-hidden="true" className={className}>
      <g>
        <g fill="#2F4A3A" transform="rotate(-36)"><path d="M0 0Q75 52 150 0Q75 -52 0 0Z" /></g>
        <g fill="#B4733A" transform="rotate(38)"><path d="M0 0Q59 46 118 0Q59 -46 0 0Z" /></g>
        <path d="M5 -50C16 -78 34 -92 54 -96" fill="none" stroke="#2F4A3A" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g transform="scale(-1 1)">
        <g fill="#2F4A3A" transform="rotate(-36)"><path d="M0 0Q75 52 150 0Q75 -52 0 0Z" /></g>
        <g fill="#B4733A" transform="rotate(38)"><path d="M0 0Q59 46 118 0Q59 -46 0 0Z" /></g>
        <path d="M5 -50C16 -78 34 -92 54 -96" fill="none" stroke="#2F4A3A" strokeWidth="5" strokeLinecap="round" />
      </g>
      <path transform="translate(0 -64) rotate(90)" d="M0 0Q65 11 130 0Q65 -11 0 0Z" fill="#2B1E16" />
    </svg>
  );
}
