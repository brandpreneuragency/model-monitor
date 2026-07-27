"use client";

import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";
import { fontMeta } from "./styles";

export interface FilterChipProps extends HTMLAttributes<HTMLSpanElement> {
  label: string;
  value: string;
  onRemove: () => void;
}

export function FilterChip({
  label,
  value,
  onRemove,
  className,
  style,
  ...rest
}: FilterChipProps) {
  const base: CSSProperties = {
    ...fontMeta,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    padding: "2px var(--space-2)",
    borderRadius: "var(--radius-md)",
    background: "var(--accent-bg)",
    color: "var(--accent)",
    border: "1px solid var(--accent-border)",
    whiteSpace: "nowrap",
    ...style,
  };

  return (
    <span
      className={cn("mm-filter-chip", className)}
      style={base}
      data-label={label}
      data-value={value}
      {...rest}
    >
      <span>
        {label}: {value}
      </span>
      <button
        type="button"
        aria-label={`Remove filter ${label} ${value}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          appearance: "none",
          border: "none",
          background: "transparent",
          color: "inherit",
          cursor: "pointer",
          padding: 0,
          lineHeight: 1,
          fontSize: "var(--text-meta-size)",
        }}
      >
        ×
      </button>
    </span>
  );
}
