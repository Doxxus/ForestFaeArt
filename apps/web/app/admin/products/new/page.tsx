import type { Metadata } from "next";
import { Button, Card, Field, Flash, Input, LinkButton, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { createProductAction } from "../actions";

export const metadata: Metadata = { title: "Add a piece" };

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  return (
    <>
      <PageHeader title="Add a piece" intro="Just the basics for now. You can add photos and more details on the next page." />
      <Card className="max-w-xl">
        <Flash error={error} />
        <form action={createProductAction}>
          <Field label="Title" htmlFor="title">
            <Input id="title" name="title" required maxLength={200} autoFocus placeholder="For example, Luna moth in a walnut frame" />
          </Field>
          <Field label="Price (CAD)" htmlFor="price" hint="No tax is added. This is the final price.">
            <Input id="price" name="price" inputMode="decimal" placeholder="45.00" required />
          </Field>
          <Field label="How many do you have?" htmlFor="quantity" hint="Most pieces are one of a kind, so leave this at 1.">
            <Input id="quantity" name="quantity" type="number" min={0} step={1} defaultValue={1} required />
          </Field>
          {user.role === "ADMIN" ? (
            <Field label="Your cost (CAD, optional)" htmlFor="cost" hint="Only you can see this.">
              <Input id="cost" name="cost" inputMode="decimal" placeholder="20.00" />
            </Field>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit">Create piece</Button>
            <LinkButton href="/admin/products" variant="ghost">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </>
  );
}
