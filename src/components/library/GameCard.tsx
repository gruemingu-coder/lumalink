import type { Game } from "@/types/domain";
import { formatHours, formatRelativeTime } from "@/utils/format";

interface GameCardProps {
  game: Game;
  selected: boolean;
  onSelect: (game: Game) => void;
}

export function GameCard({ game, selected, onSelect }: GameCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(game)}
      aria-pressed={selected}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border text-left transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        selected
          ? "border-brand-400 shadow-glow ring-2 ring-brand-500/50"
          : "border-base-700 hover:-translate-y-0.5 hover:border-brand-500/50 hover:shadow-glow"
      }`}
    >
      <div
        className={`flex aspect-[3/4] w-full items-end bg-gradient-to-br p-3 ${game.coverGradient}`}
      >
        {game.isDesktopMode ? (
          <span className="flex items-center gap-1 rounded-md bg-black/40 px-2 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            <DesktopIcon />
            데스크탑
          </span>
        ) : (
          <span className="rounded-md bg-black/40 px-2 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            {game.sizeGb}GB
          </span>
        )}
        {selected && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 bg-base-850 p-3">
        <h3 className="truncate text-sm font-semibold text-slate-100">{game.title}</h3>
        {game.isDesktopMode ? (
          <p className="text-xs text-slate-500">게임 없이 바로 화면 공유</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {game.lastPlayedAt ? formatRelativeTime(game.lastPlayedAt) : "미실행"}
            </p>
            <p className="text-[11px] text-slate-600">{formatHours(game.playtimeHours)} 플레이</p>
          </>
        )}
      </div>
    </button>
  );
}

function DesktopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3">
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path strokeLinecap="round" d="M8 20h8M12 16v4" />
    </svg>
  );
}
