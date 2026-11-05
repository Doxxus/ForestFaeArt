import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AppState } from "react-native";
import * as Network from "expo-network";
import { createApi } from "../api";
import { CATALOG_REFRESH_MS, SYNC_INTERVAL_MS } from "../config";
import { newSaleKey } from "../lib/queue";
import { secureToken, store as storage } from "../storage";
import { effectiveEventId, PosStore, type PosApi, type PosState } from "./store";

const Ctx = createContext<PosStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const store = useMemo(
    () =>
      new PosStore({
        api: (token) => createApi(token) as unknown as PosApi,
        storage: { token: secureToken, ...storage },
        now: Date.now,
        newKey: newSaleKey,
        isOnline: async () => {
          const s = await Network.getNetworkStateAsync();
          return s.isConnected !== false && s.isInternetReachable !== false;
        },
      }),
    [],
  );
  const lastCatalog = useRef(Date.now());

  useEffect(() => {
    void store.start();
    const tick = (catalog: boolean) => {
      if (catalog) lastCatalog.current = Date.now();
      void store.tick({ catalog });
    };
    const timer = setInterval(() => tick(Date.now() - lastCatalog.current > CATALOG_REFRESH_MS), SYNC_INTERVAL_MS);
    const appState = AppState.addEventListener("change", (s) => s === "active" && tick(true));
    const network = Network.addNetworkStateListener((s) => s.isInternetReachable !== false && tick(true));
    return () => {
      clearInterval(timer);
      appState.remove();
      network.remove();
    };
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function usePos(): { store: PosStore; state: PosState; eventId: string | null } {
  const store = useContext(Ctx);
  if (!store) throw new Error("usePos must be used inside AppProvider");
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { store, state, eventId: effectiveEventId(state) };
}
