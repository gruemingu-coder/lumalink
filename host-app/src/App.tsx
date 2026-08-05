import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DESKTOP_MODE_GAME_ID,
  SIGNALING_PORT,
  decodeSignalingMessage,
  encodeSignalingMessage,
  type RemoteGameSummary,
  type RemoteQualitySettings,
} from "./signalingProtocol";
import pkg from "../package.json";
import { useAuth } from "./AuthContext";
import { registerDevice } from "./authClient";
import { getOrCreateDeviceId } from "./deviceId";

const APP_VERSION = pkg.version;

interface InstalledGame {
  id: string;
  title: string;
}

type ConnState = "starting" | "listening" | "active" | "relay-error";

const HEARTBEAT_INTERVAL_MS = 30_000;

/** One native UDP session per client (DXGI + NVENC/libx264). */
interface ClientSession {
  kind: "native";
}

function resolutionToDimensions(resolution: RemoteQualitySettings["resolution"] | undefined): {
  width: number;
  height: number;
} {
  switch (resolution) {
    case "720p":
      return { width: 1280, height: 720 };
    case "1440p":
      return { width: 2560, height: 1440 };
    case "4k":
      return { width: 3840, height: 2160 };
    case "1080p":
    default:
      return { width: 1920, height: 1080 };
  }
}

