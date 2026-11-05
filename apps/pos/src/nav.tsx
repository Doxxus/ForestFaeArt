import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BackHandler } from "react-native";
import type { CheckoutOutcome } from "./state/store";

/** Every screen. A small stack of these is all the navigation the app needs. */
export type Route =
  | { name: "home" }
  | { name: "scan" }
  | { name: "item"; pieceId: string }
  | { name: "cart" }
  | { name: "checkout" }
  | { name: "done"; outcome: Extract<CheckoutOutcome, { kind: "recorded" | "queued" }> }
  | { name: "today" }
  | { name: "more" };

export const TABS: { route: Route["name"]; label: string }[] = [
  { route: "home", label: "Sell" },
  { route: "cart", label: "Cart" },
  { route: "today", label: "Today" },
  { route: "more", label: "More" },
];

interface Nav {
  route: Route;
  stack: Route[];
  /** Open a screen on top of this one. */
  go(route: Route): void;
  back(): void;
  /** Switch to a main section, clearing anything opened on top. */
  tab(name: Route["name"]): void;
  /** Replace the whole stack, for example after a sale is done. */
  reset(route: Route): void;
}

const NavCtx = createContext<Nav | null>(null);

export function NavProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [stack, setStack] = useState<Route[]>([{ name: "home" }]);
  const route = stack[stack.length - 1]!;

  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: "home" }])), []);
  const go = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const tab = useCallback((name: Route["name"]) => setStack([{ name } as Route]), []);
  const reset = useCallback((r: Route) => setStack([r]), []);

  // The Android back button steps back, and only leaves the app from the Sell screen.
  useEffect(() => {
    if (!enabled) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (stack.length > 1) {
        back();
        return true;
      }
      if (route.name !== "home") {
        setStack([{ name: "home" }]);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [enabled, stack.length, route.name, back]);

  const value = useMemo<Nav>(() => ({ route, stack, go, back, tab, reset }), [route, stack, go, back, tab, reset]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(NavCtx);
  if (!nav) throw new Error("useNav must be used inside NavProvider");
  return nav;
}
