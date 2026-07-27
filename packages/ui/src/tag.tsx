"use client";

import type { CSSProperties, HTMLAttributes, MouseEventHandler } from "react";
import { cn } from "./cn";
import { fontMeta } from "./styles";
import type { SemanticColor } from "./types";
import { semanticVars } from "./types";

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  name: string;
  color?: SemanticColor;
  onRemove?: () => void;
}

export function Tag({
  name,
  color = "neutral",
  onRemove,
  className,
  style,
  ...rest
}: TagProps) {
  const { color: fg, bg } = semanticVars(color);
  const base: CSSProperties = {
    ...fontMeta,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    padding: "2px var(--space-2)",
    borderRadius: "var(--radius-md)",
    background: bg,
    color: color === "neutral" ? "var(--text-muted)" : fg,
    border: `1px solid ${bg}`,
    whiteSpace: "nowrap",
    ...style,
  };

  const handleRemove: MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    onRemove?.();
  };

  return (
    <span
      className={cn("mm-tag", className)}
      style={base}
      data-color={color}
      {...rest}
    >
      <span>{name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={handleRemove}
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
      ) : null}
    </span>
  );
}
