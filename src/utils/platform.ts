import { isTauri } from "@tauri-apps/api/core";

/**
 * True when running as the AlaveX Streaming native app (Tauri on
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

/**
 * True when we're a plain browser tab loaded over `https://` (the public
 * website), where connecting to a LAN host's insecure `ws://`/`http://`
 * signaling server will be blocked outright by the browser's mixed-content
 * policy — this has no code-level workaround; it's enforced by the browser
 * regardless of CSP. Use this to short-circuit connection attempts with an
 * accurate error instead of a confusing generic "network error", and to
 * steer the user toward the native AlaveX app instead.
 */
export function isBlockedByMixedContent(): boolean {
  if (isNativeApp()) return false;
  if (typeof window === "undefined") return false;
  return window.location.protocol === "https:";
}

export const MIXED_CONTENT_ERROR_MESSAGE =
  "브라우저 보안 정책상 HTTPS 웹사이트에서는 암호화되지 않은 LAN 연결(ws://)을 열 수 없습니다. " +
  "AlaveX Streaming 네이티브 앱(Windows/Mac/Android/iOS)을 설치해 연결해주세요.";
