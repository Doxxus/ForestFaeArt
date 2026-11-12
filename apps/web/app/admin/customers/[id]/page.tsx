import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PAYMENT_METHOD_LABELS, SALE_CHANNEL_LABELS } from "@ffa/validators";
import { Alert, Badge, Button, Card, Field, Flash, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { anonymizeCustomerAction, updateCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { id } = await params;
  const { saved, error } = await searchParams;
  const data = await (await serverApi()).customers.get.query({ id }).catch((e: unknown) => {
    if (errorCode(e) === "NOT_FOUND") return null;
    throw e;
  });
  if (!data) notFound();
  const { customer: c, sales } = data;

  return (
    <>
      <PageHeader title={c.name} intro={c.anonymized ? "Their personal details were removed on request. Their sales are kept so your records still add up." : `Customer since ${dateTime(c.createdAt)}.`}>
        <Link href="/admin/customers" className="text-forest underline">
          All customers
        </Link>
      </PageHeader>
      <Flash saved={saved} error={error} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Purchases">
            <p className="mb-3">
              {c.purchases} {c.purchases === 1 ? "purchase" : "purchases"}, {money(c.spentCents)} in total.
            </p>
            {sales.length === 0 ? (
              <p className="text-moss">No purchases yet.</p>
            ) : (
              <Table label="Their purchases">
                <thead>
                  <tr>
                    <Th>No.</Th>
                    <Th>When</Th>
                    <Th>Sold</Th>
                    <Th>Paid by</Th>
                    <Th className="text-right">Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <Td>
                        <Link href={`/admin/sales/${s.id}`} className="text-forest underline">
                          #{s.number}
                        </Link>
                      </Td>
                      <Td>{dateTime(s.occurredAt)}</Td>
                      <Td>{SALE_CHANNEL_LABELS[s.channel]}</Td>
                      <Td>{s.paymentMethod ? PAYMENT_METHOD_LABELS[s.paymentMethod] : ""}</Td>
                      <Td className="text-right">
                        {money(s.totalCents)} {s.status === "VOIDED" ? <Badge tone="bad">Undone</Badge> : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          {c.reserved.length ? (
            <Card title="Reserved for them">
              <ul className="divide-y divide-stone">
                {c.reserved.map((r) => (
                  <li key={r.id} className="py-2">
                    <Link href={`/admin/products/${r.sku}`} className="text-forest underline">
                      {r.title}
                    </Link>{" "}
                    <span className="text-sm text-moss">{r.sku}</span>
                    {r.reservedNote ? <div className="text-sm">{r.reservedNote}</div> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {c.anonymized ? (
            <Alert>There is nothing left to edit.</Alert>
          ) : (
            <>
              <Card title="Details">
                <CustomerForm action={updateCustomerAction} submit="Save" values={c} />
                {c.marketingConsent && c.marketingConsentAt ? (
                  <p className="mt-3 text-sm text-moss">
                    Said yes to news on {dateTime(c.marketingConsentAt)}
                    {c.marketingConsentSource ? ` (${c.marketingConsentSource === "POS" ? "at a sale" : "entered by you"})` : ""}.
                  </p>
                ) : null}
              </Card>
              <Card title="Remove their details">
                <details>
                  <summary className="cursor-pointer py-3 text-danger underline">They asked me to delete their information</summary>
                  <form action={anonymizeCustomerAction} className="mt-3">
                    <input type="hidden" name="id" value={c.id} />
                    <p className="mb-3 text-sm">Their name, email, phone and notes are erased for good. Their sales stay in your records, without a name. This can&apos;t be undone.</p>
                    <Field label="Type the word remove to confirm" htmlFor="confirm">
                      <Input id="confirm" name="confirm" required autoComplete="off" />
                    </Field>
                    <Button type="submit" variant="danger">
                      Remove their details
                    </Button>
                  </form>
                </details>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
