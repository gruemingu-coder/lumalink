interface LogoProps {
  size?: "sm" | "md" | "lg";
  showWordmark?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { icon: 24, text: "text-base" },
  md: { icon: 32, text: "text-xl" },
  lg: { icon: 44, text: "text-3xl" },
};

/**
 * Original AlaveX mark: a solid gradient badge with a bold geometric "A"
 * monoline glyph. Not derived from any third-party logo or brand asset.
 */
export function Logo({ size = "md", showWordmark = true, className = "" }: LogoProps) {
  const { icon, text } = sizeMap[size];
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="64" height="64" rx="17" fill="url(#alavex-badge)" />
        <path
          d="M19 47L32 15L45 47"
          stroke="white"
          strokeWidth="6.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M24.5 35H39.5" stroke="white" strokeWidth="6" strokeLinecap="round" />
        <defs>
          <linearGradient id="alavex-badge" x1="4" y1="4" x2="60" y2="60">
            <stop stopColor="rgb(var(--color-brand-500))" />
            <stop offset="1" stopColor="rgb(var(--color-accent-400))" />
          </linearGradient>
        </defs>
      </svg>
      {showWordmark && (
        <span className={`font-semibold tracking-tight text-heading ${text}`}>
          Alave<span className="text-brand-400">X</span>
        </span>
      )}
    </div>
  );
}
