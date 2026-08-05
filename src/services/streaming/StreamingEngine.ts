import type {
  StreamConnectConfig,
  StreamSessionStatus,
  StreamStats,
} from "@/types/domain";

export type Unsubscribe = () => void;

/**
 * Transport-agnostic contract for a streaming engine.
 *
 * The UI (`PlayerPage`, `StreamHud`, etc.) only ever talks to this
 * interface — `NativeH264StreamingEngine` is the primary transport
 * (see `createStreamingEngine.ts`).
 */
export interface StreamingEngine {
  /** Establish a session for the given host/game/settings. */
  connect(config: StreamConnectConfig): Promise<void>;

  /** Tear down the session and release all resources. */
  disconnect(): Promise<void>;

  /** Subscribe to periodic stats updates. Returns an unsubscribe fn. */
  onStats(callback: (stats: StreamStats) => void): Unsubscribe;

  /** Subscribe to session status transitions. Returns an unsubscribe fn. */
  onStatusChange(callback: (status: StreamSessionStatus) => void): Unsubscribe;

  /** Forward local input to the host (signaling WS or data channel). */
  sendInput(event: InputForwardEvent): void;

  /**
   * Forward a local gamepad's state to the host, which maps it onto a
   * virtual XInput controller (Xbox/DualSense/DualShock 4, ...). Optional
   * — engines that don't support controller passthrough simply ignore it.
   */
  sendGamepad?(
    index: number,
    state: import("./signalingProtocol").GamepadStateWire
  ): void;

  /** Attach the <video> element that the incoming MediaStream is rendered into. */
  attachRenderTarget(target: HTMLVideoElement): void;

  /**
   * Optional: subscribe to the host's installed-game list, sent once
   * right after successful pairing/auth.
   */
  onRemoteGames?(
    callback: (games: import("./signalingProtocol").RemoteGameSummary[]) => void
  ): Unsubscribe;
}

export type InputForwardEvent =
  | { type: "pointerdown" | "pointerup" | "pointermove"; x: number; y: number }
  | { type: "keydown" | "keyup"; key: string };
