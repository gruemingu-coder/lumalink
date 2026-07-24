import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "@/state/AppStateContext";
import { useAuth } from "@/state/AuthContext";
import { listDevices } from "@/services/account/authClient";
import { cloudDeviceToPcDevice } from "@/utils/cloudDevices";
import { sendWakeOnLan, WakeOnLanUnavailableError } from "@/services/host/wakeOnLan";
import { DeviceCard } from "@/components/devices/DeviceCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";

// How often to re-pull the account's cloud device list, so a host coming
// online/offline (or a PIN regenerated on another machine) shows up here
// without the user having to do anything.
const CLOUD_SYNC_INTERVAL_MS = 20_000;

export function DevicesPage() {
  const { devices, removeDevice, syncCloudDevices } = useAppState();
  const { token } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [wakingId, setWakingId] = useState<string | null>(null);
  const [wakeMessage, setWakeMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 650);
    return () => clearTimeout(timer);
  }, []);

  const syncFromCloud = useCallback(async () => {
    if (!token) return;
    try {
      const cloudDevices = await listDevices(token);
      syncCloudDevices(cloudDevices.map(cloudDeviceToPcDevice));
      setRefreshError(null);
    } catch (err) {
      setRefreshError(
        err instanceof Error ? err.message : "PC 목록을 불러오지 못했습니다."
      );
    }
  }, [token, syncCloudDevices]);

  useEffect(() => {
    if (!token) return;
    void syncFromCloud();
    const interval = window.setInterval(() => void syncFromCloud(), CLOUD_SYNC_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [token, syncFromCloud]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await syncFromCloud();
    setIsRefreshing(false);
  };

  const handleWake = async (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device?.macAddress) {
      setWakeMessage("이 PC의 MAC 주소를 알 수 없어 Wake-on-LAN을 보낼 수 없습니다.");
      return;
    }
    setWakingId(deviceId);
    setWakeMessage(null);
    try {
      await sendWakeOnLan(device.macAddress);
      setWakeMessage(
        `${device.name}(으)로 Wake-on-LAN 패킷을 전송했습니다. PC의 WOL 설정에 따라 부팅까지 시간이 걸릴 수 있습니다.`
      );
    } catch (err) {
      setWakeMessage(
        err instanceof WakeOnLanUnavailableError || err instanceof Error
          ? err.message
          : "PC 깨우기에 실패했습니다."
      );
    } finally {
      setWakingId(null);
    }
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

      {wakeMessage && (
        <Card className="mb-6 p-4 text-sm text-slate-300" role="status">
          {wakeMessage}
        </Card>
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
            <DeviceCard
              key={device.id}
              device={device}
              onRemove={removeDevice}
              onWake={handleWake}
              isWaking={wakingId === device.id}
            />
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
