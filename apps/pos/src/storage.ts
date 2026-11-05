import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEYS = {
  token: "ffa.token",
  user: "ffa.user",
  catalog: "ffa.catalog",
  queue: "ffa.queue",
  event: "ffa.event",
} as const;

// The phone's secure storage holds the sign-in token. A browser has none, which only matters when the app is tried out on a computer.
const web = Platform.OS === "web";
export const secureToken = {
  get: () => (web ? AsyncStorage.getItem(KEYS.token) : SecureStore.getItemAsync(KEYS.token)),
  set: (token: string) => (web ? AsyncStorage.setItem(KEYS.token, token) : SecureStore.setItemAsync(KEYS.token, token)),
  clear: () => (web ? AsyncStorage.removeItem(KEYS.token) : SecureStore.deleteItemAsync(KEYS.token)),
};

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // A corrupt entry is treated as empty rather than stopping the app from opening.
    return null;
  }
}

const write = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value));

export const store = {
  loadUser: () => read<{ id: string; name: string; role: "ADMIN" | "STAFF" }>(KEYS.user),
  saveUser: (v: { id: string; name: string; role: "ADMIN" | "STAFF" }) => write(KEYS.user, v),
  loadCatalog: () => read<import("./types").Catalog>(KEYS.catalog),
  saveCatalog: (v: import("./types").Catalog) => write(KEYS.catalog, v),
  loadQueue: async () => (await read<import("./lib/queue").QueuedSale[]>(KEYS.queue)) ?? [],
  saveQueue: (v: import("./lib/queue").QueuedSale[]) => write(KEYS.queue, v),
  /** undefined (nothing saved) means "follow the calendar". null means "no event". */
  loadEvent: async (): Promise<string | null | undefined> => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.event);
      return raw === null ? undefined : (JSON.parse(raw) as string | null);
    } catch {
      return undefined;
    }
  },
  saveEvent: (v: string | null | undefined) => (v === undefined ? AsyncStorage.removeItem(KEYS.event) : write(KEYS.event, v)),
  /** Signing out clears the person but never the sales still waiting to be sent. */
  clearSession: () => AsyncStorage.multiRemove([KEYS.user, KEYS.event]),
};
