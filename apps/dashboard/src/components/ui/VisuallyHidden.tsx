import type { ReactNode } from "react";

/** Screen-reader-only text — visually hidden without being removed from the accessibility tree. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
