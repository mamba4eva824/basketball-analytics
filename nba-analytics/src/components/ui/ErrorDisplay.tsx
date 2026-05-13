"use client";

export function ErrorDisplay({ title = "Something went wrong", message = "An error occurred while loading data. Please try again.", onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="glass-card p-8 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 mb-4">
        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-heading mb-2">{title}</h3>
      <p className="text-text-muted mb-6 max-w-md mx-auto">{message}</p>
      {onRetry && <button onClick={onRetry} className="px-6 py-2 rounded-lg bg-lakers-purple hover:bg-lakers-purple-light transition-colors text-white font-medium">Try Again</button>}
    </div>
  );
}
