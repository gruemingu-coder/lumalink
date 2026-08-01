import { isTauri } from "@tauri-apps/api/core";

/**
 * True when running as the LumaLink Streaming native app (Tauri on
 * Windows / macOS / Android / iOS). False in a plain browser — the public
 * site stays intro/download only.
 */
export function isNativeApp(): boolean {
  return isTauri();
}

/** Alias kept for existing call sites. Prefer `isNativeApp`. */
export function isDesktopApp(): boolean {
  return isNativeApp();
}

export type ClientPlatform = "windows" | "macos" | "android" | "ios" | "web" | "unknown";

/** Best-effort OS hint for UI copy (download badges, settings). */
export function detectClientPlatform(): ClientPlatform {
  if (!isNativeApp()) return "web";
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/mac os x|macintosh/.test(ua)) return "macos";
  if (/windows/.test(ua)) return "windows";
  return "unknown";
}

export function isMobileNativeApp(): boolean {
  const p = detectClientPlatform();
  return p === "android" || p === "ios";
}
