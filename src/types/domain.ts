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
   * The actual IPv4 address of a machine running the LumaLink Host App,
   * used to open a WebSocket connection to its signaling relay.
   */
  address: string;
  status: DeviceStatus;
  specs: HostSpecs;
  pairedAt: string | null;
  lastSeenAt: string;
  /**
   * Always true for devices added through this app today — kept as an
   * explicit flag (rather than assumed) since it's threaded through the
   * streaming/session types below.
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
  /**
   * LAN MAC address reported by the Host App during pairing, if it
   * could be determined. Used to send a Wake-on-LAN magic packet from
   * the LumaLink Streaming desktop app when this device is asleep.
   * Browsers can't send raw UDP, so WOL only works from the Tauri app.
   */
  macAddress?: string | null;
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
  /**
   * Synthetic "그냥 원격 데스크탑" entry for real devices — selecting it
   * starts a session that mirrors whatever's currently on screen
   * instead of launching a specific Steam game first.
   */
  isDesktopMode?: boolean;
}

export type StreamResolution = "720p" | "1080p" | "1440p" | "4k";
/**
 * Target frame rate in FPS. Free-form up to 500 to match the highest
 * refresh-rate displays/benchmarks, like Moonlight/Sunshine expose —
 * the actually achieved rate is still capped by the host's monitor
 * refresh rate, GPU/encoder, and network conditions.
 */
export type StreamFps = number;
export type StreamCodec = "h264" | "h265" | "av1";
/** Encoder trade-off: prioritize picture quality vs. frame rate/latency when bandwidth is tight. */
export type StreamLatencyMode = "quality" | "balanced" | "latency";

/**
 * What the host should do the moment a streaming session starts —
 * chosen on the *client* side (this setting) and sent to the host with
 * the connection offer; the host's own manual "Steam 빅픽처 모드 실행"
 * button still works independently of this.
 */
export type StreamStartAction = "bigPicture" | "desktop" | "custom";

export interface StreamSettings {
  resolution: StreamResolution;
  fps: StreamFps;
  bitrateMbps: number;
  codec: StreamCodec;
  hardwareDecode: boolean;
  hostAudio: boolean;
  vsync: boolean;
  /** Encoder degradation preference: keep resolution vs. keep frame rate. */
  latencyMode: StreamLatencyMode;
  /** What to do on the host when a session starts. */
  streamStartAction: StreamStartAction;
  /** Absolute path on the *host* machine, used when `streamStartAction === "custom"`. */
  customProgramPath: string;
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

/** Connection details for a LumaLink Host App reachable over the LAN. */
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
  latencyMode: "balanced",
  streamStartAction: "desktop",
  customProgramPath: "",
};
