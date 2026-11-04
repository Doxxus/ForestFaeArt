import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

// ---- buttons ----

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-base font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_VARIANTS = {
  primary: "bg-forest text-cream hover:bg-moss",
  secondary: "border border-forest bg-transparent text-forest hover:bg-parchment",
  danger: "bg-danger text-cream hover:opacity-90",
  ghost: "text-forest hover:bg-parchment",
} as const;
export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export const buttonClass = (variant: ButtonVariant = "primary", extra?: string) => cx(BUTTON_BASE, BUTTON_VARIANTS[variant], extra);

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button {...props} className={buttonClass(variant, className)} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link {...props} className={buttonClass(variant, className)} />;
}

// ---- layout ----

export function PageHeader({ title, children, intro }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl text-forest">{title}</h1>
        {intro ? <p className="mt-1 max-w-prose text-moss">{intro}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function Card({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-stone bg-parchment p-4 sm:p-5", className)}>
      {title ? <h2 className="mb-3 font-display text-xl text-forest">{title}</h2> : null}
      {children}
    </section>
  );
}

// ---- messages ----

const ALERT_TONES = {
  info: "border-stone bg-parchment text-ink",
  success: "border-moss bg-okbg text-forest",
  error: "border-danger bg-dangerbg text-danger",
} as const;

export function Alert({ tone = "info", children }: { tone?: keyof typeof ALERT_TONES; children: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("mb-4 rounded-lg border px-4 py-3", ALERT_TONES[tone])}>
      {children}
    </div>
  );
}

/** Shows `?saved=` and `?error=` from the address after a form action redirects back. */
export function Flash({ saved, error }: { saved?: string; error?: string }) {
  return (
    <>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saved ? <Alert tone="success">{saved === "1" ? "Saved." : saved}</Alert> : null}
    </>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: ReactNode }) {
  const tones = {
    neutral: "bg-stone text-ink",
    good: "bg-okbg text-forest",
    warn: "bg-champagne text-copperdeep",
    bad: "bg-dangerbg text-danger",
  } as const;
  return <span className={cx("inline-block rounded-full px-2.5 py-0.5 text-sm font-medium", tones[tone])}>{children}</span>;
}

// ---- form fields ----

const INPUT = "block w-full min-h-11 rounded-lg border border-stone bg-cream px-3 py-2 text-base text-ink placeholder:text-moss/70";

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1 block font-medium text-forest">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-sm text-moss">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(INPUT, className)} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(INPUT, "min-h-28", className)} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={cx(INPUT, className)} />;
}

export function Checkbox({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="mb-3 flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" {...props} className="mt-1 size-5 shrink-0 accent-forest" />
      <span>
        <span className="font-medium text-forest">{label}</span>
        {hint ? <span className="block text-sm text-moss">{hint}</span> : null}
      </span>
    </label>
  );
}

// ---- tables ----

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone">
      <table className="w-full min-w-[32rem] border-collapse text-left">{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cx("border-b border-stone bg-parchment px-3 py-2 text-sm font-semibold text-forest", className)}>
    {children}
  </th>
);
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <td className={cx("border-b border-stone/60 px-3 py-2 align-middle", className)}>{children}</td>
);

export { cx };
