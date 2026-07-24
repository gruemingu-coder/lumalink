/**
 * Wire protocol between the LumaLink streaming (client) app and the
 * LumaLink host app, relayed through the host's local WebSocket
 * signaling server (see `host-app/src-tauri/src/signaling.rs`).
 *
 * Design:
 *  - The host app runs a tiny WebSocket relay on the LAN
 *    (default port 58712, see `SIGNALING_PORT`).
 *  - The host's OWN webview connects to that relay as `role=host`
 *    (no PIN required — it's the local machine).
 *  - A remote client connects as `role=client&pin=XXXX`. The relay
 *    validates the PIN and, once accepted, pipes JSON text frames
 *    between the two sockets verbatim.
 *  - SDP/ICE negotiation happens over this relay. The CLIENT is
 *    always the WebRTC offerer; the HOST is always the answerer,
 *    because only the host can call `getDisplayMedia()`.
 *  - Once the RTCPeerConnection + RTCDataChannel are up, input
 *    events and stats no longer need the relay — they flow directly
 *    peer-to-peer over the data channel / media tracks.
 *
 * This file has no runtime dependencies so it can be shared verbatim
 * between the web/TS client and (conceptually) mirrored by the Rust
 * relay, which only needs to look at the top-level `type` field to
 * decide whether to intercept a message (auth) or relay it untouched.
 */

export const SIGNALING_PORT = 58712;

export interface IceCandidateInit {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface RemoteGameSummary {
  id: string;
  title: string;
}

/**
 * Sentinel `gameId` used for "일반 원격 데스크탑" sessions — stream
 * whatever is currently on screen instead of launching a specific
 * Steam game first.
 */
export const DESKTOP_MODE_GAME_ID = "desktop";

/**
 * Capture/encode preferences the client asks the host to apply for a
 * streaming session. The host treats these as best-effort hints (the
 * actual achieved FPS/bitrate is limited by the host's display,
 * GPU/encoder, and network conditions) — see `StreamSettings` in
 * `@/types/domain` for the client-side settings these are derived
 * from.
 */
export interface RemoteQualitySettings {
  resolution: "720p" | "1080p" | "1440p" | "4k";
  /** Target frame rate. UI allows up to 500; real hardware/network caps apply. */
  fps: number;
  bitrateMbps: number;
  codec: "h264" | "h265" | "av1";
  hostAudio: boolean;
  /** What the host should do when the session starts (client-side choice). */
  streamStartAction: "bigPicture" | "desktop" | "custom";
  /** Absolute path on the host, used when `streamStartAction === "custom"`. */
  customProgramPath?: string;
  /** Encoder trade-off: prioritize resolution/quality vs. frame rate/latency. */
  latencyMode: "quality" | "balanced" | "latency";
}

/** Sent by a client immediately after the WebSocket opens. */
export interface AuthMessage {
  type: "auth";
  pin: string;
  clientName: string;
}

/** Sent by the relay (or host) back to the client. */
export interface AuthOkMessage {
  type: "auth-ok";
  hostName: string;
  /** Host's LAN MAC address, if it could be determined — used for Wake-on-LAN. */
  macAddress?: string | null;
  /** TCP port for LumaLink native H.264 media (DXGI+NVENC). */
  mediaPort?: number;
  /** `nvenc` when NVIDIA encoder is available via ffmpeg, else software. */
  captureBackend?: "nvenc" | "software";
}

export interface AuthFailMessage {
  type: "auth-fail";
  reason: string;
}

/**
 * Client -> Host (via relay). Client is always the WebRTC offerer.
 * `gameId` tells the host what to launch before sharing starts
 * (a `steam-<appid>` id, or `DESKTOP_MODE_GAME_ID` / omitted for a
 * plain desktop-mirroring session). `quality` carries the capture
 * preferences described above.
 */
export interface OfferMessage {
  type: "offer";
  sdp: string;
  gameId?: string | null;
  quality?: RemoteQualitySettings;
}

/** Preferred native path: no WebRTC SDP — host starts DXGI+NVENC and replies with stream-ready. */
export interface StartStreamMessage {
  type: "start-stream";
  gameId?: string | null;
  quality?: RemoteQualitySettings;
}

export interface StreamReadyMessage {
  type: "stream-ready";
  mediaPort: number;
  captureBackend: "nvenc" | "software";
}

export interface InputMessage {
  type: "input";
  event: import("./StreamingEngine").InputForwardEvent;
}

/** Host -> Client (via relay). */
export interface AnswerMessage {
  type: "answer";
  sdp: string;
}

/** Either direction, forwarded verbatim by the relay. */
export interface IceMessage {
  type: "ice";
  candidate: IceCandidateInit;
}

/** Host -> Client, sent once right after `auth-ok`. */
export interface GamesMessage {
  type: "games";
  games: RemoteGameSummary[];
}

/** Either side announces a clean disconnect. */
export interface ByeMessage {
  type: "bye";
}

/** Relay -> both sides, when the other party's socket drops. */
export interface PeerLeftMessage {
  type: "peer-left";
}

export type SignalingMessage =
  | AuthMessage
  | AuthOkMessage
  | AuthFailMessage
  | OfferMessage
  | StartStreamMessage
  | StreamReadyMessage
  | InputMessage
  | AnswerMessage
  | IceMessage
  | GamesMessage
  | ByeMessage
  | PeerLeftMessage;

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

/** Messages exchanged directly over the RTCDataChannel (no relay). */
export type DataChannelMessage =
  | { kind: "input"; event: import("./StreamingEngine").InputForwardEvent }
  | { kind: "ping"; t: number }
  | { kind: "pong"; t: number };
