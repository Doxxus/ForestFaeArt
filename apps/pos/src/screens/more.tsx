import { useState } from "react";
import { View } from "react-native";
import { ago, money, timeOf } from "../lib/format";
import { pendingSales, reviewSales } from "../lib/queue";
import { usePos } from "../state/app";
import { SPACE } from "../theme";
import { Banner, Button, Card, H, Row, Screen, T } from "../ui/kit";
import { StatusStrip } from "./shared";

export function MoreScreen() {
  const { state, store } = usePos();
  const [busy, setBusy] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const waiting = pendingSales(state.queue);
  const review = reviewSales(state.queue);

  const refresh = async () => {
    setBusy(true);
    await store.tick({ catalog: true });
    setBusy(false);
  };

  return (
    <Screen title="More">
      <StatusStrip />

      {review.length ? (
        <Card>
          <H>Sales that need your attention</H>
          <T tone="moss" size="small" style={{ marginBottom: SPACE.sm }}>
            The customer already paid, but the shop couldn't record these. Check what happened, then try again or discard it and sort it out by hand.
          </T>
          {review.map((q) => (
            <View key={q.key} style={{ marginBottom: SPACE.md }}>
              <T bold>
                {timeOf(q.createdAt)}  ·  {money(q.summary.totalCents)}
              </T>
              <T>{q.summary.titles.join(", ")}</T>
              <T tone="danger">{q.error}</T>
              {discarding === q.key ? (
                <Row style={{ marginTop: SPACE.sm }}>
                  <Button label="Yes, discard it" variant="danger" onPress={() => { setDiscarding(null); void store.discardSale(q.key); }} style={{ flex: 1 }} />
                  <Button label="Keep" variant="ghost" onPress={() => setDiscarding(null)} />
                </Row>
              ) : (
                <Row style={{ marginTop: SPACE.sm }}>
                  <Button label="Try again" variant="secondary" onPress={() => void store.retryReview(q.key)} style={{ flex: 1 }} />
                  <Button label="Discard" variant="ghost" onPress={() => setDiscarding(q.key)} />
                </Row>
              )}
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <H>Pieces and sales</H>
        <T>
          {state.catalog ? `${state.catalog.pieces.length} pieces on this phone` : "No pieces downloaded yet"}
          {state.catalogAt ? `, updated ${ago(state.catalogAt, Date.now())}` : ""}.
        </T>
        <T tone="moss" size="small" style={{ marginVertical: SPACE.sm }}>
          {waiting.length ? `${waiting.length} ${waiting.length === 1 ? "sale is" : "sales are"} waiting to send.` : "Every sale has been sent."}
        </T>
        <Button label="Update now" variant="secondary" onPress={() => void refresh()} busy={busy || state.syncing} />
      </Card>

      <Card>
        <H>Signed in</H>
        <T>
          {state.user?.name} ({state.user?.role === "ADMIN" ? "Administrator" : "Staff"})
        </T>
        <T tone="moss" size="small" style={{ marginVertical: SPACE.sm }}>
          You stay signed in for the day, even with no signal.
        </T>
        {confirmOut ? (
          <>
            {waiting.length ? <Banner tone="warn">{waiting.length} {waiting.length === 1 ? "sale is" : "sales are"} still waiting to send. They stay on this phone and go out after the next sign-in.</Banner> : null}
            <Button label="Yes, sign out" variant="danger" onPress={() => void store.signOut()} />
            <Button label="Stay signed in" variant="ghost" onPress={() => setConfirmOut(false)} />
          </>
        ) : (
          <Button label="Sign out" variant="secondary" onPress={() => setConfirmOut(true)} />
        )}
      </Card>
    </Screen>
  );
}
