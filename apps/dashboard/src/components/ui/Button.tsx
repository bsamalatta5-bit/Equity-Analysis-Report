"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300",
  secondary: "border border-border bg-surface text-text-primary hover:bg-surface-raised",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-50",
  ghost: "bg-transparent text-text-primary hover:bg-surface-raised",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", isLoading = false, disabled, className = "", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex min-h-[2.5rem] items-center justify-center gap-token-2 rounded-token px-token-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
