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
 * interface, never to a concrete transport — `WebRtcStreamingEngine` is
 * the only implementation today (see `createStreamingEngine.ts`), but
 * keeping the UI decoupled from it means a different transport could be
 * swapped in later without touching `useStreamingSession`/`PlayerPage`.
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
