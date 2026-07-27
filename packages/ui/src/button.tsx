"use client";

import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { cn } from "./cn";
import { fastTransition, fontBody } from "./styles";
import type { ButtonSize, ButtonVariant } from "./types";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  sm: {
    height: "28px",
    padding: "0 var(--space-2)",
    fontSize: "var(--text-meta-size)",
    gap: "var(--space-1)",
  },
  md: {
    height: "32px",
    padding: "0 var(--space-3)",
    fontSize: "var(--text-body-size)",
    gap: "var(--space-1_5)",
  },
  lg: {
    height: "40px",
    padding: "0 var(--space-4)",
    fontSize: "var(--text-body-size)",
    gap: "var(--space-2)",
  },
};

function variantStyles(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case "primary":
      return {
        background: "var(--accent)",
        color: "var(--text)",
        border: "1px solid transparent",
      };
    case "secondary":
      return {
        background: "var(--bg-input)",
        color: "var(--text)",
        border: "1px solid var(--border)",
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--text-muted)",
        border: "1px solid transparent",
      };
    case "danger":
      return {
        background: "var(--danger-bg)",
        color: "var(--danger)",
        border: "1px solid var(--danger-bg)",
      };
  }
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  style,
  disabled,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const base: CSSProperties = {
    ...fontBody,
    ...sizeStyles[size],
    ...variantStyles(variant),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-md)",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: fastTransition,
    boxShadow: "none",
    ...style,
  };

  return (
    <button
      type={type}
      className={cn("mm-btn", className)}
      style={base}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      {children}
    </button>
  );
}
