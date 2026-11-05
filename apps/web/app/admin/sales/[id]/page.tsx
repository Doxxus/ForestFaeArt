import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PAYMENT_METHOD_LABELS, SALE_CHANNEL_LABELS } from "@ffa/validators";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { sendReceiptAction, voidSaleAction } from "../actions";

export const metadata: Metadata = { title: "Sale" };

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { id } = await params;
  const { saved, error } = await searchParams;
  const sale = await (await serverApi()).sales.get.query({ id }).catch((e: unknown) => {
    if (errorCode(e) === "NOT_FOUND") return null;
    throw e;
  });
  if (!sale) notFound();
  const voided = sale.status === "VOIDED";

  return (
    <>
      <PageHeader title={`Sale #${sale.number}`} intro={`${dateTime(sale.occurredAt)}, ${SALE_CHANNEL_LABELS[sale.channel]}${sale.eventTitle ? ` at ${sale.eventTitle}` : ""}, recorded by ${sale.soldByName}.`}>
        <Link href="/admin/sales" className="text-forest underline">
          All sales
        </Link>
      </PageHeader>
      <Flash saved={saved} error={error} />
      {voided ? (
        <div role="status" className="mb-4 rounded-lg border border-danger bg-dangerbg px-4 py-3 text-danger">
          This sale was undone{sale.voidedAt ? ` on ${dateTime(sale.voidedAt)}` : ""}
          {sale.voidedByName ? ` by ${sale.voidedByName}` : ""}. Reason: {sale.voidReason}. The pieces went back into stock.
          {sale.payment?.method === "CARD" ? " If the customer paid by card, remember to refund them in your Square app." : ""}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="What was sold" className="lg:col-span-2">
          <Table>
            <thead>
              <tr>
                <Th>Piece</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Price</Th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <Link href={`/admin/products/${i.sku}`} className="text-forest underline">
                      {i.title}
                    </Link>
                    <span className="block text-sm text-moss">{i.sku}</span>
                  </Td>
                  <Td className="text-right">{i.quantity}</Td>
                  <Td className="text-right">{money(i.priceCents * i.quantity)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-right">
            <dt>Subtotal</dt>
            <dd>{money(sale.subtotalCents)}</dd>
            {sale.discountCents > 0 ? (
              <>
                <dt>Discount</dt>
                <dd>-{money(sale.discountCents)}</dd>
              </>
            ) : null}
            {sale.taxCents > 0 ? (
              <>
                <dt>Tax</dt>
                <dd>{money(sale.taxCents)}</dd>
              </>
            ) : null}
            <dt className="font-semibold text-forest">Total</dt>
            <dd className="font-semibold text-forest">{money(sale.totalCents)}</dd>
          </dl>
          {sale.discountReason ? <p className="mt-2 text-sm text-moss">Discount reason: {sale.discountReason}</p> : null}
        </Card>

        <div className="space-y-5">
          <Card title="Payment">
            <p>
              {sale.payment ? PAYMENT_METHOD_LABELS[sale.payment.method] : "Not recorded"}{" "}
              {voided ? <Badge tone="bad">Undone</Badge> : <Badge tone="good">Recorded</Badge>}
            </p>
            <p className="mt-1 text-sm text-moss">The app records how the customer paid. Card payments are taken on your own card reader.</p>
          </Card>
          <Card title="Customer">
            {sale.customerId ? (
              <Link href={`/admin/customers/${sale.customerId}`} className="text-forest underline">
                {sale.customerName}
              </Link>
            ) : (
              <p className="text-moss">No customer was added.</p>
            )}
          </Card>
          {sale.notes ? (
            <Card title="Notes">
              <p>{sale.notes}</p>
            </Card>
          ) : null}
        </div>
      </div>

      {!voided ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card title="Email a receipt">
            <form action={sendReceiptAction}>
              <input type="hidden" name="id" value={sale.id} />
              <Field label="Email address" htmlFor="receipt-email">
                <Input id="receipt-email" name="email" type="email" required defaultValue={sale.customerEmail ?? ""} autoComplete="off" />
              </Field>
              <Button type="submit" variant="secondary">
                Send receipt
              </Button>
            </form>
          </Card>
          <Card title="Undo this sale">
            <details>
              <summary className="cursor-pointer text-danger underline">I need to undo this sale</summary>
              <form action={voidSaleAction} className="mt-3">
                <input type="hidden" name="id" value={sale.id} />
                <p className="mb-3 text-sm">The pieces go back into stock. Undoing a sale can&apos;t be undone, but you can sell the pieces again.</p>
                <Field label="Why are you undoing it?" htmlFor="void-reason">
                  <Input id="void-reason" name="reason" required maxLength={200} />
                </Field>
                <Button type="submit" variant="danger">
                  Undo the sale
                </Button>
              </form>
            </details>
          </Card>
        </div>
      ) : null}
    </>
  );
}
