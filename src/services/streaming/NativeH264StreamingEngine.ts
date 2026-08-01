/**
 * LumaLink native H.264 streaming client.
 *
 * Host: DXGI → ffmpeg h264_nvenc/libx264 → UDP :58714 (LLU2)
 * Client: Tauri UDP bridge → WebCodecs VideoDecoder → canvas → <video>
 *
 * Independent of Sunshine/Moonlight protocols.
 */
import type {
  RealHostConnectInfo,
  StreamConnectConfig,
  StreamSessionStatus,
  StreamSettings,
  StreamStats,
} from "@/types/domain";
import type { InputForwardEvent, StreamingEngine, Unsubscribe } from "./StreamingEngine";
import {
  decodeSignalingMessage,
  encodeSignalingMessage,
  type RemoteGameSummary,
  type RemoteQualitySettings,
} from "./signalingProtocol";

const AUTH_TIMEOUT_MS = 8000;
const DEFAULT_MEDIA_PORT = 58714;

export class NativeH264StreamingEngine implements StreamingEngine {
  private ws: WebSocket | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasStream: MediaStream | null = null;
  private decoder: VideoDecoder | null = null;
  private unlistenFrame: (() => void) | null = null;
  private unlistenAudio: (() => void) | null = null;

  private settings: StreamSettings | null = null;
  private gameId: string | null = null;
  private realHost: RealHostConnectInfo | null = null;
  private mediaPort = DEFAULT_MEDIA_PORT;
  private mediaToken: string | null = null;
  private captureBackend: "nvenc" | "software" = "software";
  private unlistenStats: (() => void) | null = null;
  private lastRttMs = 0;
  private lastLossPct = 0;

  private status: StreamSessionStatus = "idle";
  private statusListeners = new Set<(status: StreamSessionStatus) => void>();
  private statsListeners = new Set<(stats: StreamStats) => void>();
  private gamesListeners = new Set<(games: RemoteGameSummary[]) => void>();

  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private framesDecoded = 0;
  private bytesReceived = 0;
  private lastFramesDecoded = 0;
  private lastBytesReceived = 0;
  private lastStatsAt = 0;
  private configured = false;

  private audioDecoder: AudioDecoder | null = null;
  private audioConfigured = false;
  private audioCtx: AudioContext | null = null;
  private audioTimeCursor = 0;

