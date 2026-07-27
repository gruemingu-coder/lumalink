/**
 * Wire protocol between the LumaLink streaming (client) app and the
 * LumaLink host app, relayed through the host's local WebSocket
 * signaling server (see `host-app/src-tauri/src/signaling.rs`).
 *
 * Native path (preferred):
 *  - Client sends `start-stream` after `auth-ok`
 *  - Host starts DXGI+NVENC capture and replies `stream-ready`
 *  - Client opens UDP media port (default 58714, LLU2) via Tauri bridge
 *  - Input rides the signaling WebSocket as `input` messages
 *
 * Legacy WebRTC path (`offer`/`answer`/`ice`) remains for older clients.
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

export const DESKTOP_MODE_GAME_ID = "desktop";

export interface RemoteQualitySettings {
  resolution: "720p" | "1080p" | "1440p" | "4k";
  fps: number;
  bitrateMbps: number;
  codec: "h264" | "h265" | "av1";
  hostAudio: boolean;
  streamStartAction: "bigPicture" | "desktop" | "custom";
  customProgramPath?: string;
  latencyMode: "quality" | "balanced" | "latency";
}

export interface AuthMessage {
  type: "auth";
  pin: string;
  clientName: string;
}

export interface AuthOkMessage {
  type: "auth-ok";
  hostName: string;
  macAddress?: string | null;
  mediaPort?: number;
  captureBackend?: "nvenc" | "software";
  /** Short-lived UDP media credential (prefer over PIN on the wire). */
  mediaToken?: string | null;
  protocol?: string;
}

export interface AuthFailMessage {
  type: "auth-fail";
  reason: string;
}

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

export interface OfferMessage {
  type: "offer";
  sdp: string;
  gameId?: string | null;
  quality?: RemoteQualitySettings;
}

export interface AnswerMessage {
  type: "answer";
  sdp: string;
}

export interface IceMessage {
  type: "ice";
  candidate: IceCandidateInit;
}

export interface GamesMessage {
  type: "games";
  games: RemoteGameSummary[];
}

export interface ByeMessage {
  type: "bye";
}

export interface PeerLeftMessage {
  type: "peer-left";
}

export type SignalingMessage =
  | AuthMessage
  | AuthOkMessage
  | AuthFailMessage
  | StartStreamMessage
  | StreamReadyMessage
  | InputMessage
  | OfferMessage
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

export type DataChannelMessage =
  | { kind: "input"; event: import("./StreamingEngine").InputForwardEvent }
  | { kind: "ping"; t: number }
  | { kind: "pong"; t: number };
