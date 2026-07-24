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
}

export interface AuthFailMessage {
  type: "auth-fail";
  reason: string;
}

/** Client -> Host (via relay). Client is always the WebRTC offerer. */
export interface OfferMessage {
  type: "offer";
  sdp: string;
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
