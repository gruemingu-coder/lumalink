import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

export function Card({ className = "", interactive = false, children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-base-700 bg-base-850/80 backdrop-blur-sm shadow-panel ${
        interactive
          ? "transition-all duration-150 hover:border-brand-500/60 hover:shadow-glow"
          : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
