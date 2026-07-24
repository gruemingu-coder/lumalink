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

export const DESKTOP_MODE_GAME_ID = "desktop";

export interface RemoteGameSummary {
  id: string;
  title: string;
}

export interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

/** Kept in sync with `RemoteQualitySettings` in the main repo's signalingProtocol.ts. */
export interface RemoteQualitySettings {
  resolution: "720p" | "1080p" | "1440p" | "4k";
  fps: number;
  bitrateMbps: number;
  codec: "h264" | "h265" | "av1";
  hostAudio: boolean;
  launchBigPicture: boolean;
  latencyMode: "quality" | "balanced" | "latency";
}

/**
 * On the relay <-> HOST leg only, every message carries `clientId` so
 * the host's webview (which now juggles one `RTCPeerConnection` per
 * connected client — see `App.tsx`) knows which session a message
 * belongs to, and which session an outgoing message should be routed
 * back to. The relay <-> CLIENT leg never sees this field; the shared
 * (root-repo) `signalingProtocol.ts` used by real clients is
 * unchanged, since clients only ever have exactly one session (with
 * the host) and don't need to disambiguate.
 */
export type SignalingMessage =
  | { type: "auth-ok"; hostName: string; macAddress?: string | null }
  | { type: "auth-fail"; reason: string }
  | { type: "offer"; sdp: string; gameId?: string | null; quality?: RemoteQualitySettings; clientId?: string }
  | { type: "answer"; sdp: string; clientId?: string }
  | { type: "ice"; candidate: IceCandidateInit; clientId?: string }
  | { type: "games"; games: RemoteGameSummary[]; clientId?: string }
  | { type: "bye"; clientId?: string }
  | { type: "peer-left"; clientId?: string }
  /** Host-only: the relay tells the host a new client just authenticated. */
  | { type: "client-connected"; clientId?: string };

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
