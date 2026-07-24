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
 * interface, never to a concrete transport. That means a future
 * WebRTC implementation (SDP/ICE negotiation, `RTCPeerConnection`,
 * a `<video>` sink fed by `ontrack`) can be swapped in by writing a
 * new class that implements `StreamingEngine` and updating
 * `createStreamingEngine` — no other file needs to change.
 *
 * Suggested real-world implementation notes for a WebRTC engine:
 *  - `connect()` would open a signaling channel (e.g. WebSocket) to the
 *    host agent, exchange SDP offer/answer + ICE candidates, then
 *    resolve once the `RTCPeerConnection` reaches "connected".
 *  - Video/audio would arrive via `RTCPeerConnection.ontrack` and be
 *    attached to a `<video>` element instead of the mock `<canvas>`.
 *  - `onStats` would poll `RTCPeerConnection.getStats()` on an
 *    interval and translate the report into `StreamStats`.
 *  - Input (mouse/keyboard/gamepad) would be sent over an
 *    `RTCDataChannel` — see `sendInput` below for the hook point.
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

  /**
   * Hook point for forwarding local input to the host.
   * A WebRTC implementation would forward this over an RTCDataChannel.
   */
  sendInput(event: InputForwardEvent): void;

  /**
   * Optional: attach a render target. The mock engine draws an
   * animated placeholder into a <canvas>; a WebRTC engine would
   * instead attach its incoming MediaStream to a <video> element.
   */
  attachRenderTarget(target: HTMLCanvasElement | HTMLVideoElement): void;

  /**
   * Optional: subscribe to the host's installed-game list, sent once
   * right after successful pairing/auth. Only implemented by engines
   * that talk to a real Host App (see `WebRtcStreamingEngine`); the
   * mock engine simply never calls the callback.
   */
  onRemoteGames?(
    callback: (games: import("./signalingProtocol").RemoteGameSummary[]) => void
  ): Unsubscribe;
}

export type InputForwardEvent =
  | { type: "pointerdown" | "pointerup" | "pointermove"; x: number; y: number }
  | { type: "keydown" | "keyup"; key: string };
