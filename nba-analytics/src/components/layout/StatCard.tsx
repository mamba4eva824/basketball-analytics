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
  /** overrides the default value size (text-[28px]), e.g. for long values on small screens */
  valueClassName?: string;
  valueStyle?: CSSProperties;
}

export function StatCard({ label, value, subtitle, trend, className = "", onClick, selected, title, valueClassName = "text-[28px]", valueStyle }: StatCardProps) {
  return (
    <div
      title={title}
      className={`glass-card p-5 hover-glow ${onClick ? "cursor-pointer active:scale-[0.98]" : ""} ${selected ? "ring-2 ring-lakers-purple dark:ring-lakers-gold" : ""} ${className}`}
      {...(onClick ? { role: "button", tabIndex: 0 } : {})}
      onClick={onClick}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <p className="text-[13px] font-medium text-text-muted mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className={`${valueClassName} leading-tight font-semibold font-mono tracking-tight text-text-primary break-words min-w-0`} style={valueStyle}>{value}</p>
        {trend && trend !== "neutral" && (
          <span className={`text-sm mb-1 ${trend === "up" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
            {trend === "up" ? "\u25B2" : "\u25BC"}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
    </div>
  );
}
