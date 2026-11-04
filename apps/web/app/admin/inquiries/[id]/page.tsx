import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Button, Card, Field, Flash, PageHeader, Textarea, buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { inquiryStatusAction, replyAction, retryAction } from "../actions";

export const metadata: Metadata = { title: "Inquiry" };

export default async function InquiryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { id } = await params;
  const { saved, error } = await searchParams;
  let inquiry;
  try {
    inquiry = await (await serverApi()).inquiries.get.query({ id });
  } catch (e) {
    if (errorCode(e) === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <>
      <PageHeader title={`Message from ${inquiry.name}`} intro={dateTime(inquiry.createdAt)}>
        <Badge tone={inquiry.status === "NEW" ? "warn" : inquiry.status === "REPLIED" ? "good" : "neutral"}>
          {inquiry.status === "NEW" ? "New" : inquiry.status === "REPLIED" ? "Replied" : "Archived"}
        </Badge>
        <Link href="/admin/inquiries" className={buttonClass("ghost")}>
          All messages
        </Link>
      </PageHeader>
      <Flash saved={saved} error={error} />
      {!inquiry.emailConfigured ? <Alert tone="info">Email isn&apos;t set up yet. Replies are saved and will be sent once it is.</Alert> : null}

      <div className="max-w-3xl space-y-5">
        <Card>
          <p className="mb-2 text-moss">
            <a className="text-forest underline" href={`mailto:${inquiry.email}`}>
              {inquiry.email}
            </a>
          </p>
          {inquiry.productTitle ? (
            <p className="mb-3">
              About{" "}
              <Link className="text-forest underline" href={`/admin/products/${inquiry.sku}`}>
                {inquiry.productTitle}
              </Link>{" "}
              ({inquiry.sku})
            </p>
          ) : null}
          <p className="whitespace-pre-wrap text-lg">{inquiry.message}</p>
          {inquiry.emailDeliveryStatus !== "SENT" ? (
            <div className="mt-4 rounded-lg border border-stone bg-cream p-3">
              <p className="mb-2 text-sm">
                {inquiry.emailDeliveryStatus === "PENDING" ? "The email telling you about this message is waiting." : "The email telling you about this message didn't send."}
                {inquiry.emailError ? ` (${inquiry.emailError})` : ""}
              </p>
              <form action={retryAction}>
                <input type="hidden" name="id" value={inquiry.id} />
                <Button type="submit" variant="secondary" className="min-h-10">
                  Try sending it again
                </Button>
              </form>
            </div>
          ) : null}
        </Card>

        {inquiry.replies.map((r) => (
          <Card key={r.id} title={`Your reply, ${dateTime(r.sentAt)}`}>
            <p className="whitespace-pre-wrap">{r.body}</p>
            <p className="mt-2 text-sm">
              {r.deliveryStatus === "SENT" ? <Badge tone="good">Sent</Badge> : r.deliveryStatus === "PENDING" ? <Badge tone="warn">Waiting to send</Badge> : <Badge tone="bad">Didn&apos;t send</Badge>}
              {r.deliveryError ? <span className="ml-2 text-moss">{r.deliveryError}</span> : null}
            </p>
            {r.deliveryStatus !== "SENT" ? (
              <form action={retryAction} className="mt-2">
                <input type="hidden" name="id" value={inquiry.id} />
                <input type="hidden" name="replyId" value={r.id} />
                <Button type="submit" variant="secondary" className="min-h-10">
                  Try sending it again
                </Button>
              </form>
            ) : null}
          </Card>
        ))}

        <Card title="Write a reply">
          <form action={replyAction}>
            <input type="hidden" name="id" value={inquiry.id} />
            <Field label={`Your message to ${inquiry.name}`} htmlFor="body" hint="It's sent from asa@forestfae.ca, and their reply comes back to you there.">
              <Textarea id="body" name="body" rows={7} required maxLength={8000} />
            </Field>
            <Button type="submit">Send reply</Button>
          </form>
        </Card>

        <form action={inquiryStatusAction}>
          <input type="hidden" name="id" value={inquiry.id} />
          <input type="hidden" name="status" value={inquiry.status === "ARCHIVED" ? "NEW" : "ARCHIVED"} />
          <Button type="submit" variant="ghost">
            {inquiry.status === "ARCHIVED" ? "Move back to new" : "Archive this message"}
          </Button>
        </form>
      </div>
    </>
  );
}
