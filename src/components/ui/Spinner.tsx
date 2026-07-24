interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-[3px]",
  lg: "h-12 w-12 border-4",
};

export function Spinner({ size = "md", label, className = "" }: SpinnerProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} role="status">
      <span
        className={`${sizeMap[size]} animate-spin rounded-full border-brand-500/30 border-t-brand-400`}
        aria-hidden="true"
      />
      {label && <span className="text-sm text-slate-400">{label}</span>}
      <span className="sr-only">{label ?? "로딩 중"}</span>
    </div>
  );
}
