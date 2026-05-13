"use client";

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}

export function StatCard({ label, value, subtitle, trend, className = "", onClick, selected }: StatCardProps) {
  return (
    <div
      className={`glass-card stat-card p-5 hover-glow transition-all duration-300 ${onClick ? "cursor-pointer" : ""} ${selected ? "ring-2 ring-lakers-purple shadow-lg shadow-lakers-purple/20" : ""} ${className}`}
      {...(onClick ? { role: "button", tabIndex: 0 } : {})}
      onClick={onClick}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <p className="text-xs uppercase tracking-wider text-text-muted mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-2xl font-bold font-mono text-text-primary">{value}</p>
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
