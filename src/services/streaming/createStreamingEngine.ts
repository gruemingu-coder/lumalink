import { WebRtcStreamingEngine } from "./WebRtcStreamingEngine";
import type { StreamingEngine } from "./StreamingEngine";
import type { StreamConnectConfig } from "@/types/domain";

/**
 * Factory / composition point for the streaming transport. Every device
 * reachable from the UI is now a real LumaLink Host App connection (see
 * `PairingPage`/cloud device sync), so this always returns the real WebRTC
 * engine — kept as a factory (rather than calling `new WebRtcStreamingEngine()`
 * directly at call sites) so a future transport can be swapped in here
 * without touching `useStreamingSession`/`PlayerPage`.
 */
export function createStreamingEngine(config: StreamConnectConfig): StreamingEngine {
  if (!config.realHost) {
    throw new Error("realHost 연결 정보가 없어 스트리밍을 시작할 수 없습니다.");
  }
  return new WebRtcStreamingEngine();
}
