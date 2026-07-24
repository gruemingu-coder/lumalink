import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppState } from "@/state/AppStateContext";
import { resolveGamesForDevice } from "@/utils/games";
import { SIGNALING_PORT } from "@/services/streaming/signalingProtocol";
import { useStreamingSession } from "@/hooks/useStreamingSession";
import { Logo } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { StreamHud } from "@/components/player/StreamHud";
import type { StreamSessionStatus } from "@/types/domain";

const statusText: Record<StreamSessionStatus, string> = {
  idle: "대기 중",
  negotiating: "호스트와 저지연 경로 협상 중...",
  connecting: "스트리밍 세션 연결 중...",
  streaming: "스트리밍 중",
  reconnecting: "재연결 중...",
  ended: "스트리밍이 종료되었습니다",
  error: "연결에 문제가 발생했습니다",
};

export function PlayerPage() {
  const { deviceId, gameId } = useParams<{ deviceId: string; gameId: string }>();
  const navigate = useNavigate();
  const { getDevice, settings, realGamesByDevice } = useAppState();
  const { status, stats, error, mediaRef, start, stop, retry, sendInput } = useStreamingSession();
  const [showHud, setShowHud] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const device = deviceId ? getDevice(deviceId) : undefined;
  const game = deviceId && gameId
    ? resolveGamesForDevice(device, realGamesByDevice).find((g) => g.id === gameId)
    : undefined;
  const canConnect = Boolean(device?.pairingPin);

  useEffect(() => {
    if (device && game && device.pairingPin && !startedRef.current) {
      startedRef.current = true;
      void start({
        deviceId: device.id,
        gameId: game.id,
        settings,
        realHost: {
          address: device.address,
          signalPort: device.signalPort ?? SIGNALING_PORT,
          pairingPin: device.pairingPin,
          clientName: "LumaLink Web",
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device?.id, game?.id]);

  const handleExit = async () => {
    await stop();
    navigate(`/app/library/${deviceId}`);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen().catch(() => undefined);
    }
  };

  // Real sessions forward pointer/keyboard input over the WebRTC data
  // channel so the remote host can actually be controlled. Coordinates
  // are normalized to [0, 1] relative to the rendered video so the
  // host side can scale them to its own screen resolution.
  const forwardPointer = (e: React.PointerEvent<HTMLDivElement>, type: "pointerdown" | "pointerup" | "pointermove") => {
    if (!canConnect || status !== "streaming") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    sendInput({ type, x: clamp01(x), y: clamp01(y) });
  };

  const forwardKey = (e: React.KeyboardEvent<HTMLDivElement>, type: "keydown" | "keyup") => {
    if (!canConnect || status !== "streaming") return;
    e.preventDefault();
    sendInput({ type, key: e.key });
  };

  if (!device || !game) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-950 px-4">
        <ErrorState
          title="스트리밍을 시작할 수 없습니다"
          description="PC 또는 게임 정보를 찾을 수 없습니다. 라이브러리에서 다시 시도해주세요."
          onRetry={() => navigate("/app/devices")}
          retryLabel="내 PC 목록으로"
        />
      </div>
    );
  }

  const isBusy = status === "negotiating" || status === "connecting" || status === "reconnecting";

  return (
    <div className="flex min-h-screen flex-col bg-base-950">
      <a
        href="#player-canvas"
        className="sr-only-focusable fixed left-3 top-3 z-50 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
      >
        플레이어로 건너뛰기
      </a>

      <header className="flex items-center justify-between border-b border-base-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to={`/app/library/${device.id}`} aria-label="라이브러리로 돌아가기">
            <Logo size="sm" showWordmark={false} />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{game.title}</p>
            <p className="truncate text-xs text-slate-500">{device.name}</p>
          </div>
        </div>
        <span className="hidden text-xs text-slate-500 sm:block" role="status" aria-live="polite">
          {statusText[status]}
        </span>
      </header>

      <div className="relative flex-1 p-3 sm:p-5">
        <div
          ref={containerRef}
          id="player-canvas"
          tabIndex={canConnect ? 0 : -1}
          onPointerDown={(e) => forwardPointer(e, "pointerdown")}
          onPointerUp={(e) => forwardPointer(e, "pointerup")}
          onPointerMove={(e) => forwardPointer(e, "pointermove")}
          onKeyDown={(e) => forwardKey(e, "keydown")}
          onKeyUp={(e) => forwardKey(e, "keyup")}
          className={`relative mx-auto flex aspect-video max-h-full w-full max-w-6xl items-center justify-center overflow-hidden rounded-2xl border border-base-800 bg-black ${canConnect ? "cursor-none focus:outline-none" : ""}`}
        >
          <video
            ref={mediaRef}
            autoPlay
            playsInline
            muted={!settings.hostAudio}
            aria-label={`${game.title} 실시간 스트리밍 화면`}
            className={`h-full w-full object-contain ${status === "streaming" ? "opacity-100" : "opacity-30"}`}
          />

          {isBusy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base-950/70 backdrop-blur-sm">
              <Spinner size="lg" />
              <p className="text-sm text-slate-300" aria-live="polite">
                {statusText[status]}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-base-950/85 px-4">
              <ErrorState
                title="연결에 문제가 발생했습니다"
                description={error ?? "알 수 없는 오류가 발생했습니다."}
                onRetry={retry}
                retryLabel="재연결"
                className="max-w-sm border-none bg-transparent"
              />
            </div>
          )}

          {status === "ended" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-base-950/85 px-4 text-center">
              <p className="text-sm text-slate-300">스트리밍이 종료되었습니다.</p>
              <Button onClick={() => navigate(`/app/library/${device.id}`)}>
                라이브러리로 돌아가기
              </Button>
            </div>
          )}

          <StreamHud stats={stats} visible={showHud && status === "streaming"} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-base-800 px-4 py-3 sm:justify-between">
        <p className="hidden text-xs text-slate-500 sm:block">
          화면을 클릭한 뒤 마우스·키보드를 사용하면 호스트 PC로 입력이 전달됩니다.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowHud((v) => !v)}>
            {showHud ? "통계 숨기기" : "통계 표시"}
          </Button>
          <Button variant="secondary" size="sm" onClick={toggleFullscreen}>
            전체화면
          </Button>
          <Button variant="danger" size="sm" onClick={handleExit}>
            스트리밍 종료
          </Button>
        </div>
      </footer>
    </div>
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
