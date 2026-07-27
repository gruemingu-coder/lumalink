import type { StreamStats } from "@/types/domain";
import { latencyTone } from "@/utils/format";

interface StreamHudProps {
  stats: StreamStats | null;
  visible: boolean;
}

const toneTextClass: Record<string, string> = {
  success: "text-accent-400",
  warning: "text-warn-400",
  danger: "text-danger-400",
};

export function StreamHud({ stats, visible }: StreamHudProps) {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-2 sm:left-4 sm:top-4"
      role="status"
      aria-label="스트리밍 상태 지표"
    >
      <HudChip label="해상도" value={stats?.resolution ?? "—"} />
      <HudChip label="FPS" value={stats ? String(stats.fps) : "—"} />
      <HudChip
        label="지연시간"
        value={stats ? `${stats.latencyMs}ms` : "—"}
        valueClassName={stats ? toneTextClass[latencyTone(stats.latencyMs)] : ""}
      />
      <HudChip label="비트레이트" value={stats ? `${stats.bitrateMbps}Mbps` : "—"} />
      {stats && stats.packetLossPct > 0 && (
        <HudChip label="패킷 손실" value={`${stats.packetLossPct}%`} valueClassName="text-warn-400" />
      )}
      {stats && (
        <HudChip
          label="디코더"
          value={stats.decoder === "hardware" ? "HW" : "SW"}
        />
      )}
    </div>
  );
}

function HudChip({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 backdrop-blur-sm">
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
      <span className={`font-mono text-xs font-semibold text-slate-100 ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}
