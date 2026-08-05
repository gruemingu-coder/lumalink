/**
 * Wake-on-LAN support.
 *
 * Browsers have no API for sending raw UDP packets, so a "magic
 * packet" can only be broadcast from the AlaveX Streaming *desktop*
 * app (Tauri, native Rust `UdpSocket`) — see
 * `src-tauri/src/wol.rs::send_wake_on_lan`. When running in a regular
 * browser tab, `sendWakeOnLan` resolves to `false` so the UI can show
 * a "이 기능은 데스크톱 앱에서만 동작합니다" message instead of failing silently.
 */

export class WakeOnLanUnavailableError extends Error {}

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

/**
 * Sends an IEEE 802.3 Wake-on-LAN magic packet to `mac` via UDP
 * broadcast. Throws `WakeOnLanUnavailableError` when not running
 * inside the AlaveX Streaming desktop app.
 */
export async function sendWakeOnLan(mac: string): Promise<void> {
  if (!(await runningInTauri())) {
    throw new WakeOnLanUnavailableError(
      "PC 깨우기(Wake-on-LAN)는 AlaveX Streaming 앱에서만 사용할 수 있습니다."
    );
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("send_wake_on_lan", { mac });
}

export async function isWakeOnLanSupported(): Promise<boolean> {
  return runningInTauri();
}
