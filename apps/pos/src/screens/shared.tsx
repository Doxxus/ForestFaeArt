import { Image, Pressable, StyleSheet, View } from "react-native";
import { API_URL } from "../config";
import { money } from "../lib/format";
import { pendingSales, reviewSales } from "../lib/queue";
import { sellability } from "../lib/catalog";
import { useNav } from "../nav";
import { usePos } from "../state/app";
import { FONT, RADIUS, SPACE, theme, TOUCH } from "../theme";
import type { Piece } from "../types";
import { Badge, Banner, T } from "../ui/kit";

export const photoUri = (key: string | null, width = 320): string | null => (key ? `${API_URL}/media/${key}?w=${width}` : null);

export const STATUS_WORDS: Record<Piece["status"], { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  AVAILABLE: { label: "Available", tone: "good" },
  AT_EVENT: { label: "At the event", tone: "good" },
  RESERVED: { label: "Reserved", tone: "warn" },
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warn" },
  SOLD: { label: "Sold", tone: "bad" },
  DRAFT: { label: "Draft", tone: "neutral" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};

/** Connection and waiting-sale messages (POS-10). Shown on every main screen so nobody is ever unsure whether a sale is safe. */
export function StatusStrip() {
  const { state } = usePos();
  const nav = useNav();
  const waiting = pendingSales(state.queue).length;
  const review = reviewSales(state.queue).length;
  return (
    <>
      {review > 0 ? (
        <Banner tone="error" action={{ label: "Look", onPress: () => nav.tab("more") }}>
          {review === 1 ? "1 sale couldn't be recorded and needs your attention." : `${review} sales couldn't be recorded and need your attention.`}
        </Banner>
      ) : null}
      {!state.online ? (
        <Banner tone="warn">
          No connection. You can keep selling. Sales are saved on this phone and sent when you're back online.
          {waiting > 0 ? ` ${waiting} waiting to send.` : ""}
        </Banner>
      ) : waiting > 0 ? (
        <Banner tone="info">{waiting === 1 ? "1 sale is waiting to send." : `${waiting} sales are waiting to send.`}</Banner>
      ) : null}
    </>
  );
}

export function PieceRow({ piece, onPress }: { piece: Piece; onPress: () => void }) {
  const status = STATUS_WORDS[piece.status];
  const s = sellability(piece);
  const uri = photoUri(piece.thumbnailKey, 160);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${piece.title}, ${money(piece.priceCents)}, ${status.label}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
      {uri ? <Image source={{ uri }} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={[styles.thumb, styles.noThumb]} />}
      <View style={{ flex: 1 }}>
        <T bold numberOfLines={2}>
          {piece.title}
        </T>
        <T tone="moss" size="small">
          {piece.sku}
          {piece.quantity > 1 ? `  ·  ${piece.quantity} in stock` : ""}
        </T>
        <View style={{ marginTop: 4 }}>
          <Badge label={status.label} tone={s.level === "blocked" ? "bad" : status.tone} />
        </View>
      </View>
      <T bold size="large">
        {money(piece.priceCents)}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: TOUCH + 24, backgroundColor: theme.parchment, borderRadius: RADIUS, borderWidth: 1, borderColor: theme.stone, padding: SPACE.md, marginBottom: SPACE.sm },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: theme.stone },
  noThumb: { borderWidth: 1, borderColor: theme.stone, backgroundColor: theme.sage },
});

export const BIG = FONT.money;
