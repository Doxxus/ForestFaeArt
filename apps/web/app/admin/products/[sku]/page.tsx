import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STATUS_TRANSITIONS, type ProductStatus } from "@ffa/validators";
import { PhotoPlaceholder } from "@/components/placeholder";
import { PhotoUploader } from "@/components/photo-uploader";
import { Alert, Badge, Button, Card, Checkbox, Field, Flash, Input, PageHeader, Select, Table, Td, Textarea, Th, buttonClass } from "@/components/ui";
import { errorCode } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { STATUS_LABELS, STATUS_TONE, centsToInput, dateTime, money, photoUrl } from "@/lib/format";
import { requireUser, serverApi } from "@/lib/session";
import {
  adjustStockAction,
  changeStatusAction,
  deleteImageAction,
  moveImageAction,
  setAltTextAction,
  setCategoriesAction,
  setMetadataAction,
  setPrimaryImageAction,
  updateProductAction,
} from "../actions";

export const metadata: Metadata = { title: "Edit piece" };

const STOCKED: ProductStatus[] = ["AVAILABLE", "RESERVED", "AT_EVENT", "PENDING_PAYMENT"];
const mmToCm = (mm: number | null | undefined) => (mm === null || mm === undefined ? "" : String(mm / 10));

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { sku } = await params;
  const { saved, error } = await searchParams;
  const api = await serverApi();

  let product;
  try {
    product = await api.products.get.query({ idOrSku: sku });
  } catch (e) {
    if (errorCode(e) === "NOT_FOUND") notFound();
    throw e;
  }
  const [categories, fields, images, history, labelHistory, labelInfo] = await Promise.all([
    api.categories.list.query({ includeArchived: false }),
    api.metadata.listFields.query({ includeArchived: false }),
    api.images.list.query({ productId: product.id }),
    api.products.history.query({ productId: product.id }),
    api.labels.history.query({ productId: product.id }),
    api.labels.prepare.query({ source: "ids", productIds: [product.id] }).catch(() => null),
  ]);
  const labelState = labelInfo?.items[0]?.state ?? "NONE";

  const isAdmin = user.role === "ADMIN";
  const cost = "costCents" in product ? (product.costCents as number | null) : null;
  const values = new Map(product.metadata.map((m) => [m.key, m.value]));
  const nextStatuses = (Object.entries(STATUS_TRANSITIONS[product.status]) as [ProductStatus, { admin?: true; reason?: true }][]).filter(([, rule]) => isAdmin || !rule.admin);
  const common = (
    <>
      <input type="hidden" name="productId" value={product.id} />
      <input type="hidden" name="sku" value={product.sku} />
    </>
  );

  return (
    <>
      <PageHeader title={product.title} intro={`${product.sku}${product.archivedAt ? " · archived" : ""}`}>
        <Badge tone={STATUS_TONE[product.status]}>{STATUS_LABELS[product.status]}</Badge>
        {product.isSample ? <Badge tone="warn">Sample</Badge> : null}
        <Link href="/admin/products" className={buttonClass("ghost")}>
          All products
        </Link>
      </PageHeader>
      <Flash saved={saved} error={error} />
      {product.isSample ? <Alert tone="info">This is a sample piece, here to show you how things look. You can remove all the sample data from Settings.</Alert> : null}
      {images.length === 0 ? <Alert tone="info">This piece has no photos yet, so it stays hidden from the website. Add some below.</Alert> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {/* ---- photos ---- */}
          <Card title="Photos">
            {images.length === 0 ? (
              <div className="mb-4 flex items-center gap-4">
                <PhotoPlaceholder className="size-24 rounded-lg border border-stone" />
                <p className="text-moss">Shoppers will see this picture until you add a real photo.</p>
              </div>
            ) : (
              <ul className="mb-4 grid gap-4 sm:grid-cols-2">
                {images.map((img, i) => (
                  <li key={img.id} className="rounded-lg border border-stone bg-cream p-3">
                    <img src={photoUrl(API_URL, img.path, 640)} alt={img.altText} loading="lazy" className="mb-2 aspect-square w-full rounded-md bg-parchment object-contain" />
                    {img.isPrimary ? <Badge tone="good">Main photo</Badge> : null}
                    <form action={setAltTextAction} className="mt-2">
                      {common}
                      <input type="hidden" name="imageId" value={img.id} />
                      <label className="block text-sm font-medium text-forest" htmlFor={`alt-${img.id}`}>
                        Describe this photo (for people using screen readers)
                      </label>
                      <div className="mt-1 flex gap-2">
                        <Input id={`alt-${img.id}`} name="altText" defaultValue={img.altText} maxLength={300} />
                        <Button type="submit" variant="secondary">
                          Save
                        </Button>
                      </div>
                    </form>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!img.isPrimary ? (
                        <form action={setPrimaryImageAction}>
                          {common}
                          <input type="hidden" name="imageId" value={img.id} />
                          <Button type="submit" variant="secondary" className="min-h-10">
                            Make main
                          </Button>
                        </form>
                      ) : null}
                      {i > 0 ? (
                        <form action={moveImageAction}>
                          {common}
                          <input type="hidden" name="imageId" value={img.id} />
                          <input type="hidden" name="direction" value="up" />
                          <Button type="submit" variant="ghost" className="min-h-10" aria-label={`Move earlier: photo ${i + 1}`}>
                            Move earlier
                          </Button>
                        </form>
                      ) : null}
                      {i < images.length - 1 ? (
                        <form action={moveImageAction}>
                          {common}
                          <input type="hidden" name="imageId" value={img.id} />
                          <input type="hidden" name="direction" value="down" />
                          <Button type="submit" variant="ghost" className="min-h-10" aria-label={`Move later: photo ${i + 1}`}>
                            Move later
                          </Button>
                        </form>
                      ) : null}
                      <details className="ml-auto">
                        <summary className="cursor-pointer rounded-lg px-3 py-2 text-danger">Remove</summary>
                        <form action={deleteImageAction} className="mt-1 rounded-lg border border-danger bg-dangerbg p-2">
                          {common}
                          <input type="hidden" name="imageId" value={img.id} />
                          <p className="mb-2 text-sm">Remove this photo for good?</p>
                          <Button type="submit" variant="danger" className="min-h-10">
                            Yes, remove it
                          </Button>
                        </form>
                      </details>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <PhotoUploader query={`productId=${encodeURIComponent(product.id)}`} />
          </Card>

          {/* ---- details ---- */}
          <Card title="Details">
            <form action={updateProductAction}>
              {common}
              <input type="hidden" name="slugCurrent" value={product.slug} />
              <Field label="Title" htmlFor="title">
                <Input id="title" name="title" defaultValue={product.title} required maxLength={200} />
              </Field>
              <Field label="Description" htmlFor="description" hint="Plain text. A blank line starts a new paragraph.">
                <Textarea id="description" name="description" defaultValue={product.description} rows={6} maxLength={5000} />
              </Field>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Price (CAD)" htmlFor="price">
                  <Input id="price" name="price" inputMode="decimal" defaultValue={centsToInput(product.priceCents)} required />
                </Field>
                {isAdmin ? (
                  <Field label="Your cost (CAD)" htmlFor="cost" hint="Only you can see this.">
                    <Input id="cost" name="cost" inputMode="decimal" defaultValue={centsToInput(cost)} />
                  </Field>
                ) : null}
              </div>
              <Checkbox name="portfolioVisible" label="Show on the website" hint="It only appears once it has a photo and the site is published." defaultChecked={product.portfolioVisible} />
              <Checkbox name="featured" label="Feature on the home page" defaultChecked={product.featured} />
              <Checkbox name="hidePrice" label="Hide the price (shows “Inquire” instead)" defaultChecked={product.hidePrice} />
              <Checkbox name="listedOnEtsy" label="Also listed on Etsy" hint="We'll remind you to update Etsy when you sell it." defaultChecked={product.listedOnEtsy} />
              <Field label="Etsy listing address" htmlFor="etsyUrl" hint="The full https:// address of the listing.">
                <Input id="etsyUrl" name="etsyUrl" type="url" defaultValue={product.etsyUrl ?? ""} placeholder="https://" />
              </Field>
              <details className="mb-4 rounded-lg border border-stone p-3">
                <summary className="cursor-pointer py-2 font-medium text-forest">More options (web address, size, weight)</summary>
                <div className="mt-3">
                  <Field label="Web address" htmlFor="slug" hint={`Used in links. Old links keep working if you change it. Shoppers scanning a label always arrive by SKU (${product.sku}).`}>
                    <Input id="slug" name="slug" defaultValue={product.slug} />
                  </Field>
                  <div className="grid gap-x-4 sm:grid-cols-2">
                    <Field label="Weight (grams)" htmlFor="weightGrams">
                      <Input id="weightGrams" name="weightGrams" inputMode="decimal" defaultValue={product.weightGrams ?? ""} />
                    </Field>
                    <Field label="Length (cm)" htmlFor="lengthCm">
                      <Input id="lengthCm" name="lengthCm" inputMode="decimal" defaultValue={mmToCm(product.lengthMm)} />
                    </Field>
                    <Field label="Width (cm)" htmlFor="widthCm">
                      <Input id="widthCm" name="widthCm" inputMode="decimal" defaultValue={mmToCm(product.widthMm)} />
                    </Field>
                    <Field label="Height (cm)" htmlFor="heightCm">
                      <Input id="heightCm" name="heightCm" inputMode="decimal" defaultValue={mmToCm(product.heightMm)} />
                    </Field>
                  </div>
                  <Checkbox name="fragile" label="Fragile" defaultChecked={product.fragile} />
                </div>
              </details>
              <Button type="submit">Save details</Button>
            </form>
          </Card>

          {/* ---- metadata ---- */}
          {fields.length ? (
            <Card title="About this piece">
              <form action={setMetadataAction}>
                {common}
                {fields.map((f) => {
                  const options = JSON.parse(f.options) as string[];
                  const current = values.get(f.key);
                  const hint = f.helpText || undefined;
                  return (
                    <div key={f.id}>
                      <input type="hidden" name="fieldKey" value={f.key} />
                      <input type="hidden" name={`kind_${f.key}`} value={f.type} />
                      {f.type === "MULTI_SELECT" ? (
                        <fieldset className="mb-4">
                          <legend className="mb-1 font-medium text-forest">{f.label}</legend>
                          <div className="flex flex-wrap gap-x-4">
                            {options.map((o) => (
                              <label key={o} className="flex min-h-11 items-center gap-2">
                                <input type="checkbox" name={`m_${f.key}`} value={o} defaultChecked={Array.isArray(current) && current.includes(o)} className="size-5 accent-forest" />
                                {o}
                              </label>
                            ))}
                          </div>
                          <Input name={`new_${f.key}`} placeholder="Add new ones, separated by commas" aria-label={`New ${f.label} choices`} />
                          {hint ? <p className="mt-1 text-sm text-moss">{hint}</p> : null}
                        </fieldset>
                      ) : f.type === "SELECT" ? (
                        <Field label={f.label} htmlFor={`m_${f.key}`} hint={hint}>
                          <Select id={`m_${f.key}`} name={`m_${f.key}`} defaultValue={typeof current === "string" ? current : ""}>
                            <option value="">Not set</option>
                            {options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </Select>
                          <Input name={`new_${f.key}`} className="mt-2" placeholder="Or type a new choice" aria-label={`New ${f.label} choice`} />
                        </Field>
                      ) : f.type === "YES_NO" ? (
                        <Field label={f.label} htmlFor={`m_${f.key}`} hint={hint}>
                          <Select id={`m_${f.key}`} name={`m_${f.key}`} defaultValue={current === true ? "true" : current === false ? "false" : ""}>
                            <option value="">Not set</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </Select>
                        </Field>
                      ) : (
                        <Field label={f.label} htmlFor={`m_${f.key}`} hint={hint}>
                          <Input id={`m_${f.key}`} name={`m_${f.key}`} defaultValue={current === undefined ? "" : String(current)} inputMode={f.type === "TEXT" ? "text" : "decimal"} />
                        </Field>
                      )}
                    </div>
                  );
                })}
                <Button type="submit">Save</Button>
              </form>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          {/* ---- status and stock ---- */}
          <Card title="Status and stock">
            <p className="mb-3 text-lg">
              <strong className="text-forest">{STATUS_LABELS[product.status]}</strong> · {product.quantity} in stock · {money(product.priceCents)}
            </p>
            {product.listedOnEtsy ? <Alert tone="error">Also listed on Etsy. Remember to remove or update the listing when this sells or is reserved.</Alert> : null}
            {nextStatuses.length ? (
              <form action={changeStatusAction} className="mb-6">
                {common}
                <Field label="Change status to" htmlFor="to" hint="Available: ready to sell. Reserved: held for someone. Sold: gone. Draft: still being finished. Archived: put away, never deleted.">
                  <Select id="to" name="to" required defaultValue="">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {nextStatuses.map(([s, rule]) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                        {rule.reason ? " (needs a reason)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Note (optional)" htmlFor="reason" hint="Who it's held for, why it came back, and so on.">
                  <Input id="reason" name="reason" maxLength={500} />
                </Field>
                {product.quantity === 0 ? (
                  <Field label="How many are back in stock?" htmlFor="restoreQuantity">
                    <Input id="restoreQuantity" name="restoreQuantity" type="number" min={1} defaultValue={1} />
                  </Field>
                ) : null}
                <Button type="submit" variant="secondary">
                  Change status
                </Button>
              </form>
            ) : null}
            <form action={adjustStockAction}>
              {common}
              <Field label="Set the number in stock" htmlFor="newQuantity" hint={STOCKED.includes(product.status) || product.status === "SOLD" ? "A piece sells out at 0, and comes back when you add stock." : undefined}>
                <Input id="newQuantity" name="newQuantity" type="number" min={0} step={1} defaultValue={product.quantity} required />
              </Field>
              <Field label="Why? (required)" htmlFor="stockReason">
                <Input id="stockReason" name="reason" required maxLength={500} placeholder="For example, made a new batch" />
              </Field>
              <Button type="submit" variant="secondary">
                Update stock
              </Button>
            </form>
          </Card>

          {/* ---- label ---- */}
          <Card title="Label">
            <p className="mb-3">
              {labelState === "STALE" ? <Badge tone="bad">Label out of date</Badge> : labelState === "CURRENT" ? <Badge tone="good">Label up to date</Badge> : <Badge>No label yet</Badge>}
            </p>
            {labelState === "STALE" ? <p className="mb-3 text-danger">The title or price changed after the last label was printed. Reprint it so the tag matches.</p> : null}
            <Link href={`/admin/labels?ids=${product.id}`} className={buttonClass(labelState === "STALE" ? "primary" : "secondary")}>
              {labelState === "NONE" ? "Print a label" : "Reprint the label"}
            </Link>
            {labelHistory.length ? (
              <ul className="mt-4 space-y-1 text-sm text-moss">
                {labelHistory.slice(0, 5).map((h) => (
                  <li key={h.id}>
                    {dateTime(h.at)}: {h.copies} {h.copies === 1 ? "label" : "labels"} ({h.printer === "NIIMBOT_B1" ? "B1" : h.printer}) at {money(h.priceCents)}
                    {h.isTest ? " · test" : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {/* ---- categories ---- */}
          <Card title="Categories">
            <form action={setCategoriesAction}>
              {common}
              {categories.map((c) => (
                <Checkbox key={c.id} name="categoryId" value={c.id} label={c.name} defaultChecked={product.categoryIds.includes(c.id)} />
              ))}
              <Button type="submit" variant="secondary">
                Save categories
              </Button>
            </form>
          </Card>
        </div>
      </div>

      {/* ---- history ---- */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-2xl text-forest">History</h2>
        <Table label="This piece's history">
          <thead>
            <tr>
              <Th>When</Th>
              <Th>What happened</Th>
              <Th>Stock</Th>
              <Th>Who</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <Td className="whitespace-nowrap">{dateTime(h.at)}</Td>
                <Td>
                  {h.fromStatus === null
                    ? `Created as ${STATUS_LABELS[h.toStatus]}`
                    : h.fromStatus !== h.toStatus
                      ? `${STATUS_LABELS[h.fromStatus]} → ${STATUS_LABELS[h.toStatus]}`
                      : "Stock changed"}
                </Td>
                <Td>
                  {h.quantityDelta !== 0 ? `${h.quantityDelta > 0 ? "+" : ""}${h.quantityDelta} → ` : ""}
                  {h.quantityAfter}
                </Td>
                <Td>{h.user ?? (h.source === "IMPORT" ? "Import" : "System")}</Td>
                <Td>{h.notes}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </>
  );
}
