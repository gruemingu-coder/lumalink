import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createStreamingEngine } from "@/services/streaming/createStreamingEngine";
import type {
  InputForwardEvent,
  StreamingEngine,
  Unsubscribe,
} from "@/services/streaming/StreamingEngine";
import type {
  StreamConnectConfig,
  StreamSessionStatus,
  StreamStats,
} from "@/types/domain";

interface UseStreamingSessionResult {
  status: StreamSessionStatus;
  stats: StreamStats | null;
  error: string | null;
  /** Attach the <video> element that renders the incoming WebRTC stream. */
  mediaRef: RefObject<HTMLVideoElement>;
  start: (config: StreamConnectConfig) => Promise<void>;
  stop: () => Promise<void>;
  retry: () => Promise<void>;
  /** Forwards mouse/keyboard input to the active engine, if any. */
  sendInput: (event: InputForwardEvent) => void;
}

/**
 * Bridges a `StreamingEngine` instance into React state. This is the
 * only place that owns an engine instance — see `createStreamingEngine.ts`
 * for how the concrete transport is chosen.
 */
export function useStreamingSession(): UseStreamingSessionResult {
  const engineRef = useRef<StreamingEngine | null>(null);
  const unsubscribersRef = useRef<Unsubscribe[]>([]);
  const lastConfigRef = useRef<StreamConnectConfig | null>(null);
  const mediaRef = useRef<HTMLVideoElement>(null);

  const [status, setStatus] = useState<StreamSessionStatus>("idle");
  const [stats, setStats] = useState<StreamStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teardown = useCallback(async () => {
    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];
    if (engineRef.current) {
      await engineRef.current.disconnect();
      engineRef.current = null;
    }
  }, []);

  const start = useCallback(async (config: StreamConnectConfig) => {
    setError(null);
    setStats(null);
    lastConfigRef.current = config;

    const engine = createStreamingEngine(config);
    engineRef.current = engine;

    unsubscribersRef.current = [
      engine.onStatusChange(setStatus),
      engine.onStats(setStats),
    ];

    if (mediaRef.current) {
      engine.attachRenderTarget(mediaRef.current);
    }

    try {
      await engine.connect(config);
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error
          ? err.message
          : "스트리밍 연결 중 알 수 없는 오류가 발생했습니다."
      );
    }
  }, []);

  const stop = useCallback(async () => {
    await teardown();
    setStatus("ended");
  }, [teardown]);

  const retry = useCallback(async () => {
    if (lastConfigRef.current) {
      await teardown();
      await start(lastConfigRef.current);
    }
  }, [start, teardown]);

  const sendInput = useCallback((event: InputForwardEvent) => {
    engineRef.current?.sendInput(event);
  }, []);

  useEffect(() => {
    return () => {
      void teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "streaming" && engineRef.current && mediaRef.current) {
      engineRef.current.attachRenderTarget(mediaRef.current);
    }
  }, [status]);

  return { status, stats, error, mediaRef, start, stop, retry, sendInput };
}
