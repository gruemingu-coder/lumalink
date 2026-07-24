import React from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-base-700 text-slate-300",
  success: "bg-accent-500/15 text-accent-400 ring-1 ring-inset ring-accent-500/40",
  warning: "bg-warn-500/15 text-warn-400 ring-1 ring-inset ring-warn-500/40",
  danger: "bg-danger-500/15 text-danger-400 ring-1 ring-inset ring-danger-500/40",
  brand: "bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/40",
};

interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function Badge({ tone = "neutral", children, icon, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
