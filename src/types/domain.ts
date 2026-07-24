/**
 * Core domain types for LumaLink.
 *
 * These types intentionally describe *capabilities* (pairing, devices,
 * games, streaming sessions) rather than any particular transport.
 * The streaming-related types are shaped so a future WebRTC-backed
 * implementation of `StreamingEngine` can be dropped in without any
 * UI or state-management changes. See `src/services/streaming`.
 */

export type DeviceStatus = "online" | "sleeping" | "offline";

export type DevicePlatform = "windows" | "macos" | "linux";

export interface HostSpecs {
  gpu: string;
  cpu: string;
  ramGb: number;
}

/** A host PC that has been (or can be) paired with LumaLink. */
export interface PcDevice {
  id: string;
  name: string;
  platform: DevicePlatform;
  /**
   * LAN address. For the built-in demo devices this is cosmetic only.
   * For real devices (`isReal: true`) this is the actual IPv4 address
   * of a machine running the LumaLink Host App, used to open a
   * WebSocket connection to its signaling relay.
   */
  address: string;
  status: DeviceStatus;
  specs: HostSpecs;
  pairedAt: string | null;
  lastSeenAt: string;
  /**
   * True when this device was paired against a real LumaLink Host App
   * over the LAN (as opposed to the seeded/discovered demo devices).
   * Drives `createStreamingEngine()`'s choice between the mock engine
   * and the real WebRTC engine.
   */
  isReal?: boolean;
  /** Host App signaling relay port. Defaults to `SIGNALING_PORT`. */
  signalPort?: number;
  /**
   * PIN last used to authenticate with this host's signaling relay.
   * Reused for reconnects; if the host regenerates its PIN, the next
   * connection attempt will fail auth and the UI should prompt the
   * user to re-pair.
   */
  pairingPin?: string;
}

/** A device discovered on the network but not yet paired. */
export interface DiscoveredDevice {
  id: string;
  name: string;
  platform: DevicePlatform;
  address: string;
}

export type GameGenre =
  | "action"
  | "adventure"
  | "rpg"
  | "strategy"
  | "sports"
  | "indie"
  | "racing";

export interface Game {
  id: string;
  title: string;
  genre: GameGenre[];
  /** Tailwind gradient classes used to render an artwork-free cover. */
  coverGradient: string;
  installedOnDeviceId: string;
  lastPlayedAt: string | null;
  playtimeHours: number;
  sizeGb: number;
}

export type StreamResolution = "720p" | "1080p" | "1440p" | "4k";
export type StreamFps = 30 | 60 | 90 | 120;
export type StreamCodec = "h264" | "h265" | "av1";

export interface StreamSettings {
  resolution: StreamResolution;
  fps: StreamFps;
  bitrateMbps: number;
  codec: StreamCodec;
  hardwareDecode: boolean;
  hostAudio: boolean;
  vsync: boolean;
}

export type StreamSessionStatus =
  | "idle"
  | "negotiating"
  | "connecting"
  | "streaming"
  | "reconnecting"
  | "ended"
  | "error";

export interface StreamStats {
  fps: number;
  latencyMs: number;
  bitrateMbps: number;
  packetLossPct: number;
  resolution: StreamResolution;
  decoder: "hardware" | "software";
}

/** Connection details for a real (non-mock) LumaLink Host App. */
export interface RealHostConnectInfo {
  address: string;
  signalPort: number;
  pairingPin: string;
  clientName: string;
}

export interface StreamConnectConfig {
  deviceId: string;
  gameId: string;
  settings: StreamSettings;
  /** Present only when connecting to a real Host App over the LAN. */
  realHost?: RealHostConnectInfo;
}

export const DEFAULT_STREAM_SETTINGS: StreamSettings = {
  resolution: "1080p",
  fps: 60,
  bitrateMbps: 25,
  codec: "h265",
  hardwareDecode: true,
  hostAudio: true,
  vsync: false,
};
