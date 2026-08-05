import { useTheme } from "@/state/ThemeContext";

interface ThemeSwitcherProps {
  className?: string;
}

/** Compact row of theme swatches — usable anywhere without going to Settings. */
export function ThemeSwitcher({ className = "" }: ThemeSwitcherProps) {
  const { theme, setTheme, options } = useTheme();

  return (
    <div className={`flex items-center gap-1.5 ${className}`} role="group" aria-label="디자인 테마 선택">
      {options.map((option) => {
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={selected}
            onClick={() => setTheme(option.id)}
            className={`flex h-6 w-6 items-center justify-center rounded-full border transition-transform ${
              selected ? "scale-110 border-heading" : "border-base-600 hover:scale-105"
            }`}
            style={{ backgroundColor: option.previewBg }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: option.previewAccent }} />
          </button>
        );
      })}
    </div>
  );
}
