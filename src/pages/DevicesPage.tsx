import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "@/state/AppStateContext";
import { DeviceCard } from "@/components/devices/DeviceCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

export function DevicesPage() {
  const { devices, removeDevice, updateDeviceStatus } = useAppState();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 650);
    return () => clearTimeout(timer);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshError(null);
    setTimeout(() => {
      setIsRefreshing(false);
      if (Math.random() < 0.15) {
        setRefreshError("PC 상태를 확인하지 못했습니다. 네트워크 연결을 확인해주세요.");
        return;
      }
      devices.forEach((d) => {
        if (d.status === "offline" && Math.random() < 0.3) {
          updateDeviceStatus(d.id, "sleeping");
        }
      });
    }, 900);
  };

  const handleWake = (deviceId: string) => {
    updateDeviceStatus(deviceId, "online");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">내 PC</h1>
          <p className="mt-1 text-sm text-slate-400">
            페어링된 PC를 관리하고 새 PC를 연결하세요.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            isLoading={isRefreshing}
            aria-label="PC 상태 새로고침"
          >
            새로고침
          </Button>
          <Link to="/app/pairing">
            <Button size="sm">+ PC 추가</Button>
          </Link>
        </div>
      </div>

      {refreshError && (
        <ErrorState
          className="mb-6"
          title="새로고침 실패"
          description={refreshError}
          onRetry={handleRefresh}
        />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="mt-4 h-16 w-full" />
              <Skeleton className="mt-4 h-9 w-full" />
            </Card>
          ))}
          <span className="sr-only">PC 목록을 불러오는 중입니다</span>
        </div>
      ) : devices.length === 0 ? (
        <EmptyState
          icon={<MonitorOffIcon />}
          title="아직 페어링된 PC가 없습니다"
          description="게이밍 PC를 LumaLink에 등록하면 어디서든 저지연으로 게임을 스트리밍할 수 있어요."
          action={
            <Link to="/app/pairing">
              <Button>첫 PC 페어링하기</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} onRemove={removeDevice} onWake={handleWake} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonitorOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-7 w-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M8 20h8M12 16v4M5 4h13a1 1 0 0 1 1 1v9m-2 2H4a1 1 0 0 1-1-1V5" />
    </svg>
  );
}
