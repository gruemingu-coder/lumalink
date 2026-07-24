import { NativeH264StreamingEngine } from "./NativeH264StreamingEngine";
import type { StreamingEngine } from "./StreamingEngine";
import type { StreamConnectConfig } from "@/types/domain";

/**
 * Factory for the streaming transport. Uses LumaLink's own native
 * DXGI+NVENC (or software H.264) path via the Host media TCP port —
 * not Sunshine/Moonlight.
 */
export function createStreamingEngine(config: StreamConnectConfig): StreamingEngine {
  if (!config.realHost) {
    throw new Error("realHost 연결 정보가 없어 스트리밍을 시작할 수 없습니다.");
  }
  return new NativeH264StreamingEngine();
}
