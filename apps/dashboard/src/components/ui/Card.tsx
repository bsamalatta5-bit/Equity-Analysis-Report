import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-token border border-border bg-surface p-token-4 shadow-sm ${className}`}
      {...rest}
    />
  );
}
