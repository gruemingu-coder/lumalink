import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PcDevice } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/utils/format";

const statusMeta: Record<PcDevice["status"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  online: { tone: "success", label: "온라인" },
  sleeping: { tone: "warning", label: "절전 모드" },
  offline: { tone: "neutral", label: "오프라인" },
};

interface DeviceCardProps {
  device: PcDevice;
  onRemove: (deviceId: string) => void;
  onWake?: (deviceId: string) => void;
}

export function DeviceCard({ device, onRemove, onWake }: DeviceCardProps) {
  const navigate = useNavigate();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const meta = statusMeta[device.status];
  const isReachable = device.status !== "offline";

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`relative flex h-11 w-11 items-center justify-center rounded-xl bg-base-800 text-slate-300`}
            aria-hidden="true"
          >
            <MonitorIcon />
            {device.status === "online" && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-accent-400" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent-400" />
              </span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-slate-100">{device.name}</h3>
            <p className="text-xs text-slate-500">{device.address}</p>
          </div>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs text-slate-400">
        <div className="flex justify-between gap-2">
          <dt>GPU</dt>
          <dd className="truncate text-slate-300">{device.specs.gpu}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>CPU</dt>
          <dd className="truncate text-slate-300">{device.specs.cpu}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>메모리</dt>
          <dd className="text-slate-300">{device.specs.ramGb}GB</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>마지막 접속</dt>
          <dd className="text-slate-300">{formatRelativeTime(device.lastSeenAt)}</dd>
        </div>
      </dl>

      <div className="mt-1 flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={!isReachable}
          onClick={() => navigate(`/app/library/${device.id}`)}
        >
          {isReachable ? "라이브러리 열기" : "연결 불가"}
        </Button>
        {device.status === "sleeping" && onWake && (
          <Button size="sm" variant="secondary" onClick={() => onWake(device.id)}>
            깨우기
          </Button>
        )}
        {!confirmingRemove ? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${device.name} 페어링 해제`}
            onClick={() => setConfirmingRemove(true)}
          >
            <TrashIcon />
          </Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="danger" onClick={() => onRemove(device.id)}>
              해제
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmingRemove(false)}>
              취소
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path strokeLinecap="round" d="M8 20h8M12 16v4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12" />
    </svg>
  );
}
