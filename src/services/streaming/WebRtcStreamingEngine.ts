import type {
  RealHostConnectInfo,
  StreamConnectConfig,
  StreamResolution,
  StreamSessionStatus,
  StreamSettings,
  StreamStats,
} from "@/types/domain";
import type { InputForwardEvent, StreamingEngine, Unsubscribe } from "./StreamingEngine";
import {
  decodeSignalingMessage,
  encodeSignalingMessage,
  type IceCandidateInit,
  type RemoteGameSummary,
  type RemoteQualitySettings,
} from "./signalingProtocol";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const AUTH_TIMEOUT_MS = 8000;

/**
 * Real streaming transport: connects to a LumaLink Host App over the
 * LAN via its WebSocket signaling relay, negotiates a WebRTC
 * connection (client is always the offerer, host is always the
 * answerer because only the host can call `getDisplayMedia()`), and
 * renders the incoming video track into an attached <video> element.
 *
 * This class implements the `StreamingEngine` contract used by
 * `useStreamingSession`/`PlayerPage` — see `createStreamingEngine.ts`.
 */
export class WebRtcStreamingEngine implements StreamingEngine {
  private ws: WebSocket | null = null;

  private pc: RTCPeerConnection | null = null;

  private dataChannel: RTCDataChannel | null = null;

  private videoEl: HTMLVideoElement | null = null;

  private settings: StreamSettings | null = null;

  private gameId: string | null = null;

  private status: StreamSessionStatus = "idle";

  private statusListeners = new Set<(status: StreamSessionStatus) => void>();

  private statsListeners = new Set<(stats: StreamStats) => void>();

  private gamesListeners = new Set<(games: RemoteGameSummary[]) => void>();

  private statsTimer: ReturnType<typeof setInterval> | null = null;

  private lastInboundBytes = 0;

  private lastStatsAt = 0;

  async connect(config: StreamConnectConfig): Promise<void> {
    const realHost = config.realHost;
    if (!realHost) {
      throw new Error(
        "WebRtcStreamingEngine requires config.realHost — this device isn't a real paired host."
      );
    }

    this.settings = config.settings;
    this.gameId = config.gameId;
    this.setStatus("negotiating");

    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.wirePeerConnection(this.pc);

    this.dataChannel = this.pc.createDataChannel("lumalink-input", { ordered: true });
    this.wireDataChannel(this.dataChannel);

    // Client is receive-only for media; input travels over the data channel.
    const videoTransceiver = this.pc.addTransceiver("video", { direction: "recvonly" });
    this.pc.addTransceiver("audio", { direction: "recvonly" });
    preferH264(videoTransceiver);

    await this.openSignaling(realHost);
  }

