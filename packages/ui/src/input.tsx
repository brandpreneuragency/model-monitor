"use client";

import type { CSSProperties, InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { fastTransition, fontBody } from "./styles";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({
  className,
  style,
  disabled,
  invalid,
  type = "text",
  ...rest
}: InputProps) {
  const base: CSSProperties = {
    ...fontBody,
    height: "32px",
    width: "100%",
    padding: "0 var(--space-3)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-input)",
    color: "var(--text)",
    border: `1px solid ${invalid ? "var(--danger)" : "var(--border)"}`,
    outline: "none",
    transition: fastTransition,
    boxShadow: "none",
    opacity: disabled ? 0.5 : 1,
    ...style,
  };

  return (
    <input
      type={type}
      className={cn("mm-input", className)}
      style={base}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
