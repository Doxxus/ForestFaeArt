"use client";

/** Opens the browser's print box. The guide pages hide the menus when printed (see globals.css). */
export function PrintButton({ label = "Print this page" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="no-print inline-flex min-h-11 items-center rounded-lg border border-forest px-4 py-2 font-medium text-forest hover:bg-parchment">
      {label}
    </button>
  );
}
