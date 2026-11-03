"use client";

export function LoadingSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="glass-card p-4">
          <div className="h-4 rounded-md bg-bar-bg w-3/4 mb-3" />
          <div className="h-3 rounded-md bg-surface-alt w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="glass-card p-5 animate-pulse">
      <div className="h-3 rounded-md bg-bar-bg w-20 mb-3" />
      <div className="h-8 rounded-md bg-bar-bg w-16 mb-2" />
      <div className="h-3 rounded-md bg-surface-alt w-24" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="glass-card p-6 animate-pulse">
      <div className="h-5 rounded-md bg-bar-bg w-40 mb-6" />
      <div className="h-64 rounded-md bg-surface-alt flex items-end justify-between px-4 pb-4 gap-2">
        {[71, 28, 78, 50, 40, 62, 72, 31, 27, 74, 58, 31].map((h, i) => (
          <div key={i} className="bg-bar-bg rounded-t flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 10, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="glass-card overflow-hidden animate-pulse">
      <div className="p-4 border-b border-border-theme"><div className="h-5 rounded-md bg-bar-bg w-32" /></div>
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: cols }).map((_, j) => <div key={j} className="h-4 rounded-md bg-surface-alt flex-1" />)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse"><div className="h-8 rounded-md bg-bar-bg w-64 mb-2" /><div className="h-4 rounded-md bg-surface-alt w-40" /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4"><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></div>
      <ChartSkeleton /><TableSkeleton />
    </div>
  );
}