  private openSignaling(realHost: RealHostConnectInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(failTimer);
          resolve();
        }
      };
      const settleReject = (err: Error) => {
        if (!settled) {
          settled = true;
          window.clearTimeout(failTimer);
          reject(err);
        }
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(
          `ws://${realHost.address}:${realHost.signalPort}/signal?role=client&pin=${encodeURIComponent(
            realHost.pairingPin
          )}`
        );
      } catch {
        settleReject(new Error("호스트 주소가 올바르지 않습니다."));
        return;
      }
      this.ws = ws;

      const failTimer = window.setTimeout(() => {
        settleReject(
          new Error("호스트 응답이 없습니다. 호스트 앱이 실행 중이고 같은 네트워크에 있는지 확인해주세요.")
        );
        ws.close();
      }, AUTH_TIMEOUT_MS);

      ws.onopen = () => {
        ws.send(
          encodeSignalingMessage({
            type: "auth",
            pin: realHost.pairingPin,
            clientName: realHost.clientName,
          })
        );
      };

      ws.onerror = () => {
        settleReject(new Error("호스트에 연결할 수 없습니다. 네트워크를 확인해주세요."));
      };

      ws.onclose = () => {
        settleReject(new Error("연결이 예기치 않게 종료되었습니다."));
        if (this.status !== "ended") {
          this.setStatus("error");
        }
      };

      ws.onmessage = (event) => {
        const msg = decodeSignalingMessage(String(event.data));
        if (!msg) return;

        switch (msg.type) {
          case "auth-fail":
            settleReject(new Error(msg.reason || "PIN 인증에 실패했습니다."));
            ws.close();
            break;
          case "auth-ok":
            settleResolve();
            this.setStatus("connecting");
            void this.sendOffer();
            break;
          case "games":
            this.gamesListeners.forEach((cb) => cb(msg.games));
            break;
          case "answer":
            this.pc
              ?.setRemoteDescription({ type: "answer", sdp: msg.sdp })
              .catch(() => this.setStatus("error"));
            break;
          case "ice":
            this.pc
              ?.addIceCandidate(toRtcIceCandidate(msg.candidate))
              .catch(() => undefined);
            break;
          case "peer-left":
            this.setStatus("error");
            break;
          default:
            break;
        }
      };
    });
  }

  private wirePeerConnection(pc: RTCPeerConnection) {
    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(
          encodeSignalingMessage({
            type: "ice",
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
          })
        );
      }
    };

    pc.ontrack = (event) => {
      if (this.videoEl) {
        this.videoEl.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void this.videoEl.play().catch(() => undefined);
      }
      // Ask the jitter buffer to hold as little as possible — trades a
      // bit of resilience to network jitter for lower glass-to-glass
      // latency, which matters much more for interactive input.
      const receiverWithHint = event.receiver as RTCRtpReceiver & { playoutDelayHint?: number };
      if ("playoutDelayHint" in event.receiver) {
        receiverWithHint.playoutDelayHint = this.settings?.latencyMode === "quality" ? 0.1 : 0;
      }
      this.setStatus("streaming");
      this.startStatsLoop();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.setStatus("error");
      } else if (pc.connectionState === "disconnected") {
        this.setStatus("reconnecting");
      }
    };
  }

  private wireDataChannel(channel: RTCDataChannel) {
    channel.onmessage = () => {
      // Reserved for future host -> client control/telemetry messages.
    };
  }

  private async sendOffer() {
    if (!this.pc || !this.ws) return;
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      if (this.ws.readyState === WebSocket.OPEN && offer.sdp) {
        this.ws.send(
          encodeSignalingMessage({
            type: "offer",
            sdp: offer.sdp,
            gameId: this.gameId,
            quality: this.buildQualitySettings(),
          })
        );
      }
    } catch {
      this.setStatus("error");
    }
  }

  private buildQualitySettings(): RemoteQualitySettings | undefined {
    if (!this.settings) return undefined;
    return {
      resolution: this.settings.resolution,
      fps: this.settings.fps,
      bitrateMbps: this.settings.bitrateMbps,
      codec: this.settings.codec,
      hostAudio: this.settings.hostAudio,
      streamStartAction: this.settings.streamStartAction,
      customProgramPath: this.settings.customProgramPath || undefined,
      latencyMode: this.settings.latencyMode,
    };
  }

  async disconnect(): Promise<void> {
    this.stopStatsLoop();
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(encodeSignalingMessage({ type: "bye" }));
      } catch {
        // best-effort only
      }
    }
    this.ws?.close();
    this.ws = null;

    this.dataChannel?.close();
    this.dataChannel = null;

    this.pc?.getSenders().forEach((sender) => sender.track?.stop());
    this.pc?.close();
    this.pc = null;

    if (this.videoEl) this.videoEl.srcObject = null;
    this.setStatus("ended");
  }

  onStats(callback: (stats: StreamStats) => void): Unsubscribe {
    this.statsListeners.add(callback);
    return () => this.statsListeners.delete(callback);
  }

  onStatusChange(callback: (status: StreamSessionStatus) => void): Unsubscribe {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  onRemoteGames(callback: (games: RemoteGameSummary[]) => void): Unsubscribe {
    this.gamesListeners.add(callback);
    return () => this.gamesListeners.delete(callback);
  }

  sendInput(event: InputForwardEvent): void {
    if (this.dataChannel?.readyState === "open") {
      this.dataChannel.send(JSON.stringify({ kind: "input", event }));
    }
  }

  attachRenderTarget(target: HTMLVideoElement): void {
    this.videoEl = target;

    const videoTrack = this.pc?.getReceivers().find((r) => r.track?.kind === "video")?.track;
    if (videoTrack && !target.srcObject) {
      target.srcObject = new MediaStream([videoTrack]);
      void target.play().catch(() => undefined);
    }
  }

  private setStatus(status: StreamSessionStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  private startStatsLoop() {
    this.lastInboundBytes = 0;
    this.lastStatsAt = performance.now();

    this.statsTimer = setInterval(() => {
      void this.pollStats();
    }, 1000);
  }

  private async pollStats() {
    if (!this.pc) return;
    const report = await this.pc.getStats();

    let fps = 0;
    let bytesReceived = 0;
    let packetsLost = 0;
    let packetsReceived = 0;
    let rttMs = 20;
    let resolution: StreamResolution = this.settings?.resolution ?? "1080p";

    report.forEach((stat: RTCStatsReportEntry) => {
      if (stat.type === "inbound-rtp" && stat.kind === "video") {
        fps = typeof stat.framesPerSecond === "number" ? stat.framesPerSecond : fps;
        bytesReceived = typeof stat.bytesReceived === "number" ? stat.bytesReceived : bytesReceived;
        packetsLost = typeof stat.packetsLost === "number" ? stat.packetsLost : packetsLost;
        packetsReceived =
          typeof stat.packetsReceived === "number" ? stat.packetsReceived : packetsReceived;
        if (stat.frameWidth && stat.frameHeight) {
          resolution = inferResolutionLabel(stat.frameWidth, stat.frameHeight);
        }
      }
      if (
        stat.type === "candidate-pair" &&
        stat.state === "succeeded" &&
        typeof stat.currentRoundTripTime === "number"
      ) {
        rttMs = Math.round(stat.currentRoundTripTime * 1000);
      }
    });

    const now = performance.now();
    const elapsedSec = Math.max(0.5, (now - this.lastStatsAt) / 1000);
    const bitrateMbps =
      Math.max(0, Math.round((((bytesReceived - this.lastInboundBytes) * 8) / elapsedSec / 1_000_000) * 10)) /
      10;
    this.lastInboundBytes = bytesReceived;
    this.lastStatsAt = now;

    const totalPackets = packetsReceived + packetsLost;
    const packetLossPct = totalPackets > 0 ? Math.round((packetsLost / totalPackets) * 1000) / 10 : 0;

    const stats: StreamStats = {
      fps: Math.round(fps),
      latencyMs: rttMs,
      bitrateMbps,
      packetLossPct,
      resolution,
      decoder: this.settings?.hardwareDecode ? "hardware" : "software",
    };
    this.statsListeners.forEach((cb) => cb(stats));
  }

  private stopStatsLoop() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }
}

