import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  SIGNALING_PORT,
  decodeSignalingMessage,
  encodeSignalingMessage,
  type RemoteGameSummary,
} from "./signalingProtocol";
import pkg from "../package.json";

const APP_VERSION = pkg.version;

interface InstalledGame {
  id: string;
  title: string;
}

type ConnState = "starting" | "listening" | "client-connected" | "sharing" | "relay-error";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function App() {
  const [pin, setPin] = useState<string | null>(null);
  const [games, setGames] = useState<InstalledGame[]>([]);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnState>("starting");
  const [shareError, setShareError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // The WebSocket effect below only runs once on mount, so it can't see
  // later `games` state updates via closure — read the latest list
  // through this ref instead.
  const gamesRef = useRef<InstalledGame[]>([]);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

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

  const stopSharing = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setConnState((prev) => (prev === "relay-error" ? prev : "listening"));
  }, []);

  const startSharing = useCallback(
    async (offerSdp: string, ws: WebSocket, gamesForClient: RemoteGameSummary[]) => {
      setShareError(null);
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 60 } },
          audio: true,
        });
        streamRef.current = stream;

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

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
            stopSharing();
          }
        };

        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          stopSharing();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encodeSignalingMessage({ type: "bye" }));
          }
        });

        await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (ws.readyState === WebSocket.OPEN && answer.sdp) {
          ws.send(encodeSignalingMessage({ type: "answer", sdp: answer.sdp }));
          ws.send(encodeSignalingMessage({ type: "games", games: gamesForClient }));
        }
        setConnState("sharing");
      } catch (err) {
        setShareError(
          err instanceof Error
            ? `화면 공유를 시작할 수 없습니다: ${err.message}`
            : "화면 공유를 시작할 수 없습니다."
        );
        setConnState("client-connected");
      }
    },
    [stopSharing]
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
          setConnState("client-connected");
          // Pairing and the library "새로고침" button only do a quick
          // auth handshake (no WebRTC offer follows), so send the game
          // list right away — don't wait for `startSharing`, which only
          // runs once an actual streaming session's SDP offer arrives.
          const gamesToSend = gamesRef.current.map((g) => ({ id: g.id, title: g.title }));
          console.log(`[LumaLink v${APP_VERSION}] client-connected — sending ${gamesToSend.length} games`, gamesToSend);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(encodeSignalingMessage({ type: "games", games: gamesToSend }));
          } else {
            console.warn(`[LumaLink v${APP_VERSION}] ws not OPEN, readyState=${ws.readyState}`);
          }
          break;
        }
        case "offer": {
          const gamesForClient: RemoteGameSummary[] = gamesRef.current.map((g) => ({
            id: g.id,
            title: g.title,
          }));
          void startSharing(msg.sdp, ws, gamesForClient);
          break;
        }
        case "ice":
          void pcRef.current
            ?.addIceCandidate({
              candidate: msg.candidate.candidate,
              sdpMid: msg.candidate.sdpMid ?? undefined,
              sdpMLineIndex: msg.candidate.sdpMLineIndex ?? undefined,
            })
            .catch(() => undefined);
          break;
        case "peer-left":
          stopSharing();
          setConnState("listening");
          break;
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

  return (
    <div className="flex min-h-screen flex-col gap-6 bg-base-950 px-6 py-8">
      <header className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          LL
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">LumaLink Host</h1>
          <p className="text-xs text-slate-500">이 PC의 게임을 다른 기기에서 스트리밍합니다</p>
        </div>
      </header>

      <section className="rounded-2xl border border-base-700 bg-base-900 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-slate-500">페어링 PIN</p>
        <p className="mt-2 font-mono text-5xl font-bold tracking-[0.3em] text-brand-300">
          {pin ?? "----"}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          LumaLink 앱/웹의 "IP로 실제 PC 연결" 화면에서 이 PC의 IP 주소와 이 PIN을 입력하세요.
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
        <p className="text-xs uppercase tracking-wide text-slate-500">연결 상태</p>
        <p className="mt-2 text-sm font-medium text-slate-100">{connStateLabel(connState)}</p>
        {shareError && <p className="mt-2 text-sm text-danger-400">{shareError}</p>}
        {connState === "sharing" && (
          <button
            type="button"
            onClick={stopSharing}
            className="mt-3 rounded-lg bg-danger-500/15 px-4 py-2 text-sm font-medium text-danger-400 hover:bg-danger-500/25"
          >
            화면 공유 중지
          </button>
        )}
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
          이 창을 닫으면 호스트가 종료되고 더 이상 연결을 받을 수 없습니다. LAN 환경에서만 사용하도록
          설계되었습니다(암호화되지 않은 시그널링).
        </p>
        <p className="mt-1 font-mono text-slate-700">v{APP_VERSION}</p>
      </footer>
    </div>
  );
}

function connStateLabel(state: ConnState): string {
  switch (state) {
    case "starting":
      return "시작하는 중...";
    case "listening":
      return "대기 중 — 클라이언트 연결을 기다리고 있습니다";
    case "client-connected":
      return "클라이언트가 인증되었습니다 — 스트리밍 요청을 기다리는 중";
    case "sharing":
      return "화면을 공유하고 있습니다";
    case "relay-error":
      return "시그널링 서버에 연결할 수 없습니다. 앱을 재시작해주세요.";
    default:
      return "";
  }
}
