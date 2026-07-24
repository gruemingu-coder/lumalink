interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gradient-to-r from-base-800 via-base-700 to-base-800 bg-[length:400px_100%] ${className}`}
      style={{ animation: "shimmer 1.6s linear infinite" }}
      aria-hidden="true"
    />
  );
}