/** Loosely-typed shape of the entries yielded by `RTCStatsReport.forEach`. */
interface RTCStatsReportEntry {
  type: string;
  kind?: string;
  state?: string;
  framesPerSecond?: number;
  bytesReceived?: number;
  packetsLost?: number;
  packetsReceived?: number;
  frameWidth?: number;
  frameHeight?: number;
  currentRoundTripTime?: number;
}

function inferResolutionLabel(width: number, height: number): StreamResolution {
  const pixels = width * height;
  if (pixels >= 3840 * 2160 * 0.8) return "4k";
  if (pixels >= 2560 * 1440 * 0.8) return "1440p";
  if (pixels >= 1920 * 1080 * 0.8) return "1080p";
  return "720p";
}

/**
 * Sorts H.264 first in the transceiver's codec negotiation order.
 * Chromium (and therefore WebView2, which the desktop apps embed) can
 * use GPU hardware acceleration for H.264 encode/decode on most
 * systems, whereas VP8/VP9 are software-only — preferring H.264 gives
 * the best shot at low-latency, high-framerate hardware encoding
 * without hand-rolling a native capture/encode pipeline.
 */
function preferH264(transceiver: RTCRtpTransceiver): void {
  const RTCRtpReceiverCtor = window.RTCRtpReceiver as
    | (typeof RTCRtpReceiver & { getCapabilities?: (kind: string) => RTCRtpCapabilities | null })
    | undefined;
  const capabilities = RTCRtpReceiverCtor?.getCapabilities?.("video");
  if (!capabilities || typeof transceiver.setCodecPreferences !== "function") return;

  const h264 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264");
  const rest = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== "video/h264");
  if (h264.length === 0) return;

  try {
    transceiver.setCodecPreferences([...h264, ...rest]);
  } catch {
    // Some browsers reject this before the transceiver is fully set up
    // in certain states — non-fatal, negotiation just falls back to
    // the default codec order.
  }
}

function toRtcIceCandidate(candidate: IceCandidateInit): RTCIceCandidateInit {
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid ?? undefined,
    sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
  };
}
