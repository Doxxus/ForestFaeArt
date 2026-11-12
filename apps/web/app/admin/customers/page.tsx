import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Button, Card, Field, Flash, Input, PageHeader, LinkButton, Table, Td, Th, buttonClass } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Customers" };

const PAGE_SIZE = 25;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; offset?: string; saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { q = "", offset: rawOffset, saved, error } = await searchParams;
  const offset = Math.max(0, Number.parseInt(rawOffset ?? "0", 10) || 0);
  const list = await (await serverApi()).customers.list.query({ q, limit: PAGE_SIZE, offset });
  const link = (o: number) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), offset: String(o) })}`;

  return (
    <>
      <PageHeader title="Customers" intro="People who have bought from you or asked you to hold a piece. Adding a customer to a sale is always optional.">
        <LinkButton href="/admin/customers/new">Add a customer</LinkButton>
        <a href="/admin/customers/export" className={buttonClass("secondary")}>
          Download as a spreadsheet
        </a>
      </PageHeader>
      <Flash saved={saved} error={error} />
      <Card className="mb-5">
        <form method="GET" className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Search" htmlFor="q">
              <Input id="q" name="q" type="search" defaultValue={q} placeholder="Name, email or phone" />
            </Field>
          </div>
          <div className="mb-4 flex gap-2">
            <Button type="submit">Search</Button>
            {q ? (
              <Link href="/admin/customers" className={buttonClass("ghost")}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      {list.rows.length === 0 ? (
        <Alert>{q ? "Nobody matches that search." : "No customers yet. They are added here, or when you record a sale in the POS app."}</Alert>
      ) : (
        <Table label="Your customers">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Contact</Th>
              <Th className="text-right">Purchases</Th>
              <Th className="text-right">Spent</Th>
              <Th>Last purchase</Th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((c) => (
              <tr key={c.id}>
                <Td>
                  <Link href={`/admin/customers/${c.id}`} className="font-medium text-forest underline">
                    {c.name}
                  </Link>
                </Td>
                <Td>
                  {c.email ?? ""}
                  {c.email && c.phone ? <br /> : null}
                  {c.phone ?? ""}
                </Td>
                <Td className="text-right">{c.purchases}</Td>
                <Td className="text-right">{money(c.spentCents)}</Td>
                <Td>{c.lastPurchaseAt ? dateTime(c.lastPurchaseAt) : ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {list.total > PAGE_SIZE ? (
        <nav aria-label="More customers" className="mt-4 flex items-center gap-3">
          {offset > 0 ? (
            <Link href={link(Math.max(0, offset - PAGE_SIZE))} className={buttonClass("secondary")}>
              Previous
            </Link>
          ) : null}
          <span className="text-sm text-moss">
            {offset + 1} to {Math.min(offset + PAGE_SIZE, list.total)} of {list.total}
          </span>
          {offset + PAGE_SIZE < list.total ? (
            <Link href={link(offset + PAGE_SIZE)} className={buttonClass("secondary")}>
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
