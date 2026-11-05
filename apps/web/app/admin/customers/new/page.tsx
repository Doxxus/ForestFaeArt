import type { Metadata } from "next";
import { Card, Flash, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { createCustomerAction } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Add a customer" };

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  await requireUser({ admin: true });
  const { saved, error } = await searchParams;
  return (
    <>
      <PageHeader title="Add a customer" intro="A name, an email or a phone number is enough." />
      <Flash saved={saved} error={error} />
      <Card>
        <CustomerForm action={createCustomerAction} submit="Add customer" />
      </Card>
    </>
  );
}
