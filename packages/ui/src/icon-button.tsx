"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { cn } from "./cn";
import { fastTransition } from "./styles";
import type { ButtonSize } from "./types";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: ButtonSize;
  children: ReactNode;
}

const sizes: Record<ButtonSize, CSSProperties> = {
  sm: { width: "28px", height: "28px" },
  md: { width: "32px", height: "32px" },
  lg: { width: "40px", height: "40px" },
};

export function IconButton({
  label,
  size = "md",
  className,
  style,
  disabled,
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  const base: CSSProperties = {
    ...sizes[size],
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-md)",
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: fastTransition,
    boxShadow: "none",
    padding: 0,
    ...style,
  };

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn("mm-icon-btn", className)}
      style={base}
      disabled={disabled}
      data-size={size}
      {...rest}
    >
      {children}
    </button>
  );
}
