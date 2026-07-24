import { Store } from "@tauri-apps/plugin-store";

const STORE_PATH = "auth-store.json";

let storePromise: Promise<Store> | null = null;

/** Shared on-disk key/value store: session token/email (`AuthContext`)
 * and this install's stable device id (`deviceId.ts`). */
export function getLocalStore(): Promise<Store> {
  if (!storePromise) storePromise = Store.load(STORE_PATH);
  return storePromise;
}
