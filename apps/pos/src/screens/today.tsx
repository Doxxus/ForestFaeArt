import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { PAYMENT_METHOD_LABELS } from "@ffa/validators";
import { friendlyError } from "../api";
import { money, timeOf } from "../lib/format";
import { pendingSales } from "../lib/queue";
import { usePos } from "../state/app";
import { SPACE } from "../theme";
import type { DaySummary, SaleSummary } from "../types";
import { Badge, Banner, Button, Card, Field, H, Row, Screen, T } from "../ui/kit";
import { StatusStrip } from "./shared";

/** The end-of-day summary (POS-14), and a way to undo a sale made today (POS-12). Needs a connection, but shows waiting sales without one. */
export function TodayScreen() {
  const { state, store } = usePos();
  const [data, setData] = useState<{ summary: DaySummary; sales: SaleSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const waiting = pendingSales(state.queue);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await store.client.sales.today.query());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
    setLoading(false);
  }, [store]);

  useEffect(() => {
    void load();
  }, [load]);

  const undo = async (saleId: string) => {
    setBusy(true);
    try {
      await store.client.sales.void.mutate({ saleId, reason: reason.trim() });
      setUndoing(null);
      setReason("");
      await Promise.all([load(), store.refreshCatalog()]);
    } catch (e) {
      setError(friendlyError(e));
    }
    setBusy(false);
  };

  return (
    <Screen title="Today" right={<Button label="Refresh" variant="ghost" onPress={() => void load()} busy={loading} style={{ minHeight: 44 }} />}>
      <StatusStrip />
      {error ? <Banner tone="warn">{error} {data ? "This is what the phone saw last time." : "Today's totals need a connection."}</Banner> : null}

      {waiting.length ? (
        <Card>
          <H>Waiting to send</H>
          {waiting.map((q) => (
            <Row key={q.key} style={{ justifyContent: "space-between" }}>
              <T style={{ flex: 1 }} numberOfLines={1}>
                {timeOf(q.createdAt)}  {q.summary.titles.join(", ")}
              </T>
              <T bold>{money(q.summary.totalCents)}</T>
            </Row>
          ))}
          <T tone="moss" size="small" style={{ marginTop: SPACE.sm }}>
            These are saved on this phone. They are not in the totals below yet.
          </T>
        </Card>
      ) : null}

      {data ? (
        <>
          <Card>
            <T tone="moss">{state.user?.role === "ADMIN" ? "Everyone's sales today" : "Your sales today"}</T>
            <T size="money" bold tone="forest">
              {money(data.summary.totalCents)}
            </T>
            <T>
              {data.summary.count} {data.summary.count === 1 ? "sale" : "sales"}, {data.summary.itemsSold} {data.summary.itemsSold === 1 ? "piece" : "pieces"}
              {data.summary.voidedCount ? `, ${data.summary.voidedCount} undone` : ""}
            </T>
            {data.summary.byMethod.length ? (
              <View style={{ marginTop: SPACE.md }}>
                {data.summary.byMethod.map((m) => (
                  <Row key={m.method} style={{ justifyContent: "space-between" }}>
                    <T>{PAYMENT_METHOD_LABELS[m.method]}</T>
                    <T bold>{money(m.totalCents)}</T>
                  </Row>
                ))}
              </View>
            ) : null}
          </Card>

          {data.sales.map((s) => (
            <Card key={s.id}>
              <Row style={{ justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <T bold>
                    #{s.number}  ·  {timeOf(s.occurredAt)}
                  </T>
                  <T tone="moss" size="small">
                    {s.itemCount} {s.itemCount === 1 ? "piece" : "pieces"}
                    {s.paymentMethod ? `  ·  ${PAYMENT_METHOD_LABELS[s.paymentMethod]}` : ""}
                    {s.customerName ? `  ·  ${s.customerName}` : ""}
                  </T>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <T bold size="large">
                    {money(s.totalCents)}
                  </T>
                  {s.status === "VOIDED" ? <Badge label="Undone" tone="bad" /> : null}
                </View>
              </Row>
              {s.status === "COMPLETED" ? (
                undoing === s.id ? (
                  <View style={{ marginTop: SPACE.md }}>
                    <Field label="Why are you undoing this sale?" value={reason} onChangeText={setReason} maxLength={200} />
                    <Button label="Undo the sale" variant="danger" onPress={() => void undo(s.id)} disabled={!reason.trim()} busy={busy} />
                    <Button label="Keep it" variant="ghost" onPress={() => setUndoing(null)} />
                  </View>
                ) : (
                  <Button label="Undo" variant="ghost" onPress={() => { setUndoing(s.id); setReason(""); }} style={{ alignSelf: "flex-start" }} />
                )
              ) : null}
            </Card>
          ))}
          {data.sales.length === 0 ? <T tone="moss">No sales yet today.</T> : null}
        </>
      ) : loading ? (
        <T tone="moss">Loading…</T>
      ) : null}
    </Screen>
  );
}
