import { getLocalStore } from "./localStore";

/**
 * Stable identity for this Host App install, generated once and
 * persisted locally. The cloud device-sync heartbeat (`POST /api/devices`)
 * upserts by this id, so re-registering never creates duplicate rows and
 * survives PIN regeneration, IP changes, or renaming.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const store = await getLocalStore();
  const existing = await store.get<string>("deviceId");
  if (existing) return existing;

  const id = crypto.randomUUID();
  await store.set("deviceId", id);
  await store.save();
  return id;
}
