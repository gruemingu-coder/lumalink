import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const HEARTBEAT_INTERVAL_MS = 30_000;

/** One `RTCPeerConnection` per connected client, keyed by the relay's `clientId`. */
interface ClientSession {
  pc: RTCPeerConnection;
}

export function App() {
  const { user, token, logout } = useAuth();
  const [pin, setPin] = useState<string | null>(null);
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnState>("starting");
  const [clientCount, setClientCount] = useState(0);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  // The screen is captured once and its tracks are shared across every
  // connected client's RTCPeerConnection — no need to re-capture per
  // client, and it means N clients watching the same PC don't cost N×
  // the capture overhead.
  const streamRef = useRef<MediaStream | null>(null);
  const sessionsRef = useRef<Map<string, ClientSession>>(new Map());
  // The WebSocket effect below only runs once on mount, so it can't see
  // later `games` state updates via closure — read the latest list
  // through this ref instead.
  const gamesRef = useRef<InstalledGame[]>([]);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);
  // Same pattern as `gamesRef`: the heartbeat effect below only needs the
  // *current* PIN at send-time, not to re-run whenever it changes.
  const pinRef = useRef<string | null>(null);
  useEffect(() => {
    pinRef.current = pin;
  }, [pin]);

  // Registers this PC to the logged-in account so a LumaLink Streaming
  // app logged into the same account can find it without the user typing
  // in an IP/PIN — see `worker/index.ts`'s `POST /api/devices`.
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
        // Best-effort — offline or the account server is unreachable;
        // the next interval tick will retry. Local pairing (PIN over
        // LAN) still works regardless.
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
      session.pc.close();
      sessionsRef.current.delete(clientId);

      // Only tear down the shared capture stream once nobody is watching.
      if (sessionsRef.current.size === 0) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      refreshOverallState();
    },
    [refreshOverallState]
  );

  const stopAllSharing = useCallback(() => {
    sessionsRef.current.forEach((session) => session.pc.close());
    sessionsRef.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    refreshOverallState();
  }, [refreshOverallState]);

  const ensureCaptureStream = useCallback(
    async (quality: RemoteQualitySettings | undefined): Promise<MediaStream> => {
      if (streamRef.current && streamRef.current.getVideoTracks()[0]?.readyState === "live") {
        return streamRef.current;
      }
      const { width, height } = resolutionToDimensions(quality?.resolution);
      const targetFps = quality?.fps ?? 60;
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: targetFps } },
        audio: quality?.hostAudio ?? true,
      });
      stream.getVideoTracks().forEach((track) => {
        // Hints the encoder to prioritize smooth motion over per-frame
        // sharpness for screen/game content — a real, browser-native
        // knob (as opposed to re-implementing capture/encode in Rust).
        track.contentHint = "motion";
      });
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        // The user stopped sharing from the OS picker/browser UI —
        // tear down every session, since there's nothing left to send.
        stopAllSharing();
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(encodeSignalingMessage({ type: "bye" }));
        }
      });
      return stream;
    },
    [stopAllSharing]
  );

  const startSharing = useCallback(
    async (
      offerSdp: string,
      ws: WebSocket,
      clientId: string,
      gamesForClient: RemoteGameSummary[],
      gameId: string | null | undefined,
      quality: RemoteQualitySettings | undefined
    ) => {
      setShareError(null);
      try {
        // Launch whatever the client asked to play before we start
        // capturing — "desktop" mode (or no gameId) skips this and just
        // shares whatever's already on screen.
        if (gameId && gameId !== DESKTOP_MODE_GAME_ID) {
          void invoke("launch_game", { gameId }).catch(() => undefined);
        }
        // What to do beyond that is a client-side setting
        // (`streamStartAction`) — "desktop" needs no extra action here.
        if (quality?.streamStartAction === "bigPicture") {
          void invoke("launch_big_picture").catch(() => undefined);
        } else if (quality?.streamStartAction === "custom" && quality.customProgramPath) {
          void invoke("launch_custom_program", { path: quality.customProgramPath }).catch(() => undefined);
        }

        const stream = await ensureCaptureStream(quality);
        const targetFps = quality?.fps ?? 60;

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        sessionsRef.current.set(clientId, { pc });
        refreshOverallState();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        void applyEncodingPreferences(pc, quality, targetFps);

        pc.onicecandidate = (event) => {
          if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(
              encodeSignalingMessage({
                type: "ice",
                candidate: {
                  candidate: event.candidate.candidate,
                  sdpMid: event.candidate.sdpMid,
                  sdpMLineIndex: event.candidate.sdpMLineIndex,
                },
                clientId,
              })
            );
          }
        };

        pc.ondatachannel = (event) => {
          event.channel.onmessage = (msg) => {
            try {
              const data = JSON.parse(String(msg.data));
              if (data?.kind === "input" && data.event) {
                void invoke("inject_input", { event: data.event }).catch(() => undefined);
              }
            } catch {
              // Ignore malformed data channel messages.
            }
          };
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            stopClientSession(clientId);
          }
        };

        await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (ws.readyState === WebSocket.OPEN && answer.sdp) {
          ws.send(encodeSignalingMessage({ type: "answer", sdp: answer.sdp, clientId }));
          ws.send(encodeSignalingMessage({ type: "games", games: gamesForClient, clientId }));
        }
      } catch (err) {
        setShareError(
          err instanceof Error
            ? `화면 공유를 시작할 수 없습니다: ${err.message}`
            : "화면 공유를 시작할 수 없습니다."
        );
        stopClientSession(clientId);
      }
    },
    [ensureCaptureStream, refreshOverallState, stopClientSession]
  );

  useEffect(() => {
    invoke<string>("get_pin").then(setPin).catch(() => setPin(null));
    loadGames();
  }, [loadGames]);

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
          // Pairing and the library "새로고침" button only do a quick
          // auth handshake (no WebRTC offer follows), so send the game
          // list right away — don't wait for `startSharing`, which only
          // runs once an actual streaming session's SDP offer arrives.
          const clientId = msg.clientId;
          if (!clientId) break;
          const gamesToSend = gamesRef.current.map((g) => ({ id: g.id, title: g.title }));
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encodeSignalingMessage({ type: "games", games: gamesToSend, clientId }));
          }
          break;
        }
        case "offer": {
          const clientId = msg.clientId;
          if (!clientId) break;
          const gamesForClient: RemoteGameSummary[] = gamesRef.current.map((g) => ({
            id: g.id,
            title: g.title,
          }));
          void startSharing(msg.sdp, ws, clientId, gamesForClient, msg.gameId, msg.quality);
          break;
        }
        case "ice": {
          const clientId = msg.clientId;
          if (!clientId) break;
          void sessionsRef.current
            .get(clientId)
            ?.pc.addIceCandidate({
              candidate: msg.candidate.candidate,
              sdpMid: msg.candidate.sdpMid ?? undefined,
              sdpMLineIndex: msg.candidate.sdpMLineIndex ?? undefined,
            })
            .catch(() => undefined);
          break;
        }
        case "peer-left": {
          if (msg.clientId) {
            stopClientSession(msg.clientId);
          } else {
            // No clientId means the whole relay reset (shouldn't happen
            // on this leg in practice) — be safe and clear everything.
            stopAllSharing();
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
            LL
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">LumaLink Host</h1>
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

      <section className="rounded-2xl border border-base-700 bg-base-900 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500">페어링 PIN</p>
        <p className="mt-2 font-mono text-5xl font-bold tracking-[0.3em] text-brand-300">
          {pin ?? "----"}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          LumaLink 앱/웹의 "IP로 실제 PC 연결" 화면에서 이 PC의 IP 주소와 이 PIN을 입력하세요. 같은
          PIN으로 여러 기기가 동시에 연결할 수 있습니다.
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
        {shareError && <p className="mt-2 text-sm text-danger-400">{shareError}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {clientCount > 0 && (
            <button
              type="button"
              onClick={stopAllSharing}
              className="rounded-lg bg-danger-500/15 px-4 py-2 text-sm font-medium text-danger-400 hover:bg-danger-500/25"
            >
              모든 화면 공유 중지
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
          트레이 아이콘 메뉴에서 "종료"를 선택하세요. LAN 환경에서만 사용하도록 설계되었습니다
          (암호화되지 않은 시그널링).
        </p>
        <p className="mt-2 text-[11px] text-slate-700">
          LumaLink는 독립적인 프로젝트이며 특정 상용 소프트웨어와 무관합니다. 모든 브랜드 자산은
          오리지널 디자인입니다.
        </p>
        <p className="mt-1 font-mono text-slate-700">v{APP_VERSION}</p>
      </footer>
    </div>
  );
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

/**
 * Applies the client's requested frame rate/bitrate/quality trade-off
 * to the outgoing video track via `RTCRtpSender.setParameters()`. This
 * is the real, browser-native way to raise the FPS ceiling and tune
 * the encoder — WebView2/Chromium already does hardware-accelerated
 * H.264 encoding under the hood when the GPU supports it, so this
 * config (plus `preferH264`/`contentHint` on the client+here) gets
 * meaningfully closer to Moonlight-style low-latency/high-FPS
 * streaming without reimplementing capture+encode natively in Rust.
 */
async function applyEncodingPreferences(
  pc: RTCPeerConnection,
  quality: RemoteQualitySettings | undefined,
  targetFps: number
): Promise<void> {
  const sender = pc.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxFramerate = targetFps;
    if (quality?.bitrateMbps) {
      params.encodings[0].maxBitrate = Math.round(quality.bitrateMbps * 1_000_000);
    }
    const paramsWithDegradation = params as RTCRtpSendParameters & {
      degradationPreference?: "maintain-framerate" | "maintain-resolution" | "balanced";
    };
    paramsWithDegradation.degradationPreference =
      quality?.latencyMode === "latency"
        ? "maintain-framerate"
        : quality?.latencyMode === "quality"
          ? "maintain-resolution"
          : "balanced";
    await sender.setParameters(params);
  } catch {
    // Best-effort — some browsers reject parameter changes before the
    // connection reaches certain states. Streaming still works with
    // browser-default encoding settings if this fails.
  }
}

function connStateLabel(state: ConnState, clientCount: number): string {
  switch (state) {
    case "starting":
      return "시작하는 중...";
    case "listening":
      return "대기 중 — 클라이언트 연결을 기다리고 있습니다";
    case "active":
      return clientCount > 1
        ? `${clientCount}개의 클라이언트에 화면을 공유하고 있습니다`
        : "클라이언트에 화면을 공유하고 있습니다";
    case "relay-error":
      return "시그널링 서버에 연결할 수 없습니다. 앱을 재시작해주세요.";
    default:
      return "";
  }
}
