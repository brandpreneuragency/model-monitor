"use client";

import type { CSSProperties, InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { fontMeta } from "./styles";

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "type"> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  label: string;
  showValue?: boolean;
}

/** Profile-weight slider. Label is required (colour/position never sole signal). */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  showValue = true,
  className,
  style,
  disabled,
  id,
  ...rest
}: SliderProps) {
  const wrap: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-1)",
    width: "100%",
    ...style,
  };

  return (
    <div className={cn("mm-slider", className)} style={wrap}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "var(--space-2)",
        }}
      >
        <label
          htmlFor={id}
          style={{ ...fontMeta, color: "var(--text-muted)", margin: 0 }}
        >
          {label}
        </label>
        {showValue ? (
          <span
            style={{
              ...fontMeta,
              color: "var(--text)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
        ) : null}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: "var(--accent)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
        }}
        {...rest}
      />
    </div>
  );
}
