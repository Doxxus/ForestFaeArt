import type { SiteSettings } from "@/lib/site";
import { Kit } from "./kit";

// Positions are fixed (not random) so the server and browser always agree and the layout never jumps.
const POLLEN = [
  { l: "8%", b: "12%", s: 5, t: "15s", d: "0s", dx: "24px" },
  { l: "18%", b: "30%", s: 4, t: "18s", d: "3s", dx: "-18px" },
  { l: "29%", b: "8%", s: 6, t: "13s", d: "7s", dx: "30px" },
  { l: "41%", b: "22%", s: 4, t: "17s", d: "1s", dx: "-26px" },
  { l: "52%", b: "6%", s: 5, t: "16s", d: "9s", dx: "20px" },
  { l: "63%", b: "26%", s: 3, t: "19s", d: "5s", dx: "-14px" },
  { l: "72%", b: "10%", s: 6, t: "14s", d: "2s", dx: "28px" },
  { l: "83%", b: "24%", s: 4, t: "17s", d: "8s", dx: "-22px" },
  { l: "92%", b: "9%", s: 5, t: "15s", d: "4s", dx: "16px" },
  { l: "36%", b: "40%", s: 3, t: "20s", d: "11s", dx: "18px" },
];

/** The layered home hero (WEB-1): foil title, ornaments, ferns, drifting insects and pollen. All motion is CSS and switches off for reduced motion. */
export function Hero({ settings, children }: { settings: SiteSettings; children?: React.ReactNode }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-layer" aria-hidden="true">
        <div className="parallax-slow hero-art left-[-3%] top-[1%] w-[30%] max-w-[210px] opacity-95 sm:left-[2%] sm:top-[6%] sm:w-[21%]">
          <Kit name="luna-moth" className="drift-a h-auto w-full" style={{ ["--r" as string]: "-8deg" }} eager />
        </div>
        <div className="parallax-fast hero-art bottom-[2%] right-[-3%] w-[32%] max-w-[230px] opacity-95 sm:bottom-[8%] sm:right-[2%] sm:w-[21%]">
          <Kit name="swallowtail" className="drift-b h-auto w-full" style={{ ["--r" as string]: "9deg" }} eager />
        </div>
        <div className="parallax-slow hero-art right-[8%] top-[8%] hidden w-[8%] max-w-[100px] opacity-85 lg:block">
          <Kit name="dragonfly" className="drift-a h-auto w-full" style={{ ["--r" as string]: "14deg" }} />
        </div>
        <Kit name="fern" className="hero-art bottom-0 left-0 hidden h-auto w-36 opacity-80 sm:block lg:w-44" />
        <Kit name="fern" className="hero-art bottom-0 right-0 hidden h-auto w-36 -scale-x-100 opacity-80 lg:block lg:w-44" />
        <Kit name="corner" className="hero-art left-0 top-0 w-16 sm:w-28" eager />
        <Kit name="corner" className="hero-art right-0 top-0 w-16 -scale-x-100 sm:w-28" eager />
        {POLLEN.map((p) => (
          <span key={p.l + p.b} className="pollen" style={{ left: p.l, bottom: p.b, width: p.s, height: p.s, ["--t" as string]: p.t, ["--d" as string]: p.d, ["--dx" as string]: p.dx }} />
        ))}
      </div>
      <div className="mx-auto flex min-h-[30rem] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center sm:min-h-[34rem]">
        <h1 id="hero-title" className="foil rise font-display text-4xl uppercase leading-tight tracking-[0.1em] sm:text-5xl lg:text-6xl">
          {settings.businessName}
        </h1>
        {settings.tagline ? <p className="rise-2 mt-4 max-w-xl font-display text-xl text-forest sm:text-2xl">{settings.tagline}</p> : null}
        <div className="rise-3 mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </section>
  );
}
