/**
 * Wire protocol spoken with the local Rust signaling relay
 * (`src-tauri/src/signaling.rs`) and, through it, with a connecting
 * LumaLink Streaming App client.
 *
 * Kept as a small hand-synced copy of
 * `src/services/streaming/signalingProtocol.ts` in the main LumaLink
 * repo (this is a separate npm project, so it can't `import` from
 * there directly without workspace tooling). If you change one, change
 * the other.
 */

export const SIGNALING_PORT = 58712;

export interface RemoteGameSummary {
  id: string;
  title: string;
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export type SignalingMessage =
  | { type: "auth-ok"; hostName: string }
  | { type: "auth-fail"; reason: string }
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice"; candidate: IceCandidateInit }
  | { type: "games"; games: RemoteGameSummary[] }
  | { type: "bye" }
  | { type: "peer-left" }
  /** Host-only: the relay tells the host a client just authenticated. */
  | { type: "client-connected" };

export function encodeSignalingMessage(message: SignalingMessage): string {
  return JSON.stringify(message);
}

export function decodeSignalingMessage(raw: string): SignalingMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.type === "string") {
      return parsed as SignalingMessage;
    }
    return null;
  } catch {
    return null;
  }
}
