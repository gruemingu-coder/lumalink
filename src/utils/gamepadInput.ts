import type { GamepadStateWire } from "@/services/streaming/signalingProtocol";

const STANDARD_BUTTON_COUNT = 17;
const AXIS_COUNT = 4;

/**
 * Reads a `Gamepad` into the wire shape we forward to the host. We only
 * rely on the browser's "standard" mapping (Xbox/PlayStation controllers
 * are normalized to it by Chromium/WebView2) — non-standard controllers
 * still get read positionally on a best-effort basis.
 */
export function readGamepadSnapshot(gp: Gamepad): GamepadStateWire {
  const buttons = new Array<number>(STANDARD_BUTTON_COUNT).fill(0);
  for (let i = 0; i < Math.min(gp.buttons.length, STANDARD_BUTTON_COUNT); i++) {
    const b = gp.buttons[i];
    buttons[i] = typeof b.value === "number" ? b.value : b.pressed ? 1 : 0;
  }
  const axes = new Array<number>(AXIS_COUNT).fill(0);
  for (let i = 0; i < Math.min(gp.axes.length, AXIS_COUNT); i++) {
    axes[i] = gp.axes[i];
  }
  return { connected: true, buttons, axes };
}

const DISCONNECTED_STATE: GamepadStateWire = {
  connected: false,
  buttons: [],
  axes: [],
};

/**
 * Polls `navigator.getGamepads()` on every animation frame and reports
 * only when a connected pad's state actually changes (or disconnects).
 * Returns a cleanup function that stops polling and reports every
 * previously-seen pad as disconnected.
 */
export function startGamepadPolling(
  onUpdate: (index: number, state: GamepadStateWire) => void
): () => void {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return () => undefined;
  }

  let raf = 0;
  let stopped = false;
  const lastSerialized = new Map<number, string>();

  const tick = () => {
    if (stopped) return;
    const pads = navigator.getGamepads();
    const seen = new Set<number>();
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      seen.add(gp.index);
      const snapshot = readGamepadSnapshot(gp);
      const serialized = JSON.stringify(snapshot);
      if (lastSerialized.get(gp.index) !== serialized) {
        lastSerialized.set(gp.index, serialized);
        onUpdate(gp.index, snapshot);
      }
    }
    for (const index of Array.from(lastSerialized.keys())) {
      if (!seen.has(index)) {
        lastSerialized.delete(index);
        onUpdate(index, DISCONNECTED_STATE);
      }
    }
    raf = requestAnimationFrame(tick);
  };

  raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    for (const index of lastSerialized.keys()) {
      onUpdate(index, DISCONNECTED_STATE);
    }
  };
}
