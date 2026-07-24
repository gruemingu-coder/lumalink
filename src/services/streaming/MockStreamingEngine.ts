import type {
  StreamConnectConfig,
  StreamSessionStatus,
  StreamStats,
} from "@/types/domain";
import type {
  InputForwardEvent,
  StreamingEngine,
  Unsubscribe,
} from "./StreamingEngine";

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Deterministic-ish fake "video" renderer so the player screen feels
 * alive without a real media pipeline. Draws a slowly drifting
 * gradient field plus a few orbiting particles onto a <canvas>.
 *
 * A real WebRTC engine would instead attach the incoming
 * MediaStream to a <video> element via `srcObject` and never touch
 * canvas drawing at all.
 */
function drawFrame(ctx: CanvasRenderingContext2D, t: number, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  const hueA = (t * 8) % 360;
  const hueB = (hueA + 70) % 360;
  gradient.addColorStop(0, `hsl(${hueA}, 70%, 14%)`);
  gradient.addColorStop(1, `hsl(${hueB}, 70%, 10%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  const particleCount = 18;
  for (let i = 0; i < particleCount; i += 1) {
    const angle = t * 0.0006 + (i / particleCount) * Math.PI * 2;
    const radius = Math.min(w, h) * (0.18 + 0.16 * Math.sin(t * 0.0004 + i));
    const cx = w / 2 + Math.cos(angle) * radius;
    const cy = h / 2 + Math.sin(angle) * radius * 0.6;
    const size = 3 + 2.5 * Math.sin(t * 0.002 + i * 1.3);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1, size), 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${(hueA + i * 12) % 360}, 90%, 70%, 0.55)`;
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 0.003);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, (t * 0.12) % h, w, 2);
  ctx.restore();
}

export class MockStreamingEngine implements StreamingEngine {
  private status: StreamSessionStatus = "idle";

  private config: StreamConnectConfig | null = null;

  private statusListeners = new Set<(status: StreamSessionStatus) => void>();

  private statsListeners = new Set<(stats: StreamStats) => void>();

  private statsTimer: ReturnType<typeof setInterval> | null = null;

  private renderTarget: HTMLCanvasElement | null = null;

  private renderHandle: number | null = null;

  private startedAt = 0;

  private disposed = false;

  async connect(config: StreamConnectConfig): Promise<void> {
    this.disposed = false;
    this.config = config;

    this.setStatus("negotiating");
    await delay(randomBetween(450, 750));
    if (this.disposed) return;

    this.setStatus("connecting");
    await delay(randomBetween(500, 900));
    if (this.disposed) return;

    this.setStatus("streaming");
    this.startedAt = performance.now();
    this.startStatsLoop();
    this.startRenderLoop();
  }

  async disconnect(): Promise<void> {
    this.disposed = true;
    this.stopStatsLoop();
    this.stopRenderLoop();
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

  sendInput(_event: InputForwardEvent): void {
    // No-op in the mock engine. A WebRTC engine would forward this
    // over an RTCDataChannel to the host input driver.
  }

  attachRenderTarget(target: HTMLCanvasElement | HTMLVideoElement): void {
    if (target instanceof HTMLCanvasElement) {
      this.renderTarget = target;
    }
  }

  private setStatus(status: StreamSessionStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  private startStatsLoop() {
    if (!this.config) return;
    const { settings } = this.config;

    const tick = () => {
      if (!this.config) return;
      const elapsedSec = (performance.now() - this.startedAt) / 1000;
      // Latency stays low and stable to sell the "low latency" promise,
      // with a small warm-up ramp-down and occasional light jitter.
      const warmup = Math.max(0, 6 - elapsedSec) * 1.5;
      const jitter = randomBetween(-1.5, 1.5);
      const latencyMs = Math.max(6, Math.round(11 + warmup + jitter));

      const fpsDrop = Math.random() < 0.08 ? randomBetween(1, 4) : 0;
      const fps = Math.max(1, Math.round(settings.fps - fpsDrop));

      const bitrateJitter = randomBetween(-1.2, 1.2);
      const bitrateMbps = Math.max(
        1,
        Math.round((settings.bitrateMbps + bitrateJitter) * 10) / 10
      );

      const packetLossPct =
        Math.random() < 0.15 ? Math.round(randomBetween(0.1, 1.2) * 10) / 10 : 0;

      const stats: StreamStats = {
        fps,
        latencyMs,
        bitrateMbps,
        packetLossPct,
        resolution: settings.resolution,
        decoder: settings.hardwareDecode ? "hardware" : "software",
      };

      this.statsListeners.forEach((listener) => listener(stats));
    };

    tick();
    this.statsTimer = setInterval(tick, 1000);
  }

  private stopStatsLoop() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
  }

  private startRenderLoop() {
    const step = (t: number) => {
      const canvas = this.renderTarget;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const displayWidth = canvas.clientWidth || 640;
          const displayHeight = canvas.clientHeight || 360;
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const targetWidth = Math.round(displayWidth * dpr);
          const targetHeight = Math.round(displayHeight * dpr);
          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }
          drawFrame(ctx, t, canvas.width, canvas.height);
        }
      }
      this.renderHandle = requestAnimationFrame(step);
    };
    this.renderHandle = requestAnimationFrame(step);
  }

  private stopRenderLoop() {
    if (this.renderHandle !== null) {
      cancelAnimationFrame(this.renderHandle);
      this.renderHandle = null;
    }
  }

  getStatus(): StreamSessionStatus {
    return this.status;
  }
}
