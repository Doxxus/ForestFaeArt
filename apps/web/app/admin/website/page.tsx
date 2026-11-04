import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Badge, Card, Flash, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { CONTENT_KEYS, PAGE_HELP } from "./keys";

export const metadata: Metadata = { title: "Website" };

export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { saved, error } = await searchParams;
  const pages = await (await serverApi()).content.list.query();
  const drafts = pages.filter((p) => p.isDraft || p.placeholder).length;

  return (
    <>
      <PageHeader title="Website" intro="The words and pictures on your website. Your Instagram, Etsy and email addresses are in Settings." />
      <Flash saved={saved} error={error} />
      {drafts ? (
        <Alert tone="info">
          {drafts} {drafts === 1 ? "page still has" : "pages still have"} placeholder text. It reads like “Lorem ipsum”, which is just there to hold the space. Replace it with your own words before you publish.
        </Alert>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2">
        {CONTENT_KEYS.map((key) => {
          const p = pages.find((x) => x.key === key);
          if (!p) return null;
          const placeholder = p.isDraft || p.placeholder;
          return (
            <li key={key}>
              <Link href={`/admin/website/${key}`} className="block h-full rounded-xl border border-stone bg-parchment p-4 hover:border-forest">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-medium text-forest">{PAGE_HELP[key].label}</span>
                  {placeholder ? <Badge tone="warn">Needs your words</Badge> : <Badge tone="good">Written</Badge>}
                </div>
                <p className="text-sm text-moss">{PAGE_HELP[key].where}</p>
                <p className="mt-2 text-xs text-moss">Last changed {dateTime(p.updatedAt)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <Card className="mt-6" title="Also on the website">
        <p>
          The sourcing statement, social links and business details live in{" "}
          <Link className="text-forest underline" href="/admin/settings">
            Settings
          </Link>
          . Category descriptions are in{" "}
          <Link className="text-forest underline" href="/admin/categories">
            Categories
          </Link>
          .
        </p>
      </Card>
    </>
  );
}
