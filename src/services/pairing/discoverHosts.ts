/**
 * LAN auto-discovery for real AlaveX Host apps. Only available from
 * the AlaveX Streaming *desktop* app (Tauri) — browsers have no API
 * for receiving raw UDP broadcasts, so the plain website always falls
 * back to manual IP entry. See `src-tauri/src/discovery.rs` and
 * `host-app/src-tauri/src/discovery.rs`.
 */

export interface DiscoveredHost {
  name: string;
  address: string;
  signalPort: number;
}

let cachedIsTauri: boolean | null = null;

async function runningInTauri(): Promise<boolean> {
  if (cachedIsTauri !== null) return cachedIsTauri;
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    cachedIsTauri = isTauri();
  } catch {
    cachedIsTauri = false;
  }
  return cachedIsTauri;
}

export async function isLanDiscoverySupported(): Promise<boolean> {
  return runningInTauri();
}

/** Listens for `timeoutMs` and returns whatever AlaveX Hosts announced themselves. */
export async function discoverHostsOnLan(timeoutMs = 2500): Promise<DiscoveredHost[]> {
  if (!(await runningInTauri())) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DiscoveredHost[]>("discover_hosts", { timeoutMs });
}
