"use client";

import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";
import { fastTransition, fontMeta } from "./styles";

export interface SegmentedControlOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the radiogroup. */
  label: string;
  size?: "sm" | "md";
}

/** View mode / density segmented control. Every option has a text label. */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className,
  style,
  ...rest
}: SegmentedControlProps<T>) {
  const wrap: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-0_5)",
    padding: "var(--space-0_5)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    boxShadow: "none",
    ...style,
  };

  const height = size === "sm" ? "26px" : "30px";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("mm-segmented", className)}
      style={wrap}
      data-value={value}
      {...rest}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        const btn: CSSProperties = {
          ...fontMeta,
          height,
          padding: "0 var(--space-2)",
          borderRadius: "var(--radius-sm)",
          border: selected
            ? "1px solid var(--border-strong)"
            : "1px solid transparent",
          background: selected ? "var(--bg-card)" : "transparent",
          color: selected ? "var(--text)" : "var(--text-muted)",
          fontWeight: selected ? 600 : 400,
          cursor: "pointer",
          transition: fastTransition,
          boxShadow: "none",
          appearance: "none",
        };
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            style={btn}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
