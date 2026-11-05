import { useState } from "react";
import { Image, Linking, StyleSheet, View } from "react-native";
import { WEB_URL } from "../config";
import { money } from "../lib/format";
import { sellability } from "../lib/catalog";
import { useNav } from "../nav";
import { usePos } from "../state/app";
import { RADIUS, SPACE, theme } from "../theme";
import { Badge, Banner, Button, Card, Row, Screen, Spacer, Stepper, T } from "../ui/kit";
import { STATUS_WORDS, photoUri } from "./shared";

/** One piece: its photo, price and state, and the sale buttons (POS-3). The state warnings are in words, never just colour. */
export function ItemScreen({ pieceId }: { pieceId: string }) {
  const { state, store } = usePos();
  const nav = useNav();
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const piece = state.catalog?.pieces.find((p) => p.id === pieceId);

  if (!piece) {
    return (
      <Screen title="Piece" onBack={nav.back}>
        <Banner tone="warn">That piece isn't in your list any more.</Banner>
      </Screen>
    );
  }

  const inCart = state.cart.find((l) => l.productId === piece.id)?.quantity ?? 0;
  const room = Math.max(0, piece.quantity - inCart);
  const base = sellability(piece, 1);
  const allInCart = base.level !== "blocked" && inCart > 0 && room === 0;
  const status = STATUS_WORDS[piece.status];
  const uri = photoUri(piece.thumbnailKey, 640);

  const add = (): boolean => {
    const result = store.addPiece(piece, qty);
    if (!result.ok) setError(result.message);
    return result.ok;
  };

  return (
    <Screen title={piece.sku} onBack={nav.back}>
      {uri ? (
        <Image source={{ uri }} style={styles.photo} resizeMode="cover" accessibilityLabel={`Photo of ${piece.title}`} />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <T tone="moss">No photo yet</T>
        </View>
      )}
      <Spacer h={SPACE.md} />
      <T size="title" bold tone="forest">
        {piece.title}
      </T>
      <Row style={{ marginVertical: SPACE.sm }}>
        <T size="money" bold>
          {money(piece.priceCents)}
        </T>
        <Badge label={status.label} tone={base.level === "blocked" ? "bad" : status.tone} />
      </Row>
      {piece.quantity > 1 ? <T tone="moss">{piece.quantity} in stock</T> : null}

      {base.level === "blocked" ? <Banner tone="error">{base.message}</Banner> : null}
      {base.level === "confirm" ? <Banner tone="warn">{base.message} Only sell it if you are sure.</Banner> : null}
      {piece.listedOnEtsy ? <Banner tone="info">Also listed on Etsy. After you sell it, remember to remove or update the Etsy listing.</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
      {allInCart ? <Banner tone="ok">{inCart === 1 ? "This piece is in your cart." : `All ${inCart} are in your cart.`}</Banner> : null}

      {base.level !== "blocked" && !allInCart ? (
        <>
          {piece.quantity > 1 ? (
            <Card>
              <Row>
                <T bold style={{ flex: 1 }}>
                  How many?
                </T>
                <Stepper value={Math.min(qty, room)} min={1} max={room} onChange={setQty} />
              </Row>
            </Card>
          ) : null}
          <Button
            label={base.level === "confirm" ? "Sell anyway" : "Sell now"}
            onPress={() => {
              if (add()) nav.go({ name: "checkout" });
            }}
            style={{ minHeight: 72, marginTop: SPACE.sm }}
            accessibilityHint="Goes to payment"
          />
          <Button
            label="Add to cart and scan another"
            variant="secondary"
            onPress={() => {
              if (add()) nav.back();
            }}
            style={{ marginTop: SPACE.sm }}
          />
        </>
      ) : null}
      {allInCart ? (
        <>
          <Button label="Check out" onPress={() => nav.go({ name: "checkout" })} style={{ minHeight: 72, marginTop: SPACE.sm }} />
          <Button label="Go to my cart" variant="secondary" onPress={() => nav.go({ name: "cart" })} style={{ marginTop: SPACE.sm }} />
        </>
      ) : null}

      <Button label="Print a label for this piece" variant="ghost" onPress={() => void Linking.openURL(`${WEB_URL}/admin/labels?ids=${piece.id}`)} style={{ marginTop: SPACE.lg }} accessibilityHint="Opens the label page in your browser" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: "100%", height: 280, borderRadius: RADIUS, backgroundColor: theme.stone },
  noPhoto: { alignItems: "center", justifyContent: "center", backgroundColor: theme.sage },
});
