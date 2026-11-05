import { describe, expect, it } from "vitest";
import { ago, money, receiptText } from "./format";

const sale = { number: 12, occurredAt: Date.UTC(2026, 10, 21, 15, 30), items: [{ id: "i", productId: "p", sku: "FFA-000007", title: "Atlas Moth", quantity: 1, priceCents: 4500 }], subtotalCents: 4500, discountCents: 0, taxCents: 0, totalCents: 4500, paymentMethod: "CASH" as const };

describe("receipt text (POS-11)", () => {
  it("lists the pieces and the total, with no tax lines while the owner isn't registered", () => {
    const text = receiptText(sale, "Forest Fae Folk Art");
    expect(text).toContain("Receipt #12");
    expect(text).toContain("Atlas Moth (FFA-000007)  $45.00");
    expect(text).toContain("Total: $45.00");
    expect(text).toContain("Paid by: Cash");
    expect(text).not.toMatch(/tax/i);
    expect(text).not.toMatch(/discount/i);
  });
  it("shows a discount, and a quantity", () => {
    const text = receiptText({ ...sale, items: [{ ...sale.items[0]!, quantity: 2 }], subtotalCents: 9000, discountCents: 500, totalCents: 8500 }, "Forest Fae Folk Art");
    expect(text).toContain("2 x Atlas Moth (FFA-000007)  $90.00");
    expect(text).toContain("Discount: -$5.00");
    expect(text).toContain("Total: $85.00");
  });
});

describe("small helpers", () => {
  it("formats money in Canadian dollars", () => {
    expect(money(4500)).toBe("$45.00");
    expect(money(123456)).toBe("$1,234.56");
  });
  it("says how long ago in plain words", () => {
    const now = 10_000_000;
    expect(ago(now - 10_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(ago(now - 60 * 60_000, now)).toBe("1 hour ago");
    expect(ago(now - 3 * 24 * 3600_000, now)).toBe("3 days ago");
  });
});
