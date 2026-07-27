"use client";

import type { CSSProperties, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { fastTransition, fontBody } from "./styles";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({
  className,
  style,
  disabled,
  invalid,
  rows = 3,
  ...rest
}: TextareaProps) {
  const base: CSSProperties = {
    ...fontBody,
    width: "100%",
    minHeight: "72px",
    padding: "var(--space-2) var(--space-3)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-input)",
    color: "var(--text)",
    border: `1px solid ${invalid ? "var(--danger)" : "var(--border)"}`,
    outline: "none",
    transition: fastTransition,
    boxShadow: "none",
    resize: "vertical",
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  return (
    <textarea
      className={cn("mm-textarea", className)}
      style={base}
      disabled={disabled}
      rows={rows}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
