"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

/** A12.8(d): the error, when present, is announced (role="alert") and reachable from the field (aria-describedby). */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, className = "", ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-token-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm text-text-primary focus-visible:outline-none ${error ? "border-danger" : ""} ${className}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
});
