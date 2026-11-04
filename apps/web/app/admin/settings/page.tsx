import type { Metadata } from "next";
import { STORE_MODES } from "@ffa/validators";
import { Alert, Badge, Button, Card, Checkbox, Field, Flash, Input, PageHeader, Textarea } from "@/components/ui";
import { requireUser, serverApi } from "@/lib/session";
import { setSiteLiveAction, updateSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

const MODES: Record<(typeof STORE_MODES)[number], { label: string; blurb: string }> = {
  SHOWCASE_ONLY: { label: "Showcase only", blurb: "Visitors browse your portfolio. There are no buy buttons." },
  EVENT_ONLY: { label: "Markets and events focus", blurb: "Like Showcase, but the home page promotes your upcoming markets." },
  ONLINE_STORE: { label: "Online store", blurb: "Online buying is not available yet. Visitors will see an Inquire option instead." },
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { saved, error } = await searchParams;
  const api = await serverApi();
  const [s, a] = await Promise.all([api.settings.get.query(), api.site.attention.query()]);
  const checklist: { done: boolean; text: string; href: string }[] = [
    { done: a.draftPages.length === 0, text: a.draftPages.length ? `${a.draftPages.length} website ${a.draftPages.length === 1 ? "page has" : "pages have"} placeholder text` : "Website pages are written", href: "/admin/website" },
    { done: !a.sourcingPlaceholder, text: a.sourcingPlaceholder ? "The sourcing statement is still placeholder text" : "Sourcing statement is written", href: "#sourcingStatement" },
    { done: a.placeholderCategories === 0, text: a.placeholderCategories ? `${a.placeholderCategories} ${a.placeholderCategories === 1 ? "category has" : "categories have"} placeholder descriptions` : "Category descriptions are written", href: "/admin/categories" },
    { done: a.publicPieces > 0, text: a.publicPieces > 0 ? `${a.publicPieces} ${a.publicPieces === 1 ? "piece" : "pieces"} will show on the website` : "No pieces will show yet. A piece needs a photo and “Show on the website” ticked", href: "/admin/products?photos=none" },
    { done: !a.contactMissing, text: a.contactMissing ? "No address is set for inquiries to arrive at" : "Inquiries have somewhere to go", href: "#inquiryEmail" },
    { done: !a.emailNotSetUp, text: a.emailNotSetUp ? "Email isn't set up yet, so messages from visitors will wait to be sent" : "Email is set up", href: "/admin/inquiries" },
  ];

  return (
    <>
      <PageHeader title="Settings" intro="How your shop and website behave." />
      <Flash saved={saved} error={error} />

      <Card title="Website" className="mb-6">
        <p className="mb-3">
          Your website is currently{" "}
          {s.siteLive ? <Badge tone="good">Live</Badge> : <Badge tone="warn">Hidden (Coming soon)</Badge>}
        </p>
        <h3 className="mb-1 font-medium text-forest">Before you publish</h3>
        <ul className="mb-4 space-y-1">
          {checklist.map((c) => (
            <li key={c.text} className="flex items-start gap-2">
              <span aria-hidden="true" className={c.done ? "text-moss" : "text-copperdeep"}>{c.done ? "✓" : "○"}</span>
              <span className="sr-only">{c.done ? "Done: " : "Still to do: "}</span>
              {c.done ? <span>{c.text}</span> : <a className="text-forest underline" href={c.href}>{c.text}</a>}
            </li>
          ))}
        </ul>
        {s.siteLive ? (
          <form action={setSiteLiveAction}>
            <input type="hidden" name="live" value="0" />
            <Button type="submit" variant="secondary">
              Hide my website again
            </Button>
          </form>
        ) : (
          <>
            <Alert tone="info">While it is hidden, visitors see a “Coming soon” page and no pieces. You and your staff can still look around when signed in.</Alert>
            <form action={setSiteLiveAction}>
              <input type="hidden" name="live" value="1" />
              <Button type="submit">Publish my website</Button>
            </form>
          </>
        )}
      </Card>

      <form action={updateSettingsAction} className="space-y-6">
        <Card title="How the shop works">
          <fieldset className="mb-4">
            <legend className="mb-2 font-medium text-forest">Store mode</legend>
            {STORE_MODES.map((m) => (
              <label key={m} className="mb-2 flex min-h-11 cursor-pointer items-start gap-3">
                <input type="radio" name="storeMode" value={m} defaultChecked={s.storeMode === m} className="mt-1 size-5 accent-forest" />
                <span>
                  <span className="font-medium text-forest">{MODES[m].label}</span>
                  <span className="block text-sm text-moss">{MODES[m].blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Checkbox name="showPrices" label="Show prices on the website" hint="You can still hide the price on a single piece." defaultChecked={s.showPrices} />
          <Checkbox name="showProductsWithoutPhotos" label="Show pieces that have no photo yet" hint="Usually off, so visitors only see finished listings." defaultChecked={s.showProductsWithoutPhotos} />
          <Checkbox name="showStockCounts" label={"Show “Only 3 left” on pieces with several in stock"} defaultChecked={s.showStockCounts} />
          <Checkbox name="showEtsyLinks" label="Link to a piece's Etsy listing when it has one" defaultChecked={s.showEtsyLinks} />
        </Card>

        <Card title="About the business">
          <Field label="Business name" htmlFor="businessName">
            <Input id="businessName" name="businessName" defaultValue={s.businessName} maxLength={120} />
          </Field>
          <Field label="Tagline" htmlFor="tagline">
            <Input id="tagline" name="tagline" defaultValue={s.tagline} maxLength={200} />
          </Field>
          <Field label="Sourcing statement" htmlFor="sourcingStatement" hint="A short note about where your specimens come from. It appears on the website.">
            <Textarea id="sourcingStatement" name="sourcingStatement" defaultValue={s.sourcingStatement} rows={4} maxLength={2000} />
          </Field>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Instagram address" htmlFor="instagramUrl">
              <Input id="instagramUrl" name="instagramUrl" type="url" defaultValue={s.instagramUrl} />
            </Field>
            <Field label="Etsy shop address" htmlFor="etsyUrl">
              <Input id="etsyUrl" name="etsyUrl" type="url" defaultValue={s.etsyUrl} />
            </Field>
            <Field label="Facebook address" htmlFor="facebookUrl">
              <Input id="facebookUrl" name="facebookUrl" type="url" defaultValue={s.facebookUrl} />
            </Field>
          </div>
        </Card>

        <Card title="Email addresses">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Inquiries arrive at" htmlFor="inquiryEmail">
              <Input id="inquiryEmail" name="inquiryEmail" type="email" defaultValue={s.inquiryEmail} />
            </Field>
            <Field label="Replies go to" htmlFor="replyToEmail">
              <Input id="replyToEmail" name="replyToEmail" type="email" defaultValue={s.replyToEmail} />
            </Field>
            <Field label="Receipts and notices are sent from" htmlFor="systemFromEmail">
              <Input id="systemFromEmail" name="systemFromEmail" type="email" defaultValue={s.systemFromEmail} />
            </Field>
          </div>
        </Card>

        <Card title="Labels and tax">
          <Field label="Label web address" htmlFor="qrBaseUrl" hint="The QR codes on your labels open pages under this address. Change it only if your website address changes.">
            <Input id="qrBaseUrl" name="qrBaseUrl" type="url" defaultValue={s.qrBaseUrl} />
          </Field>
          <Checkbox name="taxRegistered" label="I am registered for GST/HST" hint="Leave this off until you register. No tax is added to prices while it is off." defaultChecked={s.taxRegistered} />
          <Field label="GST/HST number" htmlFor="taxRegistrationNumber">
            <Input id="taxRegistrationNumber" name="taxRegistrationNumber" defaultValue={s.taxRegistrationNumber} maxLength={40} />
          </Field>
        </Card>

        <Button type="submit">Save settings</Button>
      </form>
    </>
  );
}
