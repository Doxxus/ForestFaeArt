import { colors } from "@ffa/ui/src/tokens";

/** The brand colours (ADR 005) plus the two alert colours the admin uses. Large, high-contrast, readable in sunlight (POS-13). */
export const theme = {
  ...colors,
  danger: "#8A2D22",
  dangerBg: "#F3DDD7",
  okBg: "#DDE7CF",
  warnBg: "#F3E7C3",
  white: "#FFFFFF",
} as const;

/** Every tappable thing is at least this tall, so it works with one thumb and gloves or sunscreen (POS-13). */
export const TOUCH = 56;
export const RADIUS = 14;
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const FONT = { body: 18, small: 15, large: 22, title: 28, money: 34 } as const;
