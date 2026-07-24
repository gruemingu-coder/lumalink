import { MockStreamingEngine } from "./MockStreamingEngine";
import { WebRtcStreamingEngine } from "./WebRtcStreamingEngine";
import type { StreamingEngine } from "./StreamingEngine";
import type { StreamConnectConfig } from "@/types/domain";

/**
 * Factory / composition point for the streaming transport.
 *
 * If `config.realHost` is present (the target device was paired
 * against a real LumaLink Host App over the LAN), we use the real
 * WebRTC engine. Otherwise we fall back to the mock engine used by
 * the built-in demo devices. Every consumer (`useStreamingSession`,
 * `PlayerPage`) depends only on the `StreamingEngine` interface, so
 * this is the only place that needs to know both concrete classes
 * exist.
 */
export function createStreamingEngine(config: StreamConnectConfig): StreamingEngine {
  if (config.realHost) {
    return new WebRtcStreamingEngine();
  }
  return new MockStreamingEngine();
}
