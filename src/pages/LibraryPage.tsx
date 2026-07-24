import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppState } from "@/state/AppStateContext";
import { resolveGamesForDevice } from "@/utils/games";
import { connectToRealHost } from "@/services/pairing/realHostClient";
import { SIGNALING_PORT } from "@/services/streaming/signalingProtocol";
import type { Game, PcDevice } from "@/types/domain";
import { GameCard } from "@/components/library/GameCard";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

export function LibraryPage() {
  const { deviceId } = useParams<{ deviceId?: string }>();
  const { devices, getDevice } = useAppState();

  if (!deviceId) {
    return <DevicePicker devices={devices} />;
  }

  return <DeviceLibrary deviceId={deviceId} device={getDevice(deviceId)} />;
}

function DevicePicker({ devices }: { devices: ReturnType<typeof useAppState>["devices"] }) {
  if (devices.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <EmptyState
          title="연결된 PC가 없습니다"
          description="게임 라이브러리를 보려면 먼저 PC를 페어링하세요."
          action={
            <Link to="/app/pairing">
              <Button>PC 페어링하기</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-bold text-white">어떤 PC의 라이브러리를 볼까요?</h1>
      <p className="mt-1 text-sm text-slate-400">라이브러리를 볼 PC를 선택하세요.</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {devices.map((device) => (
          <Link key={device.id} to={`/app/library/${device.id}`}>
            <Card interactive className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-slate-100">{device.name}</p>
                <p className="text-xs text-slate-500">{device.address}</p>
              </div>
              <Badge tone={device.status === "online" ? "success" : "neutral"}>
                {device.status === "online" ? "온라인" : device.status === "sleeping" ? "절전" : "오프라인"}
              </Badge>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function DeviceLibrary({
  deviceId,
  device,
}: {
  deviceId: string;
  device: PcDevice | undefined;
}) {
  const navigate = useNavigate();
  const { realGamesByDevice, setRealGames } = useAppState();
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setSelectedGame(null);
    const timer = setTimeout(() => setIsLoading(false), 550);
    return () => clearTimeout(timer);
  }, [deviceId]);

  const allGames = useMemo(
    () => resolveGamesForDevice(device, realGamesByDevice),
    [device, realGamesByDevice]
  );
  const filteredGames = useMemo(
    () => allGames.filter((g) => g.title.toLowerCase().includes(query.trim().toLowerCase())),
    [allGames, query]
  );

  const handleRefreshRealGames = async () => {
    if (!device?.isReal || !device.pairingPin) return;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const result = await connectToRealHost(
        device.address,
        device.pairingPin,
        "LumaLink Web",
        device.signalPort ?? SIGNALING_PORT
      );
      setRealGames(device.id, result.games);
    } catch (err) {
      setRefreshError(
        err instanceof Error ? err.message : "게임 목록을 새로고침하지 못했습니다."
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!device) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <ErrorState
          title="PC를 찾을 수 없습니다"
          description="페어링이 해제되었거나 잘못된 링크일 수 있습니다."
          onRetry={() => navigate("/app/devices")}
          retryLabel="내 PC 목록으로"
        />
      </div>
    );
  }

  if (device.status === "offline") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <ErrorState
          title={`${device.name}이(가) 오프라인입니다`}
          description="호스트 PC의 전원과 네트워크 연결을 확인한 뒤 다시 시도해주세요."
          onRetry={() => navigate("/app/devices")}
          retryLabel="내 PC 목록으로"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pb-28 sm:px-6 lg:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-brand-400">{device.name}</p>
            {device.isReal && <Badge tone="brand">실기 연결</Badge>}
          </div>
          <h1 className="text-2xl font-bold text-white">게임 라이브러리</h1>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          {device.isReal && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefreshRealGames}
              isLoading={isRefreshing}
            >
              새로고침
            </Button>
          )}
        <label className="relative w-full sm:w-72">
          <span className="sr-only">게임 검색</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="게임 검색..."
            className="w-full rounded-xl border border-base-600 bg-base-900 px-4 py-2.5 pl-9 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-500"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m20 20-3.5-3.5" />
          </svg>
        </label>
        </div>
      </div>

      {refreshError && (
        <ErrorState
          className="mb-6"
          title="새로고침 실패"
          description={refreshError}
          onRetry={handleRefreshRealGames}
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4.6] w-full" />
          ))}
          <span className="sr-only">게임 목록을 불러오는 중입니다</span>
        </div>
      ) : allGames.length === 0 ? (
        <EmptyState
          title="설치된 게임이 없습니다"
          description={
            device.isReal
              ? "호스트 앱이 Steam 라이브러리를 아직 스캔하지 못했을 수 있습니다. 호스트 PC에서 앱을 실행한 뒤 새로고침해보세요."
              : "호스트 PC에 게임을 설치하면 이곳에 자동으로 표시됩니다."
          }
          action={
            device.isReal ? (
              <Button size="sm" onClick={handleRefreshRealGames} isLoading={isRefreshing}>
                새로고침
              </Button>
            ) : undefined
          }
        />
      ) : filteredGames.length === 0 ? (
        <EmptyState
          title="검색 결과가 없습니다"
          description={`"${query}"에 해당하는 게임을 찾지 못했습니다.`}
          action={
            <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
              검색어 지우기
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              selected={selectedGame?.id === game.id}
              onSelect={setSelectedGame}
            />
          ))}
        </div>
      )}

      {selectedGame && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-base-700 bg-base-900/95 px-4 py-4 backdrop-blur-md sm:px-6 md:left-64">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">{selectedGame.title}</p>
              <p className="text-xs text-slate-500">{device.name}에서 스트리밍</p>
            </div>
            <Button onClick={() => navigate(`/player/${device.id}/${selectedGame.id}`)}>
              스트리밍 시작
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
