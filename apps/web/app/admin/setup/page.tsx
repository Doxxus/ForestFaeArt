import type { Metadata } from "next";
import Link from "next/link";
import { SETUP_STEPS, STORE_MODES, isSetupStep, nextStep, stepNumber, type SetupStepKey } from "@ffa/validators";
import { Alert, Badge, Button, Card, Field, Flash, Input, LinkButton, PageHeader, Textarea } from "@/components/ui";
import { STORE_MODE_INFO } from "@/lib/store-modes";
import { requireUser, serverApi } from "@/lib/session";
import { addCategoryAction, loadSamplesInWizardAction, saveStepAction } from "./actions";

export const metadata: Metadata = { title: "Set up your shop" };

const stepStatus = (done: readonly string[], skipped: readonly string[], key: SetupStepKey) => (done.includes(key) ? "Done" : skipped.includes(key) ? "Skipped" : "To do");

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string; saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { step: wanted, saved, error } = await searchParams;
  const api = await serverApi();
  const [setup, s, categories] = await Promise.all([api.setup.get.query(), api.settings.get.query(), api.categories.list.query({ includeArchived: false })]);

  const step: SetupStepKey = isSetupStep(wanted) ? wanted : (nextStep(setup.progress) ?? SETUP_STEPS[SETUP_STEPS.length - 1]!.key);
  const def = SETUP_STEPS.find((d) => d.key === step)!;
  const number = stepNumber(step);
  const last = number === SETUP_STEPS.length;
  const { facts } = setup;

  const buttons = (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type="submit" name="intent" value="save">
        {last ? "Finish" : "Save and continue"}
      </Button>
      {def.skippable ? (
        <Button type="submit" name="intent" value="skip" variant="ghost" formNoValidate>
          {last ? "Skip and finish" : "Skip this step"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader title="Set up your shop" intro="Seven short steps. Nothing here is permanent: you can change any of it later in Settings.">
        <Link href="/admin" className="rounded-lg px-3 py-2 font-medium text-forest underline underline-offset-4">
          Leave and carry on later
        </Link>
      </PageHeader>
      <Flash saved={saved} error={error} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Setup steps">
          <ol className="space-y-1">
            {SETUP_STEPS.map((d, i) => {
              const status = stepStatus(setup.progress.done, setup.progress.skipped, d.key);
              const current = d.key === step;
              return (
                <li key={d.key}>
                  <Link
                    href={`/admin/setup?step=${d.key}`}
                    aria-current={current ? "step" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 ${current ? "bg-forest text-cream" : "hover:bg-parchment"}`}
                  >
                    <span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full border text-sm ${current ? "border-cream" : "border-stone"}`}>
                      {status === "Done" ? "✓" : i + 1}
                    </span>
                    <span className="flex-1">
                      {d.title}
                      <span className={`block text-sm ${current ? "text-champagne" : "text-moss"}`}>{status}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card title={`Step ${number} of ${SETUP_STEPS.length}: ${def.title}`}>
          {step === "business" ? (
            <form action={saveStepAction}>
              <input type="hidden" name="step" value={step} />
              <p className="mb-4 text-moss">The basics that appear on your website and on messages and receipts.</p>
              <Field label="Business name" htmlFor="businessName">
                <Input id="businessName" name="businessName" defaultValue={s.businessName} required maxLength={120} />
              </Field>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Email shown on your website" htmlFor="publicEmail" hint="Leave empty to show only the contact form.">
                  <Input id="publicEmail" name="publicEmail" type="email" defaultValue={s.publicEmail} />
                </Field>
                <Field label="Where messages from your website arrive" htmlFor="inquiryEmail" hint="Usually the same address.">
                  <Input id="inquiryEmail" name="inquiryEmail" type="email" defaultValue={s.inquiryEmail} />
                </Field>
                <Field label="Phone number" htmlFor="businessPhone" hint="Optional.">
                  <Input id="businessPhone" name="businessPhone" type="tel" defaultValue={s.businessPhone} maxLength={40} />
                </Field>
                <Field label="Website address" htmlFor="qrBaseUrl" hint="The QR codes on your labels open pages at this address. Change it only if your website address changes.">
                  <Input id="qrBaseUrl" name="qrBaseUrl" type="url" defaultValue={s.qrBaseUrl} />
                </Field>
              </div>
              {buttons}
            </form>
          ) : null}

          {step === "brand" ? (
            <form action={saveStepAction}>
              <input type="hidden" name="step" value={step} />
              <p className="mb-4 text-moss">
                Your story and where to find you. Longer pages, like About, are written under{" "}
                <Link href="/admin/website" className="font-medium text-forest underline">
                  Website
                </Link>
                .
              </p>
              <Field label="Tagline" htmlFor="tagline" hint="One short line under your name.">
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
                <Field label="Facebook address" htmlFor="facebookUrl" hint="Optional.">
                  <Input id="facebookUrl" name="facebookUrl" type="url" defaultValue={s.facebookUrl} />
                </Field>
              </div>
              {buttons}
            </form>
          ) : null}

          {step === "store" ? (
            <form action={saveStepAction}>
              <input type="hidden" name="step" value={step} />
              <fieldset>
                <legend className="mb-3 text-moss">How should your website treat your pieces? You can change this whenever you like.</legend>
                {STORE_MODES.map((m) => (
                  <label key={m} className="mb-3 flex min-h-11 cursor-pointer items-start gap-3">
                    <input type="radio" name="storeMode" value={m} defaultChecked={s.storeMode === m} className="mt-1 size-5 accent-forest" />
                    <span>
                      <span className="font-medium text-forest">{STORE_MODE_INFO[m].label}</span>
                      <span className="block text-sm text-moss">{STORE_MODE_INFO[m].blurb}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {buttons}
            </form>
          ) : null}

          {step === "categories" ? (
            <>
              <p className="mb-4 text-moss">Categories help visitors browse. These come ready-made, and you can add, rename, hide or reorder them.</p>
              <ul className="mb-4 flex flex-wrap gap-2" aria-label="Your categories">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Badge tone={c.hidden ? "neutral" : "good"}>
                      {c.name}
                      {c.hidden ? " (hidden)" : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
              <form action={addCategoryAction} className="mb-4 flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1">
                  <Field label="Add a category" htmlFor="categoryName">
                    <Input id="categoryName" name="name" maxLength={80} required />
                  </Field>
                </div>
                <Button type="submit" variant="secondary" className="mb-4">
                  Add
                </Button>
              </form>
              <p className="text-sm text-moss">
                To rename, hide or reorder them, use{" "}
                <Link href="/admin/categories" className="font-medium text-forest underline">
                  Categories
                </Link>
                .
              </p>
              <form action={saveStepAction}>
                <input type="hidden" name="step" value={step} />
                {buttons}
              </form>
            </>
          ) : null}

          {step === "product" ? (
            <>
              <p className="mb-4 text-moss">
                A piece is one thing you have made. Give it a title, a price and photos, and it can be sold, labelled and shown on your website. New pieces start as drafts, so nothing shows until you are ready.
              </p>
              {facts.realPieces > 0 ? (
                <Alert tone="success">
                  You already have {facts.realPieces} {facts.realPieces === 1 ? "piece" : "pieces"}.
                </Alert>
              ) : null}
              <div className="mb-4 flex flex-wrap gap-2">
                <LinkButton href="/admin/products/new">Add a piece</LinkButton>
                <LinkButton href="/admin/import" variant="secondary">
                  Import from a spreadsheet
                </LinkButton>
              </div>
              {setup.samples.loaded ? (
                <p className="text-sm text-moss">Sample pieces are loaded, so you can practise with them. They are marked Sample and you can remove them in Settings.</p>
              ) : (
                <form action={loadSamplesInWizardAction} className="rounded-lg border border-stone p-3">
                  <input type="hidden" name="step" value={step} />
                  <p className="mb-2">Want to look around first? Add four sample pieces and three sample events to practise with. They are clearly marked, and you can remove them in one click.</p>
                  <Button type="submit" variant="secondary">
                    Add the sample data
                  </Button>
                </form>
              )}
              <form action={saveStepAction}>
                <input type="hidden" name="step" value={step} />
                {buttons}
              </form>
            </>
          ) : null}

          {step === "qr" ? (
            <>
              <p className="mb-4 text-moss">Every piece gets a label with a QR code. A phone camera opens the piece&apos;s page, and the POS app uses the same code to sell it. Try it once, start to finish:</p>
              {facts.demoPiece ? (
                <ol className="mb-4 list-decimal space-y-3 pl-6">
                  <li>
                    Open{" "}
                    <Link href={`/admin/products/${facts.demoPiece.sku}`} className="font-medium text-forest underline">
                      {facts.demoPiece.title}
                    </Link>{" "}
                    {facts.demoPiece.isSample ? <Badge tone="warn">Sample</Badge> : null} ({facts.demoPiece.sku}).
                  </li>
                  <li>
                    Make a label for it:{" "}
                    <Link href={`/admin/labels?ids=${facts.demoPiece.id}`} className="font-medium text-forest underline">
                      Print a label
                    </Link>
                    . Choose the label printer, or a PDF if the printer isn&apos;t with you.
                  </li>
                  <li>Scan the label with your phone&apos;s camera. It opens the piece&apos;s page.</li>
                  <li>Open the POS app and scan the label there. Tap Sell now, choose how they paid, and record the sale. The piece shows as sold.</li>
                  <li>
                    Made a mistake, or just practising? Open <strong>Today</strong> in the app and tap <strong>Undo the sale</strong>. The piece goes back on the shelf.
                  </li>
                </ol>
              ) : (
                <Alert tone="info">There is no piece to try this with yet. Add a piece in the previous step, or add the sample data.</Alert>
              )}
              <form action={saveStepAction}>
                <input type="hidden" name="step" value={step} />
                {buttons}
              </form>
            </>
          ) : null}

          {step === "event" ? (
            <>
              <p className="mb-4 text-moss">
                An event is a market, fair or show. Take pieces to it and the shop keeps track of what is there. At the end, one tap brings back whatever didn&apos;t sell. Sales made in the POS app are linked to the event that is on.
              </p>
              {facts.realEvents > 0 ? (
                <Alert tone="success">
                  You already have {facts.realEvents} {facts.realEvents === 1 ? "event" : "events"}.
                </Alert>
              ) : null}
              <LinkButton href="/admin/events/new">Add an event</LinkButton>
              <form action={saveStepAction}>
                <input type="hidden" name="step" value={step} />
                {buttons}
              </form>
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}
