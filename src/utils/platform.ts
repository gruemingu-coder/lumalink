import { isTauri } from "@tauri-apps/api/core";

/**
 * True when running as the LumaLink Streaming desktop app (Tauri), false
 * in a plain browser. Drives two things: whether the login gate/full app
 * (`/app/*`, `/player/*`) is reachable at all — the public website is
 * intro/download only — and which pairing/discovery features are
 * available (LAN UDP discovery and Wake-on-LAN need a native backend a
 * browser tab can't provide).
 */
export function isDesktopApp(): boolean {
  return isTauri();
}
