import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";
import { signOutAction } from "./actions";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/labels", label: "Labels" },
  { href: "/admin/inquiries", label: "Inquiries", admin: true },
  { href: "/admin/website", label: "Website", admin: true },
  { href: "/admin/categories", label: "Categories", admin: true },
  { href: "/admin/fields", label: "Fields", admin: true },
  { href: "/admin/import", label: "Import", admin: true },
  { href: "/admin/users", label: "Users", admin: true },
  { href: "/admin/settings", label: "Settings", admin: true },
  { href: "/", label: "View website" },
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const links = NAV.filter((item) => !("admin" in item) || user.role === "ADMIN");
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone bg-forest text-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-display text-xl text-champagne">
            Forest Fae Folk Art
          </Link>
          {/* A details menu on small screens needs no JavaScript. */}
          <nav aria-label="Main" className="hidden flex-wrap gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-3 py-2 hover:bg-moss">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-champagne sm:inline">
              {user.name} ({user.role === "ADMIN" ? "Administrator" : "Staff"})
            </span>
            <form action={signOutAction}>
              <button type="submit" className="min-h-10 rounded-lg px-3 text-cream hover:bg-moss">
                Sign out
              </button>
            </form>
          </div>
          <details className="w-full md:hidden">
            <summary className="cursor-pointer rounded-md px-1 py-2">Menu</summary>
            <nav aria-label="Main" className="flex flex-col pb-2">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded-md px-3 py-3 hover:bg-moss">
                  {l.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
