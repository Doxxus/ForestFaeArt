import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoUploader } from "@/components/photo-uploader";
import { Alert, Button, Card, Checkbox, Field, Flash, Input, PageHeader, Textarea, buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { photoUrl } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import { removeContentImageAction, updateContentAction } from "../actions";
import { CONTENT_KEYS, PAGE_HELP } from "../keys";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditPagePage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { key } = await params;
  const { saved, error } = await searchParams;
  if (!(CONTENT_KEYS as readonly string[]).includes(key)) notFound();
  const k = key as (typeof CONTENT_KEYS)[number];

  let page;
  try {
    page = await (await serverApi()).content.get.query({ key: k });
  } catch (e) {
    if (errorCode(e) === "NOT_FOUND") notFound();
    throw e;
  }
  const help = PAGE_HELP[k];

  return (
    <>
      <PageHeader title={help.label} intro={help.where}>
        <Link href="/admin/website" className={buttonClass("ghost")}>
          All pages
        </Link>
      </PageHeader>
      <Flash saved={saved} error={error} />
      {page.placeholder ? <Alert tone="info">This still has placeholder text (it reads like “Lorem ipsum”). Replace it with your own words.</Alert> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <form action={updateContentAction}>
            <input type="hidden" name="key" value={k} />
            <Field label="Heading" htmlFor="title">
              <Input id="title" name="title" defaultValue={page.title} required maxLength={160} />
            </Field>
            <Field label="Text" htmlFor="body" hint="A blank line starts a new paragraph.">
              <Textarea id="body" name="body" defaultValue={page.body} rows={14} maxLength={20000} />
            </Field>
            <Checkbox name="isDraft" label="Still a draft" hint="Leave this unticked once you're happy with the words. Saving without ticking it marks the page as written." defaultChecked={page.isDraft && !page.placeholder} />
            <Button type="submit">Save page</Button>
          </form>
        </Card>

        {help.picture ? (
          <Card title="Picture">
            {page.imagePath ? (
              <>
                <img src={photoUrl(API_URL, page.imagePath, 640)} alt="" className="mb-3 w-full rounded-lg border border-stone object-cover" />
                <form action={removeContentImageAction} className="mb-3">
                  <input type="hidden" name="key" value={k} />
                  <Button type="submit" variant="ghost" className="text-danger">
                    Remove picture
                  </Button>
                </form>
              </>
            ) : (
              <p className="mb-3 text-moss">No picture yet. A photo of you at work, or of your studio, suits this page.</p>
            )}
            <PhotoUploader query={`contentKey=${encodeURIComponent(k)}`} single label={page.imagePath ? "Replace picture" : "Choose a picture"} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