export function App() {
  const { user, token, logout } = useAuth();
  const [pin, setPin] = useState<string | null>(null);
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnState>("starting");
  const [clientCount, setClientCount] = useState(0);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [mediaStats, setMediaStats] = useState<{
    streaming: boolean;
    viewers: number;
    framesSent: number;
    audioSent: number;
    backend: string;
    hostAudio: boolean;
  } | null>(null);
  const [ffmpegSetup, setFfmpegSetup] = useState<
    | { status: "downloading"; percent: number }
    | { status: "extracting" }
    | { status: "ready"; path: string }
    | { status: "error"; message: string }
    | null
  >(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionsRef = useRef<Map<string, ClientSession>>(new Map());
  const gamesRef = useRef<InstalledGame[]>([]);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);
  const pinRef = useRef<string | null>(null);
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const sendHeartbeat = async () => {
      try {
        const [deviceId, info] = await Promise.all([
          getOrCreateDeviceId(),
          invoke<{ name: string; macAddress: string | null; localIp: string | null; signalPort: number }>(
            "get_device_info"
          ),
        ]);
        if (cancelled) return;
        await registerDevice(token, {
          id: deviceId,
          name: info.name,
          macAddress: info.macAddress,
          lastIp: info.localIp,
          signalPort: info.signalPort,
          pairingPin: pinRef.current,
        });
      } catch {
        // Best-effort heartbeat.
      }
    };

    void sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [token]);

  const loadGames = useCallback(() => {
    invoke<InstalledGame[]>("get_installed_games")
      .then((list) => {
        setGames(list);
        setGamesError(null);
      })
      .catch(() => {
        setGames([]);
        setGamesError("Steam 라이브러리를 찾지 못했습니다. Steam이 설치되어 있는지 확인해주세요.");
      });
  }, []);

  const refreshOverallState = useCallback(() => {
    const count = sessionsRef.current.size;
    setClientCount(count);
    setConnState((prev) => (prev === "relay-error" ? prev : count > 0 ? "active" : "listening"));
  }, []);

  const stopClientSession = useCallback(
    (clientId: string) => {
      const session = sessionsRef.current.get(clientId);
      if (!session) return;
      sessionsRef.current.delete(clientId);

      if (sessionsRef.current.size === 0) {
        void invoke("stop_native_stream").catch(() => undefined);
      }
      refreshOverallState();
    },
    [refreshOverallState]
  );

  const stopAllStreaming = useCallback(() => {
    sessionsRef.current.clear();
    void invoke("stop_native_stream").catch(() => undefined);
    refreshOverallState();
  }, [refreshOverallState]);

  const startNativeStreaming = useCallback(
    async (
      ws: WebSocket,
      clientId: string,
      gamesForClient: RemoteGameSummary[],
      gameId: string | null | undefined,
      quality: RemoteQualitySettings | undefined
    ) => {
      setStreamError(null);
      try {
        if (gameId && gameId !== DESKTOP_MODE_GAME_ID) {
          void invoke("launch_game", { gameId }).catch(() => undefined);
        }
        if (quality?.streamStartAction === "bigPicture") {
          void invoke("launch_big_picture").catch(() => undefined);
        } else if (quality?.streamStartAction === "custom" && quality.customProgramPath) {
          void invoke("launch_custom_program", { path: quality.customProgramPath }).catch(() => undefined);
        }

        const { width, height } = resolutionToDimensions(quality?.resolution);
        const backend = await invoke<string>("start_native_stream", {
          width,
          height,
          fps: quality?.fps ?? 120,
          bitrateMbps: quality?.bitrateMbps ?? 35,
          hostAudio: quality?.hostAudio ?? true,
        });
        sessionsRef.current.set(clientId, { kind: "native" });
        refreshOverallState();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            encodeSignalingMessage({
              type: "stream-ready",
              mediaPort: 58714,
              captureBackend: backend === "nvenc" ? "nvenc" : "software",
              clientId,
            })
          );
          ws.send(encodeSignalingMessage({ type: "games", games: gamesForClient, clientId }));
        }
      } catch (err) {
        setStreamError(
          err instanceof Error
            ? `네이티브 캡처 실패: ${err.message}`
            : "네이티브 캡처를 시작할 수 없습니다. ffmpeg 준비가 끝났는지 잠시 후 다시 시도해주세요."
        );
        stopClientSession(clientId);
      }
    },
    [refreshOverallState, stopClientSession]
  );

  useEffect(() => {
    invoke<string>("get_pin").then(setPin).catch(() => setPin(null));
    loadGames();
    let unlisten: (() => void) | undefined;
    void listen("alavex-pin-rotated", () => {
      void invoke<string>("get_pin").then(setPin).catch(() => undefined);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [loadGames]);

  // ffmpeg is prepared automatically in the background (see
  // `ffmpeg_setup.rs`) — no PATH setup required. This just surfaces
  // progress/errors so a first-run download doesn't look like a freeze.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<
      | { status: "downloading"; percent: number }
      | { status: "extracting" }
      | { status: "ready"; path: string }
      | { status: "error"; message: string }
    >("alavex-ffmpeg-setup", (event) => {
      setFfmpegSetup(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const retryFfmpegSetup = useCallback(() => {
    setFfmpegSetup({ status: "downloading", percent: 0 });
    void invoke("setup_ffmpeg").catch(() => undefined);
  }, []);

  useEffect(() => {
    const tick = () => {
      void invoke<{
        streaming: boolean;
        viewers: number;
        framesSent: number;
        audioSent: number;
        backend: string;
        hostAudio: boolean;
      } | null>("media_stats")
        .then(setMediaStats)
        .catch(() => undefined);
    };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const port = SIGNALING_PORT;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/signal?role=host`);
    wsRef.current = ws;

    ws.onopen = () => setConnState("listening");
    ws.onerror = () => setConnState("relay-error");
    ws.onclose = () => setConnState("relay-error");

    ws.onmessage = (event) => {
      const msg = decodeSignalingMessage(String(event.data));
      if (!msg) return;

      switch (msg.type) {
        case "client-connected": {
          const clientId = msg.clientId;
          if (!clientId) break;
          const gamesToSend = gamesRef.current.map((g) => ({ id: g.id, title: g.title }));
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encodeSignalingMessage({ type: "games", games: gamesToSend, clientId }));
          }
          break;
        }
        case "start-stream": {
          const clientId = msg.clientId;
          if (!clientId) break;
          const gamesForClient: RemoteGameSummary[] = gamesRef.current.map((g) => ({
            id: g.id,
            title: g.title,
          }));
          void startNativeStreaming(ws, clientId, gamesForClient, msg.gameId, msg.quality);
          break;
        }
        case "input": {
          if (msg.event) {
            void invoke("inject_input", { event: msg.event }).catch(() => undefined);
          }
          break;
        }
        case "gamepad": {
          void invoke("inject_gamepad", { index: msg.index, gamepad: msg.state }).catch(
            () => undefined
          );
          break;
        }
        case "peer-left": {
          if (msg.clientId) {
            stopClientSession(msg.clientId);
          } else {
            stopAllStreaming();
          }
          break;
        }
        default:
          break;
      }
    };

    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegeneratePin = async () => {
    setIsRegenerating(true);
    try {
      const newPin = await invoke<string>("regenerate_pin");
      setPin(newPin);
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleLaunch = (gameId: string) => {
    void invoke("launch_game", { gameId }).catch(() => undefined);
  };

  const handleLaunchBigPicture = () => {
    void invoke("launch_big_picture").catch(() => undefined);
  };

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-base-950 px-6 py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            AX
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">AlaveX Host</h1>
            <p className="text-xs text-slate-500">이 PC의 게임을 다른 기기에서 스트리밍합니다</p>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <span className="hidden max-w-[10rem] truncate text-xs text-slate-500 sm:block">
              {user.email}
            </span>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-base-600 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
            >
              로그아웃
            </button>
          </div>
        )}
      </header>

      {ffmpegSetup && ffmpegSetup.status !== "ready" && (
        <section className="rounded-2xl border border-brand-500/30 bg-brand-500/5 p-4 text-sm">
          {ffmpegSetup.status === "downloading" && (
            <p className="text-slate-300">
              ffmpeg 준비 중... ({ffmpegSetup.percent}%) — 최초 1회만 필요하며, 이후 실행부터는
              바로 스트리밍할 수 있습니다.
            </p>
          )}
          {ffmpegSetup.status === "extracting" && (
            <p className="text-slate-300">ffmpeg 압축을 푸는 중...</p>
          )}
          {ffmpegSetup.status === "error" && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-danger-400">ffmpeg 준비 실패: {ffmpegSetup.message}</p>
              <button
                type="button"
                onClick={retryFfmpegSetup}
                className="shrink-0 rounded-lg border border-base-600 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
              >
                다시 시도
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-base-700 bg-base-900 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500">페어링 PIN</p>
        <p className="mt-2 font-mono text-5xl font-bold tracking-[0.3em] text-brand-300">
          {pin ?? "----"}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          AlaveX 앱의 페어링 화면에서 이 PC의 IP와 PIN을 입력하세요. PIN은 URL이 아닌 연결
          메시지 본문으로만 전달됩니다. 네이티브 스트리밍(UDP)은 동시에 시청자 1명만 허용합니다.
        </p>
        <button
          type="button"
          onClick={handleRegeneratePin}
          disabled={isRegenerating}
          className="mt-4 rounded-lg border border-base-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-brand-500 hover:text-white disabled:opacity-50"
        >
          {isRegenerating ? "재생성 중..." : "PIN 재생성"}
        </button>
      </section>

      <section className="rounded-2xl border border-base-700 bg-base-900 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-500">연결 상태</p>
          {clientCount > 0 && (
            <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-300">
              연결된 클라이언트 {clientCount}명
            </span>
          )}
        </div>
        <p className="mt-2 text-sm font-medium text-slate-100">{connStateLabel(connState, clientCount)}</p>
        {streamError && <p className="mt-2 text-sm text-danger-400">{streamError}</p>}
        {mediaStats && (
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400 sm:grid-cols-3">
            <div>
              <dt className="text-slate-600">미디어</dt>
              <dd className="font-medium text-slate-200">
                {mediaStats.streaming ? "스트리밍 중" : "대기"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">인코더</dt>
              <dd className="font-medium text-slate-200">{mediaStats.backend}</dd>
            </div>
            <div>
              <dt className="text-slate-600">UDP 시청자</dt>
              <dd className="font-medium text-slate-200">{mediaStats.viewers}</dd>
            </div>
            <div>
              <dt className="text-slate-600">영상 프레임</dt>
              <dd className="font-medium text-slate-200">{mediaStats.framesSent}</dd>
            </div>
            <div>
              <dt className="text-slate-600">오디오</dt>
              <dd className="font-medium text-slate-200">
                {mediaStats.hostAudio ? `${mediaStats.audioSent} pkt` : "끔"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-600">프로토콜</dt>
              <dd className="font-medium text-slate-200">LLU2</dd>
            </div>
          </dl>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {clientCount > 0 && (
            <button
              type="button"
              onClick={stopAllStreaming}
              className="rounded-lg bg-danger-500/15 px-4 py-2 text-sm font-medium text-danger-400 hover:bg-danger-500/25"
            >
              스트리밍 중지
            </button>
          )}
          <button
            type="button"
            onClick={handleLaunchBigPicture}
            className="rounded-lg border border-base-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-brand-500 hover:text-white"
          >
            Steam 빅픽처 모드 실행
          </button>
        </div>
      </section>

      <section className="flex-1 rounded-2xl border border-base-700 bg-base-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            설치된 Steam 게임 ({games.length})
          </p>
          <button type="button" onClick={loadGames} className="text-xs text-brand-400 hover:text-brand-300">
            새로고침
          </button>
        </div>
        {gamesError ? (
          <p className="text-sm text-slate-400">{gamesError}</p>
        ) : games.length === 0 ? (
          <p className="text-sm text-slate-500">설치된 게임을 찾지 못했습니다.</p>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {games.map((game) => (
              <li
                key={game.id}
                className="flex items-center justify-between rounded-lg bg-base-800/70 px-3 py-2 text-sm text-slate-200"
              >
                <span className="truncate">{game.title}</span>
                <button
                  type="button"
                  onClick={() => handleLaunch(game.id)}
                  className="shrink-0 rounded-md border border-base-600 px-2 py-1 text-xs text-slate-400 hover:border-brand-500 hover:text-white"
                >
                  실행
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="text-center text-xs text-slate-600">
        <p>
          창을 닫아도 시스템 트레이에서 계속 실행되며 연결을 받을 수 있습니다. 완전히 종료하려면
          트레이 아이콘 메뉴에서 "종료"를 선택하세요. LAN 전용 · 시그널링은 ws:// · 미디어는
          LLU2(mediaToken + XOR).
        </p>
        <p className="mt-2 text-[11px] text-slate-700">
          AlaveX는 독립적인 프로젝트이며 특정 상용 소프트웨어와 무관합니다. 모든 브랜드 자산은
          오리지널 디자인입니다.
        </p>
        <p className="mt-1 font-mono text-slate-700">v{APP_VERSION}</p>
      </footer>
    </div>
  );
}

function connStateLabel(state: ConnState, clientCount: number): string {
  switch (state) {
    case "starting":
      return "시작하는 중...";
    case "listening":
      return "대기 중 — 클라이언트 연결을 기다리고 있습니다";
    case "active":
      return clientCount > 1
        ? `${clientCount}개의 클라이언트에 DXGI+NVENC로 스트리밍 중`
        : "클라이언트에 DXGI+NVENC로 스트리밍 중";
    case "relay-error":
      return "시그널링 서버에 연결할 수 없습니다. 앱을 재시작해주세요.";
    default:
      return "";
  }
}
