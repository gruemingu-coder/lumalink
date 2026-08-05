import { detectClientPlatform } from "./platform";

/**
 * Maps client keyboard events to host-friendly key names.
 * macOS clients remap Meta/Option so games on a Windows host receive
 * the expected Control/Alt equivalents.
 */
export function mapClientKey(rawKey: string, code?: string): string {
  const platform = detectClientPlatform();
  if (platform !== "macos") return rawKey;

  // Prefer physical key code when available (layout-independent).
  if (code) {
    switch (code) {
      case "MetaLeft":
      case "MetaRight":
        return "Control";
      case "AltLeft":
      case "AltRight":
        return "Alt";
      case "ControlLeft":
      case "ControlRight":
        return "Control";
      case "ShiftLeft":
      case "ShiftRight":
        return "Shift";
      default:
        break;
    }
  }

  switch (rawKey) {
    case "Meta":
    case "OS":
    case "Super":
      return "Control";
    case "Alt":
      return "Alt";
    case "Clear":
      return "NumLock";
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
      return rawKey;
    default:
      return rawKey;
  }
}
