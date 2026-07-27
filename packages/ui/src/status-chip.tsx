import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";
import { fontMeta } from "./styles";
import type { SemanticColor } from "./types";
import { semanticVars } from "./types";

export interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  /** Semantic colour token. */
  color: SemanticColor;
  /** Always-required visible text label. */
  label: string;
}

/**
 * Soft semantic chip. Colour is never the only signal — `label` is required.
 */
export function StatusChip({
  color,
  label,
  className,
  style,
  ...rest
}: StatusChipProps) {
  const { color: fg, bg } = semanticVars(color);
  const base: CSSProperties = {
    ...fontMeta,
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    padding: "2px var(--space-2)",
    borderRadius: "var(--radius-md)",
    background: bg,
    color: fg,
    border: `1px solid ${bg}`,
    fontWeight: 500,
    whiteSpace: "nowrap",
    ...style,
  };

  return (
    <span
      className={cn("mm-status-chip", className)}
      style={base}
      data-color={color}
      data-testid="status-chip"
      {...rest}
    >
      {label}
    </span>
  );
}
