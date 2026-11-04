import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Alert, Badge, Button, Card, Field, Flash, Input, PageHeader, Select } from "@/components/ui";
import { LINK_COOKIE } from "@/lib/config";
import { dateTime } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { inviteUserAction, issueLinkAction, revokeSessionsAction, updateUserAction } from "./actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireUser({ admin: true });
  const { saved, error } = await searchParams;
  const users = await (await serverApi()).users.list.query();

  let pending: { who: string; link: string } | null = null;
  try {
    const raw = (await cookies()).get(LINK_COOKIE)?.value;
    if (raw) pending = JSON.parse(raw) as { who: string; link: string };
  } catch {
    pending = null;
  }

  return (
    <>
      <PageHeader title="Users" intro="People who can sign in. Nothing is emailed: you pass each person a private link so they can choose their own password." />
      <Flash saved={saved} error={error} />
      {pending ? (
        <Alert tone="info">
          <p className="mb-2 font-medium text-forest">Link for {pending.who}</p>
          <p className="mb-2 text-sm">Copy this and send it to them privately. It works once, and this box disappears in a couple of minutes.</p>
          <input readOnly value={pending.link} aria-label={`Link for ${pending.who}`} className="w-full rounded-lg border border-stone bg-cream px-3 py-2 font-mono text-sm" />
        </Alert>
      ) : null}

      <Card title="Add a person" className="mb-6">
        <form action={inviteUserAction} className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="inv-name">
            <Input id="inv-name" name="name" required maxLength={120} />
          </Field>
          <Field label="Email" htmlFor="inv-email">
            <Input id="inv-email" name="email" type="email" required />
          </Field>
          <Field label="What can they do?" htmlFor="inv-role" hint="Staff can add pieces, take photos and record sales. They can't see costs, change settings or manage people.">
            <Select id="inv-role" name="role" defaultValue="STAFF">
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Administrator (everything)</option>
            </Select>
          </Field>
          <div className="flex items-start pt-7">
            <Button type="submit">Add and get link</Button>
          </div>
        </form>
      </Card>

      <ul className="space-y-3">
        {users.map((u) => {
          const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
          return (
            <li key={u.id} className="rounded-xl border border-stone bg-parchment p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-lg font-medium text-forest">{u.name}</span>
                <Badge tone={u.role === "ADMIN" ? "warn" : "neutral"}>{u.role === "ADMIN" ? "Administrator" : "Staff"}</Badge>
                {!u.active ? <Badge tone="bad">Switched off</Badge> : null}
                {!u.hasPassword ? <Badge tone="warn">No password yet</Badge> : null}
                {locked ? <Badge tone="bad">Locked until {dateTime(u.lockedUntil!)}</Badge> : null}
                {u.id === me.id ? <Badge tone="good">You</Badge> : null}
              </div>
              <p className="text-moss">{u.email}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <form action={updateUserAction} className="flex items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <label className="sr-only" htmlFor={`role-${u.id}`}>
                    Role for {u.name}
                  </label>
                  <Select id={`role-${u.id}`} name="role" defaultValue={u.role} className="w-auto">
                    <option value="STAFF">Staff</option>
                    <option value="ADMIN">Administrator</option>
                  </Select>
                  <Button type="submit" variant="secondary">
                    Change role
                  </Button>
                </form>
                <form action={issueLinkAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="name" value={u.name} />
                  <Button type="submit" variant="secondary">
                    {u.hasPassword ? "Password reset link" : "New set-password link"}
                  </Button>
                </form>
                <form action={revokeSessionsAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <Button type="submit" variant="ghost">
                    Sign out everywhere
                  </Button>
                </form>
                <form action={updateUserAction} className="ml-auto">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="active" value={u.active ? "0" : "1"} />
                  <Button type="submit" variant={u.active ? "danger" : "secondary"}>
                    {u.active ? "Switch off" : "Switch on"}
                  </Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
