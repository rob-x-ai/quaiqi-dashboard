import type { ReactNode } from "react";

interface ChartLoaderProps {
  text?: ReactNode;
  className?: string;
}

export function ChartLoader({ text = "Loading price history…", className = "" }: ChartLoaderProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-14 text-sm text-muted-foreground ${className}`}
    >
      <span role="status" className="inline-flex h-5 w-5 animate-spin items-center justify-center">
        <svg
          className="h-5 w-5 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" opacity="0.25" />
          <path d="M22 12a10 10 0 0 1-10 10" />
        </svg>
        <span className="sr-only">Loading…</span>
      </span>
      <span>{text}</span>
    </div>
  );
}
