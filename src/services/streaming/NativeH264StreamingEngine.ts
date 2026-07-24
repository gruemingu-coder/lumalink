/**
 * LumaLink native H.264 streaming client.
 *
 * Receives Annex-B H.264 from the Host's DXGI+NVENC (or software)
 * media TCP port and decodes with WebCodecs — independent of
 * Sunshine/Moonlight protocols.
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

export class NativeH264StreamingEngine implements StreamingEngine {
  private ws: WebSocket | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private decoder: VideoDecoder | null = null;
  private settings: StreamSettings | null = null;
  private gameId: string | null = null;
  private status: StreamSessionStatus = "idle";
  private statusListeners = new Set<(status: StreamSessionStatus) => void>();
  private statsListeners = new Set<(stats: StreamStats) => void>();
  private gamesListeners = new Set<(games: RemoteGameSummary[]) => void>();
  private realHost: RealHostConnectInfo | null = null;
  private mediaPort = 58714;
  private captureBackend: "nvenc" | "software" = "software";
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private framesDecoded = 0;
  private bytesReceived = 0;
  private lastStatsAt = 0;
  private lastBytes = 0;
  private abort = false;
  private mediaReader: AbortController | null = null;

  async connect(config: StreamConnectConfig): Promise<void> {
    const realHost = config.realHost;
    if (!realHost) {
      throw new Error("NativeH264StreamingEngine requires config.realHost");
    }
    this.realHost = realHost;
    this.settings = config.settings;
    this.gameId = config.gameId;
    this.abort = false;
    this.setStatus("negotiating");

    await this.openSignaling(realHost);
    this.setStatus("connecting");
    await this.openMediaTcp(realHost);
    this.setStatus("streaming");
    this.startStats();
  }

  private openSignaling(realHost: RealHostConnectInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(failTimer);
        if (err) reject(err);
        else resolve();
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(
          `ws://${realHost.address}:${realHost.signalPort}/signal?role=client&pin=${encodeURIComponent(
            realHost.pairingPin
          )}`
        );
      } catch {
        done(new Error("호스트 주소가 올바르지 않습니다."));
        return;
      }
      this.ws = ws;
      const failTimer = window.setTimeout(() => {
        done(new Error("호스트 응답이 없습니다."));
        ws.close();
      }, AUTH_TIMEOUT_MS);

      ws.onmessage = (event) => {
        const msg = decodeSignalingMessage(String(event.data));
        if (!msg) return;
        if (msg.type === "auth-fail") {
          done(new Error(msg.reason || "인증에 실패했습니다."));
          return;
        }
        if (msg.type === "auth-ok") {
          if (msg.mediaPort) this.mediaPort = msg.mediaPort;
          if (msg.captureBackend) this.captureBackend = msg.captureBackend;
          ws.send(
            encodeSignalingMessage({
              type: "start-stream",
              gameId: this.gameId,
              quality: this.buildQuality(),
            })
          );
          return;
        }
        if (msg.type === "stream-ready") {
          this.mediaPort = msg.mediaPort;
          this.captureBackend = msg.captureBackend;
          done();
          return;
        }
        if (msg.type === "games") {
          this.gamesListeners.forEach((cb) => cb(msg.games));
        }
        if (msg.type === "peer-left" || msg.type === "bye") {
          void this.disconnect();
        }
      };
      ws.onerror = () => done(new Error("시그널링 연결에 실패했습니다."));
      ws.onclose = () => {
        if (!settled) done(new Error("시그널링이 종료되었습니다."));
      };
    });
  }

  /**
   * Raw TCP from the webview isn't available — use Tauri command when
   * running in the desktop app; otherwise fail with a clear message.
   */
  private async openMediaTcp(realHost: RealHostConnectInfo): Promise<void> {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (!isTauri()) {
      throw new Error(
        "네이티브 NVENC 스트리밍은 LumaLink Streaming 데스크톱 앱에서만 지원됩니다."
      );
    }

    this.setupDecoder();

    const { invoke } = await import("@tauri-apps/api/core");
    const { listen } = await import("@tauri-apps/api/event");

    const unlisten = await listen<number[]>("lumalink-media-frame", (event) => {
      if (this.abort) return;
      const bytes = new Uint8Array(event.payload);
      this.bytesReceived += bytes.byteLength;
      this.feedAnnexB(bytes);
    });

    this.mediaReader = new AbortController();
    this.mediaReader.signal.addEventListener("abort", () => {
      unlisten();
    });

    await invoke("media_connect", {
      host: realHost.address,
      port: this.mediaPort,
      pin: realHost.pairingPin,
    });
  }

  private setupDecoder() {
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas를 초기화할 수 없습니다.");

    this.decoder = new VideoDecoder({
      output: (frame) => {
        if (!this.canvas || !ctx) {
          frame.close();
          return;
        }
        this.canvas.width = frame.displayWidth;
        this.canvas.height = frame.displayHeight;
        ctx.drawImage(frame, 0, 0);
        frame.close();
        this.framesDecoded += 1;
        if (this.videoEl && !this.videoEl.srcObject) {
          this.videoEl.srcObject = this.canvas.captureStream(60);
          void this.videoEl.play().catch(() => undefined);
        }
      },
      error: (err) => {
        console.error("VideoDecoder error", err);
      },
    });

    this.decoder.configure({
      codec: "avc1.640028",
      optimizeForLatency: true,
      hardwareAcceleration: "prefer-hardware",
    });
  }

  private feedAnnexB(data: Uint8Array) {
    if (!this.decoder || this.decoder.state === "closed") return;
    // Treat IDR NAL (type 5) as keyframe.
    let isKey = false;
    for (let i = 0; i + 4 < data.length; i++) {
      if (data[i] === 0 && data[i + 1] === 0) {
        let nalStart = -1;
        if (data[i + 2] === 1) nalStart = i + 3;
        else if (data[i + 2] === 0 && data[i + 3] === 1) nalStart = i + 4;
        if (nalStart >= 0 && nalStart < data.length) {
          const nalType = data[nalStart] & 0x1f;
          if (nalType === 5) isKey = true;
          break;
        }
      }
    }
    try {
      this.decoder.decode(
        new EncodedVideoChunk({
          type: isKey ? "key" : "delta",
          timestamp: performance.now() * 1000,
          data,
        })
      );
    } catch {
      // Ignore decode errors for incomplete AUs.
    }
  }

  private buildQuality(): RemoteQualitySettings {
    const s = this.settings!;
    return {
      resolution: s.resolution,
      fps: s.fps,
      bitrateMbps: s.bitrateMbps,
      codec: s.codec,
      hostAudio: s.hostAudio,
      streamStartAction: s.streamStartAction,
      customProgramPath: s.customProgramPath || undefined,
      latencyMode: s.latencyMode,
    };
  }

  private startStats() {
    this.lastStatsAt = performance.now();
    this.lastBytes = 0;
    this.statsTimer = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastStatsAt) / 1000;
      const bytes = this.bytesReceived - this.lastBytes;
      this.lastBytes = this.bytesReceived;
      this.lastStatsAt = now;
      const bitrateMbps = dt > 0 ? (bytes * 8) / dt / 1_000_000 : 0;
      const fps = this.framesDecoded;
      this.framesDecoded = 0;
      const stats: StreamStats = {
        fps,
        latencyMs: 0,
        bitrateMbps: Math.round(bitrateMbps * 10) / 10,
        packetLossPct: 0,
        resolution: this.settings?.resolution ?? "1080p",
        decoder: this.captureBackend === "nvenc" ? "hardware" : "software",
      };
      this.statsListeners.forEach((cb) => cb(stats));
    }, 1000);
  }

  async disconnect(): Promise<void> {
    this.abort = true;
    this.setStatus("ended");
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.mediaReader?.abort();
    this.mediaReader = null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("media_disconnect");
    } catch {
      // ignore
    }
    try {
      this.decoder?.close();
    } catch {
      // ignore
    }
    this.decoder = null;
    this.ws?.close();
    this.ws = null;
    if (this.videoEl) this.videoEl.srcObject = null;
  }

  onStats(callback: (stats: StreamStats) => void): Unsubscribe {
    this.statsListeners.add(callback);
    return () => this.statsListeners.delete(callback);
  }

  onStatusChange(callback: (status: StreamSessionStatus) => void): Unsubscribe {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  sendInput(event: InputForwardEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(encodeSignalingMessage({ type: "input", event }));
    }
  }

  attachRenderTarget(target: HTMLVideoElement): void {
    this.videoEl = target;
  }

  onRemoteGames(callback: (games: RemoteGameSummary[]) => void): Unsubscribe {
    this.gamesListeners.add(callback);
    return () => this.gamesListeners.delete(callback);
  }

  private setStatus(status: StreamSessionStatus) {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }
}