  async connect(config: StreamConnectConfig): Promise<void> {
    const realHost = config.realHost;
    if (!realHost) {
      throw new Error("NativeH264StreamingEngine requires config.realHost.");
    }
    if (typeof VideoDecoder === "undefined") {
      throw new Error(
        "이 기기는 WebCodecs VideoDecoder를 지원하지 않습니다. Android는 System WebView를 최신으로 올리고, iOS는 16.4 이상이 필요합니다.",
      );
    }

    this.settings = config.settings;
    this.gameId = config.gameId;
    this.realHost = realHost;
    this.setStatus("negotiating");

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
          `ws://${realHost.address}:${realHost.signalPort}/signal?role=client`
        );
      } catch {
        settleReject(new Error("호스트 주소가 올바르지 않습니다."));
        return;
      }
      this.ws = ws;

      const failTimer = window.setTimeout(() => {
        settleReject(
          new Error(
            "호스트 응답이 없습니다. 호스트 앱이 실행 중이고 같은 네트워크에 있는지 확인해주세요."
          )
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
            if (typeof msg.mediaPort === "number") {
              this.mediaPort = msg.mediaPort;
            }
            if (typeof msg.mediaToken === "string" && msg.mediaToken) {
              this.mediaToken = msg.mediaToken;
            }
            if (msg.captureBackend === "nvenc" || msg.captureBackend === "software") {
              this.captureBackend = msg.captureBackend;
            }
            settleResolve();
            this.setStatus("connecting");
            this.sendStartStream();
            break;
          case "stream-ready":
            this.mediaPort = msg.mediaPort;
            this.captureBackend = msg.captureBackend;
            void this.connectMediaUdp();
            break;
          case "games":
            this.gamesListeners.forEach((cb) => cb(msg.games));
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

  private sendStartStream() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      encodeSignalingMessage({
        type: "start-stream",
        gameId: this.gameId,
        quality: this.buildQualitySettings(),
      })
    );
  }

  private async connectMediaUdp() {
    if (!this.realHost) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");

      this.ensureDecoder();
      this.unlistenFrame?.();
      this.unlistenAudio?.();
      this.unlistenStats?.();
      // Prefer base64 (stable IPC); number[] still accepted for older builds.
      this.unlistenFrame = await listen<number[] | string>("lumalink-media-frame", (event) => {
        this.onAnnexBFrame(event.payload);
      });
      this.unlistenAudio = await listen<number[]>("lumalink-media-audio", (event) => {
        this.onAdtsAudio(event.payload);
      });
      this.unlistenStats = await listen<{
        rttMs?: number;
        packetLossPct?: number;
      }>("lumalink-media-stats", (event) => {
        if (typeof event.payload.rttMs === "number") this.lastRttMs = event.payload.rttMs;
        if (typeof event.payload.packetLossPct === "number") {
          this.lastLossPct = event.payload.packetLossPct;
        }
      });

      await invoke("media_connect", {
        host: this.realHost.address,
        port: this.mediaPort,
        pin: this.realHost.pairingPin,
        mediaToken: this.mediaToken,
      });

      this.setStatus("streaming");
      this.startStatsLoop();
    } catch (err) {
      console.error(err);
      this.setStatus("error");
    }
  }

  private ensureDecoder() {
    if (this.decoder && this.decoder.state !== "closed") return;

    this.decoder = new VideoDecoder({
      output: (frame) => {
        this.framesDecoded += 1;
        this.drawFrame(frame);
        frame.close();
      },
      error: (err) => {
        console.error("VideoDecoder error", err);
        this.configured = false;
        this.decoder = null;
      },
    });
    this.configured = false;
  }

  private onAnnexBFrame(payload: number[] | string) {
    const bytes = typeof payload === "string" ? base64ToBytes(payload) : Uint8Array.from(payload);
    this.bytesReceived += bytes.byteLength;

    const isKey = looksLikeKeyFrame(bytes);
    this.ensureDecoder();
    if (!this.decoder) return;

    if (!this.configured) {
      if (!isKey) return;
      try {
        // Annex-B with in-band SPS/PPS (ffmpeg dump_extra on keyframes).
        this.decoder.configure({
          codec: "avc1.42E01E",
          optimizeForLatency: true,
          hardwareAcceleration: "prefer-hardware",
        });
        this.configured = true;
      } catch (err) {
        console.error("VideoDecoder configure failed", err);
        try {
          this.decoder.configure({
            codec: "avc1.640028",
            optimizeForLatency: true,
          });
          this.configured = true;
        } catch (err2) {
          console.error("VideoDecoder configure fallback failed", err2);
          return;
        }
      }
    }

    try {
      // Drop if decoder is backed up (common with high FPS).
      if (this.decoder.decodeQueueSize > 10) {
        if (!isKey) return;
      }
      this.decoder.decode(
        new EncodedVideoChunk({
          type: isKey ? "key" : "delta",
          timestamp: performance.now() * 1000,
          data: bytes,
        })
      );
    } catch (err) {
      console.error("decode failed", err);
      this.configured = false;
      try {
        this.decoder?.close();
      } catch {
        // ignore
      }
      this.decoder = null;
    }
  }

  private onAdtsAudio(payload: number[]) {
    if (this.settings && !this.settings.hostAudio) return;
    if (typeof AudioDecoder === "undefined") return;

    const adts = Uint8Array.from(payload);
    this.bytesReceived += adts.byteLength;
    // WebCodecs expects raw AAC access units — strip ADTS header (7 or 9 bytes).
    const headerLen = adts.length >= 2 && (adts[1] & 0x01) === 0 ? 9 : 7;
    if (adts.length <= headerLen) return;
    const bytes = adts.subarray(headerLen);

    this.ensureAudioDecoder();
    if (!this.audioDecoder || !this.audioConfigured) return;

    try {
      this.audioDecoder.decode(
        new EncodedAudioChunk({
          type: "key",
          timestamp: performance.now() * 1000,
          data: bytes,
        })
      );
    } catch (err) {
      console.error("audio decode failed", err);
      this.audioConfigured = false;
      try {
        this.audioDecoder?.close();
      } catch {
        // ignore
      }
      this.audioDecoder = null;
    }
  }

  private ensureAudioDecoder() {
    if (this.audioDecoder && this.audioDecoder.state !== "closed") return;
    if (typeof AudioDecoder === "undefined") return;

    this.audioDecoder = new AudioDecoder({
      output: (data) => {
        this.playAudioData(data);
        data.close();
      },
      error: (err) => {
        console.error("AudioDecoder error", err);
        this.audioConfigured = false;
        this.audioDecoder = null;
      },
    });
    try {
      this.audioDecoder.configure({
        codec: "mp4a.40.2",
        sampleRate: 48000,
        numberOfChannels: 2,
      });
      this.audioConfigured = true;
      void this.audioCtx?.resume();
    } catch (err) {
      console.error("AudioDecoder configure failed", err);
      this.audioDecoder = null;
      this.audioConfigured = false;
    }
  }

  private playAudioData(data: AudioData) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext({ sampleRate: data.sampleRate });
        this.audioTimeCursor = this.audioCtx.currentTime;
      }
      const frames = data.numberOfFrames;
      const channels = data.numberOfChannels;
      const buffer = this.audioCtx.createBuffer(channels, frames, data.sampleRate);
      for (let ch = 0; ch < channels; ch++) {
        const plane = new Float32Array(frames);
        data.copyTo(plane, { planeIndex: ch, format: "f32-planar" });
        buffer.copyToChannel(plane, ch);
      }
      const src = this.audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.audioCtx.destination);
      const startAt = Math.max(this.audioCtx.currentTime + 0.02, this.audioTimeCursor);
      src.start(startAt);
      this.audioTimeCursor = startAt + buffer.duration;
    } catch (err) {
      console.error("audio play failed", err);
    }
  }

  private drawFrame(frame: VideoFrame) {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.canvas.setAttribute("aria-hidden", "true");
    }
    if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
      this.canvas.width = frame.displayWidth || frame.codedWidth;
      this.canvas.height = frame.displayHeight || frame.codedHeight;
    }
    this.ensureCanvasMounted();
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(frame, 0, 0);
    // Keep <video> path working where captureStream is reliable.
    if (this.canvasStream) {
      const track = this.canvasStream.getVideoTracks()[0] as
        | (MediaStreamTrack & { requestFrame?: () => void })
        | undefined;
      track?.requestFrame?.();
    }
  }

  /** Prefer painting a real canvas in the player (WebView2-safe). */
  private ensureCanvasMounted() {
    if (!this.canvas || !this.videoEl) return;
    const parent = this.videoEl.parentElement;
    if (!parent) return;
    if (!this.canvas.isConnected) {
      this.canvas.className = this.videoEl.className;
      this.canvas.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;";
      parent.style.position = parent.style.position || "relative";
      parent.insertBefore(this.canvas, this.videoEl);
      this.videoEl.style.opacity = "0";
      this.videoEl.style.pointerEvents = "none";
    }
    // Also feed <video> for APIs that expect a MediaStream.
    if (!this.canvasStream) {
      this.canvasStream = this.canvas.captureStream(60);
      this.videoEl.srcObject = this.canvasStream;
      this.videoEl.muted = true;
      void this.videoEl.play().catch(() => undefined);
    }
  }

  private bindCanvasToVideo() {
    this.ensureCanvasMounted();
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
    this.unlistenFrame?.();
    this.unlistenFrame = null;
    this.unlistenAudio?.();
    this.unlistenAudio = null;
    this.unlistenStats?.();
    this.unlistenStats = null;
    this.mediaToken = null;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("media_disconnect");
    } catch {
      // best-effort
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(encodeSignalingMessage({ type: "bye" }));
      } catch {
        // ignore
      }
    }
    this.ws?.close();
    this.ws = null;

    try {
      this.decoder?.close();
    } catch {
      // ignore
    }
    this.decoder = null;
    this.configured = false;

    try {
      this.audioDecoder?.close();
    } catch {
      // ignore
    }
    this.audioDecoder = null;
    this.audioConfigured = false;
    void this.audioCtx?.close();
    this.audioCtx = null;
    this.audioTimeCursor = 0;

    this.canvasStream?.getTracks().forEach((t) => t.stop());
    this.canvasStream = null;
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
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeSignalingMessage({ type: "input", event }));
    }
  }

  attachRenderTarget(target: HTMLVideoElement): void {
    this.videoEl = target;
    this.ensureCanvasMounted();
  }

  private setStatus(status: StreamSessionStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  private startStatsLoop() {
    this.lastFramesDecoded = this.framesDecoded;
    this.lastBytesReceived = this.bytesReceived;
    this.lastStatsAt = performance.now();
    this.statsTimer = setInterval(() => this.pollStats(), 1000);
  }

  private stopStatsLoop() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private pollStats() {
    const now = performance.now();
    const dt = Math.max((now - this.lastStatsAt) / 1000, 0.001);
    const fps = (this.framesDecoded - this.lastFramesDecoded) / dt;
    const bitrateMbps =
      ((this.bytesReceived - this.lastBytesReceived) * 8) / dt / 1_000_000;

    this.lastFramesDecoded = this.framesDecoded;
    this.lastBytesReceived = this.bytesReceived;
    this.lastStatsAt = now;

    const stats: StreamStats = {
      fps: Math.round(fps),
      latencyMs: this.lastRttMs,
      bitrateMbps: Math.round(bitrateMbps * 10) / 10,
      packetLossPct: this.lastLossPct,
      resolution: this.settings?.resolution ?? "1080p",
      decoder: this.captureBackend === "nvenc" ? "hardware" : "software",
    };
    this.statsListeners.forEach((cb) => cb(stats));
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** True if the Annex-B buffer contains an IDR / SPS (key-ish) NAL. */
function looksLikeKeyFrame(data: Uint8Array): boolean {
  let i = 0;
  while (i + 4 < data.length) {
    let start = -1;
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      start = i + 4;
    } else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      start = i + 3;
    }
    if (start >= 0 && start < data.length) {
      const nalType = data[start] & 0x1f;
      if (nalType === 5 || nalType === 7) return true;
      i = start;
      continue;
    }
    i += 1;
  }
  return false;
}
