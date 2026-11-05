import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { POS_CHANNELS, PAYMENT_METHOD_LABELS, SALE_CHANNEL_LABELS, dollarsToCents, type PaymentMethod, type SaleChannel } from "@ffa/validators";
import { indexById } from "../lib/catalog";
import { viewCart } from "../lib/cart";
import { money } from "../lib/format";
import { useNav } from "../nav";
import { usePos } from "../state/app";
import type { CheckoutForm } from "../state/store";
import { SPACE } from "../theme";
import type { CustomerHit } from "../types";
import { Banner, Button, Card, Choice, Field, H, Row, Screen, T } from "../ui/kit";

/** "5" or "5.50" to cents. Empty is no discount. Null when it isn't an amount. */
export function parseMoneyField(text: string): number | null {
  const t = text.trim();
  if (!t) return 0;
  try {
    return dollarsToCents(t);
  } catch {
    return null;
  }
}

export function CheckoutScreen() {
  const { state, store } = usePos();
  const nav = useNav();
  const catalog = state.catalog;

  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [channel, setChannel] = useState<SaleChannel>("MARKET");
  const [more, setMore] = useState(false);
  const [discount, setDiscount] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [customerMode, setCustomerMode] = useState<"none" | "search" | "new">("none");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [fresh, setFresh] = useState({ firstName: "", lastName: "", email: "", phone: "", marketingConsent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // While a sale is being sent the phone has already taken the piece off its stock. Keep showing the cart as it was.
  const [frozen, setFrozen] = useState<typeof catalog | null>(null);

  const discountCents = parseMoneyField(discount);
  const view = useMemo(() => viewCart(state.cart, indexById(frozen ?? catalog), discountCents ?? 0), [state.cart, catalog, frozen, discountCents]);

  // Customer search needs the internet. Offline, a new customer can still be typed in.
  useEffect(() => {
    if (customerMode !== "search" || query.trim().length < 2) {
      setHits([]);
      setSearchNote(null);
      return;
    }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const found = await store.client.customers.search.query({ q: query.trim() });
        if (live) {
          setHits(found);
          setSearchNote(found.length ? null : "Nobody matches. You can add them as a new customer.");
        }
      } catch {
        if (live) setSearchNote("Searching needs a connection. You can add them as a new customer instead.");
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, customerMode, store]);

  if (view.lines.length === 0) {
    return (
      <Screen title="Check out" onBack={nav.back}>
        <T tone="moss">The cart is empty.</T>
        <Button label="Back to selling" onPress={() => nav.tab("home")} style={{ marginTop: SPACE.lg }} />
      </Screen>
    );
  }

  const methods = (catalog?.paymentMethods ?? []) as PaymentMethod[];
  const total = view.totals.ok ? view.totals.totalCents : 0;
  const newCustomerHasDetails = [fresh.firstName, fresh.lastName, fresh.email, fresh.phone].some((v) => v.trim());
  const problem =
    discountCents === null
      ? "The discount isn't an amount. Type it like 5 or 5.50."
      : !view.totals.ok
        ? view.totals.message
        : discountCents > 0 && !reason.trim()
          ? "Please say why there is a discount."
          : view.blocked.length
            ? `${view.blocked[0]!.piece.title}: ${view.blocked[0]!.message}`
            : null;

  const submit = async () => {
    if (!method || problem) return;
    setFrozen(catalog);
    setBusy(true);
    setError(null);
    const form: CheckoutForm = {
      method,
      channel,
      discountCents: discountCents ?? 0,
      discountReason: reason,
      notes,
      customer:
        customerMode === "search" && picked
          ? { kind: "existing", id: picked.id, name: picked.name }
          : customerMode === "new" && newCustomerHasDetails
            ? { kind: "new", fields: { ...fresh, notes: "" } }
            : { kind: "none" },
      receiptEmail: email,
    };
    const outcome = await store.checkout(form);
    setFrozen(null);
    setBusy(false);
    if (outcome.kind === "recorded" || outcome.kind === "queued") nav.reset({ name: "done", outcome });
    else setError(outcome.message);
  };

  return (
    <Screen title="Check out" onBack={nav.back}>
      {view.lines.map((l) => (
        <Row key={l.piece.id} style={{ justifyContent: "space-between", marginBottom: SPACE.xs }}>
          <T style={{ flex: 1 }} numberOfLines={2}>
            {l.quantity > 1 ? `${l.quantity} × ` : ""}
            {l.piece.title}
          </T>
          <T bold>{money(l.lineCents)}</T>
        </Row>
      ))}
      {discountCents ? (
        <Row style={{ justifyContent: "space-between" }}>
          <T tone="moss">Discount</T>
          <T tone="moss">-{money(discountCents)}</T>
        </Row>
      ) : null}
      <Row style={{ justifyContent: "space-between", marginVertical: SPACE.md }}>
        <T size="large" bold>
          Total
        </T>
        <T size="money" bold tone="forest">
          {money(total)}
        </T>
      </Row>

      {view.etsy.length ? <Banner tone="info">{view.etsy.map((p) => p.title).join(", ")} {view.etsy.length === 1 ? "is" : "are"} also listed on Etsy. Remember to remove or update the listing.</Banner> : null}
      {view.needsConfirm.length ? <Banner tone="warn">{view.needsConfirm.map((p) => p.title).join(", ")} {view.needsConfirm.length === 1 ? "is" : "are"} reserved for someone.</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}

      <H>How did they pay?</H>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm, marginBottom: SPACE.lg }} accessibilityRole="radiogroup">
        {methods.map((m) => (
          <Choice key={m} label={PAYMENT_METHOD_LABELS[m]} selected={method === m} onPress={() => setMethod(m)} />
        ))}
      </View>

      {problem ? <Banner tone="warn">{problem}</Banner> : null}
      <Button
        label={method ? `Record sale: ${money(total)}, ${PAYMENT_METHOD_LABELS[method]}` : "Choose how they paid"}
        onPress={() => void submit()}
        disabled={!method || Boolean(problem)}
        busy={busy}
        style={{ minHeight: 76 }}
      />
      <T tone="moss" size="small" style={{ marginTop: SPACE.sm }}>
        Card payments are taken on your own card reader. This app only records how they paid.
      </T>

      <Button label={more ? "Hide extra options" : "Discount, customer, receipt…"} variant="ghost" onPress={() => setMore((m) => !m)} style={{ marginTop: SPACE.lg }} />
      {more ? (
        <>
          <Card>
            <H>Discount</H>
            <Field label="Amount off, in dollars" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="0" />
            {discountCents ? <Field label="Why?" value={reason} onChangeText={setReason} placeholder="For example: bought two" maxLength={200} /> : null}
          </Card>

          <Card>
            <H>Customer (optional)</H>
            <View style={{ flexDirection: "row", gap: SPACE.sm, marginBottom: SPACE.sm }}>
              <Choice label="None" selected={customerMode === "none"} onPress={() => setCustomerMode("none")} />
              <Choice label="Find" selected={customerMode === "search"} onPress={() => setCustomerMode("search")} />
              <Choice label="New" selected={customerMode === "new"} onPress={() => setCustomerMode("new")} />
            </View>
            {customerMode === "search" ? (
              <>
                {picked ? (
                  <Banner tone="ok" action={{ label: "Change", onPress: () => setPicked(null) }}>
                    {picked.name}
                    {picked.email ? `, ${picked.email}` : ""}
                  </Banner>
                ) : (
                  <>
                    <Field label="Name, email or phone" value={query} onChangeText={setQuery} autoCapitalize="none" />
                    {searchNote ? <T tone="moss" size="small">{searchNote}</T> : null}
                    {hits.map((h) => (
                      <Button key={h.id} label={`${h.name}${h.email ? `  ·  ${h.email}` : ""}`} variant="secondary" onPress={() => setPicked(h)} style={{ marginBottom: SPACE.sm }} />
                    ))}
                  </>
                )}
              </>
            ) : null}
            {customerMode === "new" ? (
              <>
                <Field label="First name" value={fresh.firstName} onChangeText={(v) => setFresh((f) => ({ ...f, firstName: v }))} />
                <Field label="Last name" value={fresh.lastName} onChangeText={(v) => setFresh((f) => ({ ...f, lastName: v }))} />
                <Field label="Email" value={fresh.email} onChangeText={(v) => setFresh((f) => ({ ...f, email: v }))} keyboardType="email-address" autoCapitalize="none" />
                <Field label="Phone" value={fresh.phone} onChangeText={(v) => setFresh((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
                <Choice label="They'd like news from the shop" selected={fresh.marketingConsent} onPress={() => setFresh((f) => ({ ...f, marketingConsent: !f.marketingConsent }))} />
              </>
            ) : null}
          </Card>

          <Card>
            <H>Receipt (optional)</H>
            <Field label="Email a receipt to" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" hint="You can also share a receipt after the sale." />
          </Card>

          <Card>
            <H>Where was it sold?</H>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.sm }}>
              {POS_CHANNELS.map((c) => (
                <Choice key={c} label={SALE_CHANNEL_LABELS[c]} selected={channel === c} onPress={() => setChannel(c)} />
              ))}
            </View>
            <Field label="Note" value={notes} onChangeText={setNotes} maxLength={500} style={{ marginTop: SPACE.md }} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
