import { useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { money } from "../lib/format";
import { findBySku, indexById, piecesAtEvent, searchPieces } from "../lib/catalog";
import { viewCart } from "../lib/cart";
import { useNav } from "../nav";
import { usePos } from "../state/app";
import { FONT, RADIUS, SPACE, theme, TOUCH } from "../theme";
import { Banner, Button, Card, Row, Screen, T } from "../ui/kit";
import { PieceRow, StatusStrip } from "./shared";

export function HomeScreen() {
  const { state, store, eventId } = usePos();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState(false);
  const catalog = state.catalog;
  const event = catalog?.events.find((e) => e.id === eventId) ?? null;

  const results = useMemo(() => (q.trim() ? searchPieces(catalog, q, { eventId }) : piecesAtEvent(catalog, eventId)), [catalog, q, eventId]);
  const cart = useMemo(() => viewCart(state.cart, indexById(catalog)), [state.cart, catalog]);
  const cartCount = cart.lines.reduce((n, l) => n + l.quantity, 0);
  const cartTotal = cart.totals.ok ? cart.totals.totalCents : 0;
  const exact = q.trim() ? findBySku(catalog, q.trim()) : null;

  return (
    <Screen title="Sell" scroll>
      <StatusStrip />
      {!catalog ? <Banner tone="warn">{state.online ? "Loading your pieces…" : "Your pieces haven't loaded yet. Connect to the internet once to download them."}</Banner> : null}

      <Pressable accessibilityRole="button" accessibilityLabel={`Selling at: ${event ? event.title : "no event"}. Tap to change.`} onPress={() => setPicking((p) => !p)} style={styles.eventRow}>
        <View style={{ flex: 1 }}>
          <T tone="moss" size="small">
            Selling at
          </T>
          <T bold>{event ? event.title : "No event"}</T>
        </View>
        <T tone="forest" bold>
          {picking ? "Close" : "Change"}
        </T>
      </Pressable>
      {picking ? (
        <Card>
          {(catalog?.events ?? []).map((e) => (
            <Button
              key={e.id}
              label={e.title}
              variant={e.id === eventId ? "primary" : "secondary"}
              style={{ marginBottom: SPACE.sm }}
              onPress={() => {
                void store.setEvent(e.id);
                setPicking(false);
              }}
            />
          ))}
          <Button
            label="No event"
            variant={eventId === null ? "primary" : "secondary"}
            style={{ marginBottom: SPACE.sm }}
            onPress={() => {
              void store.setEvent(null);
              setPicking(false);
            }}
          />
          {state.eventChoice !== undefined ? (
            <Button
              label="Pick for me from the calendar"
              variant="ghost"
              onPress={() => {
                void store.setEvent(undefined);
                setPicking(false);
              }}
            />
          ) : null}
        </Card>
      ) : null}

      <Button label="Scan a label" onPress={() => nav.go({ name: "scan" })} style={{ minHeight: 84, marginVertical: SPACE.md }} accessibilityHint="Opens the camera to read the QR code on a label" />

      <TextInput
        accessibilityLabel="Find a piece by name or number"
        placeholder="Or type a name or number"
        placeholderTextColor={theme.moss}
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={() => exact && nav.go({ name: "item", pieceId: exact.id })}
        style={styles.search}
      />

      {q.trim() === "" && event ? (
        <T tone="moss" size="small" style={{ marginBottom: SPACE.sm }}>
          {results.length ? `Pieces taken to ${event.title}` : `Nothing has been taken to ${event.title} yet.`}
        </T>
      ) : null}
      {results.map((p) => (
        <PieceRow key={p.id} piece={p} onPress={() => nav.go({ name: "item", pieceId: p.id })} />
      ))}
      {q.trim() !== "" && results.length === 0 ? <T tone="moss">Nothing matches “{q.trim()}”.</T> : null}

      {cartCount > 0 ? (
        <Card style={{ marginTop: SPACE.md }}>
          <Row>
            <View style={{ flex: 1 }}>
              <T bold>
                Cart: {cartCount} {cartCount === 1 ? "piece" : "pieces"}
              </T>
              <T tone="moss">{money(cartTotal)}</T>
            </View>
            <Button label="Check out" onPress={() => nav.go({ name: "checkout" })} />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eventRow: { flexDirection: "row", alignItems: "center", minHeight: TOUCH, backgroundColor: theme.parchment, borderRadius: RADIUS, borderWidth: 1, borderColor: theme.stone, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, marginBottom: SPACE.sm },
  search: { minHeight: TOUCH, borderWidth: 1.5, borderColor: theme.stone, borderRadius: RADIUS, backgroundColor: theme.white, paddingHorizontal: SPACE.md, fontSize: FONT.body, color: theme.ink, marginBottom: SPACE.md },
});
