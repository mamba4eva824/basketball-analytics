"use client";
import type { CSSProperties } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  /** hover tooltip, e.g. how the value is computed */
  title?: string;
  /** overrides the default value size (text-2xl), e.g. for long values on small screens */
  valueClassName?: string;
  valueStyle?: CSSProperties;
}

export function StatCard({ label, value, subtitle, trend, className = "", onClick, selected, title, valueClassName = "text-2xl", valueStyle }: StatCardProps) {
  return (
    <div
      title={title}
      className={`glass-card stat-card p-5 hover-glow transition-all duration-300 ${onClick ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-lakers-purple shadow-lg shadow-lakers-purple/20" : ""} ${className}`}
      {...(onClick ? { role: "button", tabIndex: 0 } : {})}
      onClick={onClick}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <p className="text-xs uppercase tracking-wider text-text-muted mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className={`${valueClassName} font-bold font-mono text-text-primary break-words min-w-0`} style={valueStyle}>{value}</p>
        {trend && trend !== "neutral" && (
          <span className={`text-sm mb-0.5 ${trend === "up" ? "text-green-400" : "text-red-400"}`}>
            {trend === "up" ? "\u25B2" : "\u25BC"}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-text-faint mt-1">{subtitle}</p>}
    </div>
  );
}
