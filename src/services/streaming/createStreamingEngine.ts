import { NativeH264StreamingEngine } from "./NativeH264StreamingEngine";
import type { StreamingEngine } from "./StreamingEngine";
import type { StreamConnectConfig } from "@/types/domain";

/**
 * Prefer native DXGI+NVENC (custom UDP H.264 + WebCodecs) inside the Tauri
 * streaming app. Browsers that lack the Tauri media bridge should not
 * enter the player route.
 */
export function createStreamingEngine(config: StreamConnectConfig): StreamingEngine {
  if (!config.realHost) {
    throw new Error("realHost 연결 정보가 없어 스트리밍을 시작할 수 없습니다.");
  }
  return new NativeH264StreamingEngine();
}
