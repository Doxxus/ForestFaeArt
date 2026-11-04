import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, Field, Flash, Input } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";
import { loginAction } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const { error, saved } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <h1 className="mb-1 text-center font-display text-4xl text-forest">Forest Fae Folk Art</h1>
      <p className="mb-8 text-center text-moss">Sign in to manage your shop</p>
      <div className="rounded-xl border border-stone bg-parchment p-5">
        <Flash error={error} saved={saved} />
        <form action={loginAction}>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </div>
      <p className="mt-4 text-center text-sm text-moss">Forgotten your password? Ask the administrator for a new link.</p>
    </main>
  );
}
