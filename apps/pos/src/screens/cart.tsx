import { useMemo, useState } from "react";
import { View } from "react-native";
import { money } from "../lib/format";
import { indexById } from "../lib/catalog";
import { viewCart } from "../lib/cart";
import { useNav } from "../nav";
import { usePos } from "../state/app";
import { SPACE } from "../theme";
import { Banner, Button, Card, Row, Screen, Stepper, T } from "../ui/kit";
import { StatusStrip } from "./shared";

export function CartScreen() {
  const { state, store } = usePos();
  const nav = useNav();
  const [error, setError] = useState<string | null>(null);
  const view = useMemo(() => viewCart(state.cart, indexById(state.catalog)), [state.cart, state.catalog]);

  return (
    <Screen title="Cart">
      <StatusStrip />
      {view.lines.length === 0 ? (
        <>
          <T tone="moss" style={{ marginBottom: SPACE.lg }}>
            Your cart is empty. Scan a label or search for a piece to add it.
          </T>
          <Button label="Scan a label" onPress={() => nav.go({ name: "scan" })} />
        </>
      ) : (
        <>
          {error ? <Banner tone="error">{error}</Banner> : null}
          {view.blocked.map((b) => (
            <Banner key={b.piece.id} tone="error">
              {b.piece.title}: {b.message} Please remove it.
            </Banner>
          ))}
          {view.lines.map((l) => (
            <Card key={l.piece.id}>
              <T bold>{l.piece.title}</T>
              <T tone="moss" size="small">
                {l.piece.sku} · {money(l.piece.priceCents)} each
              </T>
              <Row style={{ marginTop: SPACE.sm }}>
                {l.piece.quantity > 1 ? (
                  <Stepper
                    value={l.quantity}
                    min={1}
                    max={l.piece.quantity}
                    onChange={(n) => {
                      const r = store.changeQuantity(l.piece, n);
                      setError(r.ok ? null : r.message);
                    }}
                  />
                ) : null}
                <View style={{ flex: 1 }} />
                <T bold size="large">
                  {money(l.lineCents)}
                </T>
              </Row>
              <Button label="Remove" variant="ghost" onPress={() => store.removePiece(l.piece.id)} style={{ alignSelf: "flex-start", marginTop: SPACE.xs }} />
            </Card>
          ))}
          <Row style={{ justifyContent: "space-between", marginVertical: SPACE.md }}>
            <T size="large" bold>
              Total
            </T>
            <T size="money" bold tone="forest">
              {view.totals.ok ? money(view.totals.totalCents) : ""}
            </T>
          </Row>
          <Button label="Check out" onPress={() => nav.go({ name: "checkout" })} disabled={view.blocked.length > 0} style={{ minHeight: 72 }} />
          <Button label="Scan another piece" variant="secondary" onPress={() => nav.go({ name: "scan" })} style={{ marginTop: SPACE.sm }} />
          <Button label="Empty the cart" variant="ghost" onPress={() => store.clearCart()} style={{ marginTop: SPACE.sm }} />
        </>
      )}
    </Screen>
  );
}
