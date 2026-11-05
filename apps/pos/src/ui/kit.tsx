import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FONT, RADIUS, SPACE, theme, TOUCH } from "../theme";

export function Screen({ title, children, onBack, right, scroll = true }: { title?: string; children: ReactNode; onBack?: () => void; right?: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const bodyStyle = [styles.screenBody, { paddingBottom: 120 + insets.bottom }];
  const body = scroll ? (
    <ScrollView contentContainerStyle={bodyStyle} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={bodyStyle}>{children}</View>
  );
  return (
    <View style={styles.screen}>
      {title || onBack ? (
        <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.back} hitSlop={8}>
              <Text style={styles.backText}>‹ Back</Text>
            </Pressable>
          ) : null}
          {title ? (
            <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <View style={{ marginLeft: "auto" }}>{right}</View>
        </View>
      ) : null}
      {body}
    </View>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({ label, onPress, variant = "primary", disabled, busy, style, accessibilityHint }: { label: string; onPress: () => void; variant?: Variant; disabled?: boolean; busy?: boolean; style?: StyleProp<ViewStyle>; accessibilityHint?: string }) {
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.button, buttonStyles[variant], off && styles.buttonOff, pressed && styles.pressed, style]}
    >
      {busy ? <ActivityIndicator color={variant === "primary" || variant === "danger" ? theme.cream : theme.forest} /> : <Text style={[styles.buttonText, textStyles[variant]]}>{label}</Text>}
    </Pressable>
  );
}

/** A choice among several, like a payment method. Big, and says which one is chosen in words, not just colour. */
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, selected && styles.choiceOn, pressed && styles.pressed]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>
        {selected ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.h}>
      {children}
    </Text>
  );
}

export function T({ children, tone = "ink", size = "body", bold, style, numberOfLines }: { children: ReactNode; tone?: "ink" | "moss" | "danger" | "forest" | "cream"; size?: keyof typeof FONT; bold?: boolean; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: theme[tone], fontSize: FONT[size], fontWeight: bold ? "700" : "400" }, style]}>
      {children}
    </Text>
  );
}

export function Banner({ tone, children, action }: { tone: "info" | "warn" | "error" | "ok"; children: ReactNode; action?: { label: string; onPress: () => void } }) {
  const bg = { info: theme.parchment, warn: theme.warnBg, error: theme.dangerBg, ok: theme.okBg }[tone];
  const border = { info: theme.stone, warn: theme.copperDeep, error: theme.danger, ok: theme.moss }[tone];
  return (
    <View accessibilityRole={tone === "error" ? "alert" : undefined} style={[styles.banner, { backgroundColor: bg, borderColor: border }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: tone === "error" ? theme.danger : theme.ink, fontSize: FONT.small, lineHeight: 21 }}>{children}</Text>
      </View>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.bannerAction} hitSlop={8}>
          <Text style={{ color: theme.forest, fontWeight: "700", fontSize: FONT.small }}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Badge({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const bg = { good: theme.okBg, warn: theme.warnBg, bad: theme.dangerBg, neutral: theme.stone }[tone];
  const fg = tone === "bad" ? theme.danger : theme.ink;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: FONT.small, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: SPACE.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={theme.moss} {...props} style={[styles.input, props.style]} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** − 1 + for quantities. Big enough to hit with a thumb (POS-15). */
export function Stepper({ value, onChange, min = 0, max }: { value: number; onChange: (n: number) => void; min?: number; max: number }) {
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel="One fewer" disabled={value <= min} onPress={() => onChange(value - 1)} style={[styles.stepBtn, value <= min && styles.buttonOff]}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text accessibilityLabel={`Quantity ${value}`} style={styles.stepValue}>
        {value}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="One more" disabled={value >= max} onPress={() => onChange(value + 1)} style={[styles.stepBtn, value >= max && styles.buttonOff]}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: "row", alignItems: "center", gap: SPACE.md }, style]}>{children}</View>;

export const Spacer = ({ h = SPACE.lg }: { h?: number }) => <View style={{ height: h }} />;

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: theme.forest },
  secondary: { backgroundColor: "transparent", borderWidth: 2, borderColor: theme.forest },
  danger: { backgroundColor: theme.danger },
  ghost: { backgroundColor: "transparent" },
});
const textStyles = StyleSheet.create({
  primary: { color: theme.cream },
  secondary: { color: theme.forest },
  danger: { color: theme.cream },
  ghost: { color: theme.forest },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.cream },
  screenBody: { padding: SPACE.lg, paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, backgroundColor: theme.forest, minHeight: 60, gap: SPACE.md },
  headerTitle: { color: theme.cream, fontSize: FONT.large, fontWeight: "700", flexShrink: 1 },
  back: { minHeight: 44, justifyContent: "center", paddingRight: SPACE.sm },
  backText: { color: theme.champagne, fontSize: FONT.body, fontWeight: "600" },
  button: { minHeight: TOUCH, borderRadius: RADIUS, paddingHorizontal: SPACE.xl, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: FONT.large - 2, fontWeight: "700" },
  buttonOff: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  choice: { minHeight: TOUCH, borderRadius: RADIUS, borderWidth: 2, borderColor: theme.forest, paddingHorizontal: SPACE.lg, alignItems: "center", justifyContent: "center", flexGrow: 1, flexBasis: "45%", backgroundColor: theme.cream },
  choiceOn: { backgroundColor: theme.forest },
  choiceText: { fontSize: FONT.large - 2, fontWeight: "700", color: theme.forest },
  choiceTextOn: { color: theme.cream },
  card: { backgroundColor: theme.parchment, borderRadius: RADIUS, borderWidth: 1, borderColor: theme.stone, padding: SPACE.lg, marginBottom: SPACE.md },
  h: { fontSize: FONT.large, fontWeight: "700", color: theme.forest, marginBottom: SPACE.sm },
  banner: { flexDirection: "row", alignItems: "center", gap: SPACE.md, borderWidth: 1, borderRadius: RADIUS, padding: SPACE.md, marginBottom: SPACE.md },
  bannerAction: { minHeight: 44, justifyContent: "center", paddingHorizontal: SPACE.sm },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  label: { fontSize: FONT.small, fontWeight: "700", color: theme.forest, marginBottom: 4 },
  input: { minHeight: TOUCH, borderWidth: 1.5, borderColor: theme.stone, borderRadius: RADIUS, backgroundColor: theme.white, paddingHorizontal: SPACE.md, fontSize: FONT.body, color: theme.ink },
  hint: { fontSize: FONT.small - 1, color: theme.moss, marginTop: 4 },
  stepper: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  stepBtn: { width: TOUCH, height: TOUCH, borderRadius: RADIUS, backgroundColor: theme.forest, alignItems: "center", justifyContent: "center" },
  stepText: { color: theme.cream, fontSize: 30, fontWeight: "700", lineHeight: 34 },
  stepValue: { minWidth: 44, textAlign: "center", fontSize: FONT.large, fontWeight: "700", color: theme.ink },
});
