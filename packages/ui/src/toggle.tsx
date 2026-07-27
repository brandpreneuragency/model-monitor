"use client";

import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { cn } from "./cn";
import { fastTransition, fontMeta } from "./styles";

export interface ToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
  showLabel?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  showLabel = true,
  className,
  style,
  disabled,
  ...rest
}: ToggleProps) {
  const track: CSSProperties = {
    width: "36px",
    height: "20px",
    borderRadius: "var(--radius-full)",
    background: checked ? "var(--accent)" : "var(--bg-input)",
    border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
    position: "relative",
    transition: fastTransition,
    flexShrink: 0,
    boxShadow: "none",
  };

  const thumb: CSSProperties = {
    position: "absolute",
    top: "2px",
    left: checked ? "18px" : "2px",
    width: "14px",
    height: "14px",
    borderRadius: "var(--radius-full)",
    background: "var(--text)",
    boxShadow: "none",
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cn("mm-toggle", className)}
      onClick={() => onChange?.(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      {...rest}
    >
      <span style={track} data-checked={checked || undefined}>
        <span style={thumb} />
      </span>
      {showLabel ? (
        <span style={{ ...fontMeta, color: "var(--text)" }}>{label}</span>
      ) : null}
    </button>
  );
}
