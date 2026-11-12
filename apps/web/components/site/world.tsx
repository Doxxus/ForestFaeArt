import type { ReactNode } from "react";
import { Kit, Scene } from "./kit";

/**
 * The scene behind every public page: sky, three layers of hills, trunks and grass that rise at different speeds as you scroll,
 * evening coming on, and a small pool of leaves and insects drifting past. All CSS (world.css). Where the browser can't do
 * scroll-driven animation, or the visitor asked for reduced motion, it is the same scene standing still.
 */
export function World() {
  return (
    <>
      <div className="world" aria-hidden="true">
        <Scene name="far" className="world-layer world-far" eager />
        <Scene name="mid" className="world-layer world-mid" eager />
        <div className="world-dusk" />
        <Scene name="near" className="world-layer world-near" eager />
      </div>
      <div className="world-air" aria-hidden="true">
        <span className="leaf leaf-1"><Scene name="leaf-long" /></span>
        <span className="leaf leaf-2"><Scene name="leaf-gold" /></span>
        <span className="leaf leaf-3"><Scene name="leaf-round" /></span>
        <span className="leaf leaf-4"><Scene name="leaf-long" /></span>
        <span className="leaf leaf-5"><Scene name="leaf-gold" /></span>
        <span className="insect insect-1"><span className="insect-turn"><Kit name="swallowtail" /></span></span>
        <span className="insect insect-2"><span className="insect-turn"><Kit name="dragonfly" /></span></span>
      </div>
    </>
  );
}

/**
 * A page says how much of the scene it wants. The home page asks for "full"; everything else is "calm" without saying so.
 * The marker is read by CSS (:has), so the scene itself never remounts when you move between pages.
 */
export function WorldLevel({ level }: { level: "full" }) {
  return <span hidden data-world-level={level} />;
}

export type SproutKind = "cluster" | "tall" | "ring";
export interface SproutSpec {
  kind: SproutKind;
  at: "left" | "center" | "right";
  /** Also shown on a phone. Most are not, to keep small screens light. */
  mobile?: boolean;
}

/** A toadstool that grows out of the top edge of whatever it is placed in, as it scrolls into view. */
export function Sprout({ kind, at, mobile }: SproutSpec) {
  return (
    <span className={`sprout sprout-${kind} sprout-${at}${mobile ? " sprout-mobile" : ""}`} aria-hidden="true">
      <Scene name={`sprout-${kind}`} />
    </span>
  );
}

const SIZES = { xl: "max-w-xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", "6xl": "max-w-6xl" } as const;

/**
 * A frosted cream panel for reading on, sitting in front of the scene. The text inside always has solid-enough cream behind it.
 * Pass `sprout` to have a toadstool growing out of its top edge.
 */
export function Panel({
  as: Tag = "div",
  size = "6xl",
  sprout,
  className = "",
  children,
  ...rest
}: {
  as?: "div" | "section";
  size?: keyof typeof SIZES;
  sprout?: SproutSpec | SproutSpec[];
  className?: string;
  children: ReactNode;
  id?: string;
  "aria-labelledby"?: string;
}) {
  const sprouts = sprout ? (Array.isArray(sprout) ? sprout : [sprout]) : [];
  return (
    <div className={`panel-wrap ${SIZES[size]}`}>
      {sprouts.map((s) => (
        <Sprout key={`${s.kind}-${s.at}`} {...s} />
      ))}
      <Tag className={`panel ${className}`} {...rest}>
        {children}
      </Tag>
    </div>
  );
}
