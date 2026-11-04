import type { Metadata } from "next";
import { Alert, Button, Field, Flash, Input } from "@/components/ui";
import { friendlyError } from "@/lib/api";
import { serverApi } from "@/lib/session";
import { setPasswordAction } from "./actions";

export const metadata: Metadata = { title: "Choose a password" };

export default async function SetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = "", error } = await searchParams;

  let status: { valid: false } | { valid: true; purpose: "SET_PASSWORD" | "RESET"; name: string } = { valid: false };
  let problem: string | null = null;
  if (token) {
    try {
      status = await (await serverApi()).auth.tokenStatus.query({ token });
    } catch (e) {
      problem = friendlyError(e);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <h1 className="mb-6 text-center font-display text-4xl text-forest">Forest Fae Folk Art</h1>
      <div className="rounded-xl border border-stone bg-parchment p-5">
        {problem ? <Alert tone="error">{problem}</Alert> : null}
        {!status.valid ? (
          <Alert tone="error">This link has expired or was already used. Please ask the administrator for a new one.</Alert>
        ) : (
          <>
            <h2 className="mb-1 font-display text-2xl text-forest">
              {status.purpose === "RESET" ? "Choose a new password" : `Welcome, ${status.name}`}
            </h2>
            <p className="mb-4 text-moss">Use at least 12 characters. A few random words works well.</p>
            <Flash error={error} />
            <form action={setPasswordAction}>
              <input type="hidden" name="token" value={token} />
              <Field label="New password" htmlFor="password">
                <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required autoFocus />
              </Field>
              <Field label="Type it again" htmlFor="confirm">
                <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} required />
              </Field>
              <Button type="submit" className="w-full">
                Save password
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
