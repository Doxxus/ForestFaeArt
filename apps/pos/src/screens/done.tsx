import { useState } from "react";
import { Share, View } from "react-native";
import { PAYMENT_METHOD_LABELS } from "@ffa/validators";
import { friendlyError } from "../api";
import { ago, money, receiptText } from "../lib/format";
import { useNav, type Route } from "../nav";
import { usePos } from "../state/app";
import { SPACE } from "../theme";
import { Banner, Button, Card, Field, H, Screen, T } from "../ui/kit";

type Done = Extract<Route, { name: "done" }>["outcome"];

const REASON_TEXT = {
  offline: "There's no connection right now.",
  server: "The server is busy right now.",
  "sign-in": "You need to sign in again.",
} as const;

/** The sale is finished. Say plainly whether it is safely recorded or saved on the phone, then offer the receipt and undo (POS-11, POS-12). */
export function DoneScreen({ outcome }: { outcome: Done }) {
  const nav = useNav();
  const { state, store } = usePos();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [reason, setReason] = useState("");
  const [undone, setUndone] = useState(false);
  const businessName = state.catalog?.businessName ?? "Forest Fae Folk Art";

  if (outcome.kind === "queued") {
    return (
      <Screen title="Sale saved">
        <Banner tone="warn">
          Saved on this phone. {REASON_TEXT[outcome.reason]} It will be sent automatically as soon as it can, and nothing is lost if you close the app.
        </Banner>
        <T size="money" bold tone="forest">
          {money(outcome.sale.summary.totalCents)}
        </T>
        <T tone="moss">{outcome.sale.summary.titles.join(", ")}</T>
        <Button label="Next sale" onPress={() => nav.reset({ name: "home" })} style={{ minHeight: 72, marginTop: SPACE.xl }} />
      </Screen>
    );
  }

  const { sale, etsy, receipt, duplicate } = outcome.result;

  const sendReceipt = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await store.client.sales.sendReceipt.mutate({ saleId: sale.id, email: email.trim() });
      setNote(r.outcome === "SENT" ? { tone: "ok", text: "Receipt sent." } : r.outcome === "NOT_SET_UP" ? { tone: "warn", text: "Email isn't set up yet. Use Share instead." } : { tone: "error", text: "The receipt didn't send. Please try again." });
    } catch (error) {
      setNote({ tone: "error", text: friendlyError(error) });
    }
    setBusy(false);
  };

  const undo = async () => {
    setBusy(true);
    try {
      await store.client.sales.void.mutate({ saleId: sale.id, reason: reason.trim() });
      setUndone(true);
      setUndoing(false);
      void store.refreshCatalog();
    } catch (error) {
      setNote({ tone: "error", text: friendlyError(error) });
    }
    setBusy(false);
  };

  return (
    <Screen title={undone ? "Sale undone" : "Sale recorded"}>
      {undone ? (
        <Banner tone="warn">Sale #{sale.number} was undone and the piece is back in stock. If they paid by card, refund them in your card reader app.</Banner>
      ) : (
        <Banner tone="ok">
          {duplicate ? "This sale was already recorded." : "Recorded."} Sale #{sale.number}
        </Banner>
      )}
      <T size="money" bold tone="forest">
        {money(sale.totalCents)}
      </T>
      <T tone="moss">
        {sale.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.title}`).join(", ")}
        {sale.paymentMethod ? `  ·  ${PAYMENT_METHOD_LABELS[sale.paymentMethod]}` : ""}
      </T>

      {etsy.length ? (
        <Banner tone="warn">
          {etsy.map((e) => e.title).join(", ")} {etsy.length === 1 ? "is" : "are"} also listed on Etsy. Remember to remove or update the listing.
        </Banner>
      ) : null}
      {receipt === "SENT" ? <Banner tone="ok">A receipt was emailed.</Banner> : null}
      {receipt === "FAILED" ? <Banner tone="warn">The receipt email didn't send. You can try again below.</Banner> : null}
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}

      {!undone ? (
        <>
          <Button label="Next sale" onPress={() => nav.reset({ name: "home" })} style={{ minHeight: 72, marginVertical: SPACE.lg }} />
          <Card>
            <H>Receipt</H>
            <Field label="Email a receipt to" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <Button label="Email receipt" variant="secondary" onPress={() => void sendReceipt()} disabled={!email.includes("@")} busy={busy} />
            <View style={{ height: SPACE.sm }} />
            <Button label="Share receipt" variant="secondary" onPress={() => void Share.share({ message: receiptText(sale, businessName) })} />
          </Card>
          <Card>
            <H>Made a mistake?</H>
            {undoing ? (
              <>
                <Field label="Why are you undoing this sale?" value={reason} onChangeText={setReason} maxLength={200} />
                <Button label="Undo the sale" variant="danger" onPress={() => void undo()} disabled={!reason.trim()} busy={busy} />
                <Button label="Keep it" variant="ghost" onPress={() => setUndoing(false)} />
              </>
            ) : (
              <Button label="Undo this sale" variant="ghost" onPress={() => setUndoing(true)} />
            )}
          </Card>
        </>
      ) : (
        <Button label="Back to selling" onPress={() => nav.reset({ name: "home" })} style={{ marginTop: SPACE.lg }} />
      )}
      <T tone="moss" size="small" style={{ marginTop: SPACE.md }}>
        {ago(sale.occurredAt, Date.now())}
      </T>
    </Screen>
  );
}
