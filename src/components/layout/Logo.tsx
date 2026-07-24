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
 * Original LumaLink mark: a hex "link" outline with a diamond core.
 * Not derived from any third-party logo or brand asset.
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
        <rect width="64" height="64" rx="16" className="fill-base-800" />
        <path
          d="M32 10L48 19V37L32 46L16 37V19L32 10Z"
          stroke="url(#lumalink-gradient)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M24 27L32 22L40 27V37L32 42L24 37V27Z" className="fill-accent-500" />
        <circle cx="32" cy="32" r="3.5" className="fill-base-800" />
        <defs>
          <linearGradient id="lumalink-gradient" x1="16" y1="10" x2="48" y2="46">
            <stop stopColor="#8b7bff" />
            <stop offset="1" stopColor="#3fe0c5" />
          </linearGradient>
        </defs>
      </svg>
      {showWordmark && (
        <span className={`font-semibold tracking-tight text-white ${text}`}>
          Luma<span className="text-brand-400">Link</span>
        </span>
      )}
    </div>
  );
}
