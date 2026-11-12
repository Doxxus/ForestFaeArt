import type { Metadata } from "next";
import Link from "next/link";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, SALE_CHANNELS, SALE_CHANNEL_LABELS, SALE_STATUSES, type PaymentMethod, type SaleChannel, type SaleStatus } from "@ffa/validators";
import { Badge, Button, Card, Field, Input, PageHeader, Select, Table, Td, Th, buttonClass } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Sales" };

const PAGE_SIZE = 25;
type Params = { from?: string; to?: string; channel?: string; method?: string; status?: string; event?: string; number?: string; offset?: string };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireUser({ admin: true });
  const p = await searchParams;
  const api = await serverApi();

  const channel = SALE_CHANNELS.includes(p.channel as SaleChannel) ? (p.channel as SaleChannel) : undefined;
  const method = PAYMENT_METHODS.includes(p.method as PaymentMethod) ? (p.method as PaymentMethod) : undefined;
  const status = SALE_STATUSES.includes(p.status as SaleStatus) ? (p.status as SaleStatus) : undefined;
  const from = p.from && DAY.test(p.from) ? p.from : undefined;
  const to = p.to && DAY.test(p.to) ? p.to : undefined;
  const number = Number.parseInt(p.number ?? "", 10) || undefined;
  const offset = Math.max(0, Number.parseInt(p.offset ?? "0", 10) || 0);
  const filters = { from, to, channel, method, status, eventId: p.event || undefined, number };

  const [list, events] = await Promise.all([api.sales.list.query({ ...filters, limit: PAGE_SIZE, offset }), api.events.list.query({ when: "all", includeArchived: true })]);

  const query = (over: Partial<Params>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...p, ...over })) if (v) qs.set(k, String(v));
    return qs.toString();
  };
  const filtered = Boolean(from || to || channel || method || status || p.event || number);
  const exportQuery = query({ offset: undefined });

  return (
    <>
      <PageHeader title="Sales" intro={`${list.total} ${list.total === 1 ? "sale" : "sales"}${filtered ? " match" : ""}, ${money(list.totalCents)} in total (undone sales are not counted).`}>
        <a href={`/admin/sales/export${exportQuery ? `?${exportQuery}` : ""}`} className={buttonClass("secondary")}>
          Download as a spreadsheet
        </a>
      </PageHeader>

      <Card className="mb-5">
        <form method="GET">
          <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="From" htmlFor="from">
              <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
            </Field>
            <Field label="To" htmlFor="to">
              <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
            </Field>
            <Field label="Where it was sold" htmlFor="channel">
              <Select id="channel" name="channel" defaultValue={channel ?? ""}>
                <option value="">Anywhere</option>
                {SALE_CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {SALE_CHANNEL_LABELS[c]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid by" htmlFor="method">
              <Select id="method" name="method" defaultValue={method ?? ""}>
                <option value="">Any way</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Event" htmlFor="event">
              <Select id="event" name="event" defaultValue={p.event ?? ""}>
                <option value="">Any</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={status ?? ""}>
                <option value="">All</option>
                <option value="COMPLETED">Completed</option>
                <option value="VOIDED">Undone</option>
              </Select>
            </Field>
            <Field label="Sale number" htmlFor="number">
              <Input id="number" name="number" type="number" min={1} inputMode="numeric" defaultValue={number ?? ""} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Show these</Button>
            {filtered ? (
              <Link href="/admin/sales" className={buttonClass("ghost")}>
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      {list.rows.length === 0 ? (
        <p className="text-moss">{filtered ? "No sales match." : "No sales yet. They appear here as soon as one is recorded in the POS app."}</p>
      ) : (
        <Table label="Your sales">
          <thead>
            <tr>
              <Th>No.</Th>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th>Sold</Th>
              <Th>Paid by</Th>
              <Th className="text-right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`/admin/sales/${s.id}`} className="font-medium text-forest underline">
                    #{s.number}
                  </Link>
                </Td>
                <Td>{dateTime(s.occurredAt)}</Td>
                <Td>{s.customerName ?? <span className="text-moss">None</span>}</Td>
                <Td>
                  {SALE_CHANNEL_LABELS[s.channel]}
                  {s.eventTitle ? <span className="block text-sm text-moss">{s.eventTitle}</span> : null}
                  <span className="block text-sm text-moss">
                    {s.itemCount} {s.itemCount === 1 ? "item" : "items"}, by {s.soldByName}
                  </span>
                </Td>
                <Td>{s.paymentMethod ? PAYMENT_METHOD_LABELS[s.paymentMethod] : ""}</Td>
                <Td className="text-right">
                  {money(s.totalCents)} {s.status === "VOIDED" ? <Badge tone="bad">Undone</Badge> : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {list.total > PAGE_SIZE ? (
        <nav aria-label="More sales" className="mt-4 flex items-center gap-3">
          {offset > 0 ? (
            <Link href={`/admin/sales?${query({ offset: String(Math.max(0, offset - PAGE_SIZE)) })}`} className={buttonClass("secondary")}>
              Newer
            </Link>
          ) : null}
          <span className="text-sm text-moss">
            {offset + 1} to {Math.min(offset + PAGE_SIZE, list.total)} of {list.total}
          </span>
          {offset + PAGE_SIZE < list.total ? (
            <Link href={`/admin/sales?${query({ offset: String(offset + PAGE_SIZE) })}`} className={buttonClass("secondary")}>
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
