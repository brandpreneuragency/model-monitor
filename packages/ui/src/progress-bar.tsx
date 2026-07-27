import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";
import { fontMeta } from "./styles";
import type { SemanticColor } from "./types";
import { semanticVars } from "./types";

export interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Current usage. Ignored when `unlimited` is true. */
  value?: number | null;
  /** Maximum. Ignored when `unlimited` is true. */
  max?: number | null;
  /** When true, renders ∞ and no percentage. */
  unlimited?: boolean;
  /** Always-visible label (quota name, etc.). */
  label: string;
  /** Fill colour semantic. */
  color?: SemanticColor;
  showValues?: boolean;
}

/**
 * Quota / progress track. Unlimited must never show a percentage.
 */
export function ProgressBar({
  value = 0,
  max = 100,
  unlimited = false,
  label,
  color = "info",
  showValues = true,
  className,
  style,
  ...rest
}: ProgressBarProps) {
  const safeMax = max && max > 0 ? max : 0;
  const safeValue = typeof value === "number" && !Number.isNaN(value) ? value : 0;
  const pct =
    !unlimited && safeMax > 0
      ? Math.max(0, Math.min(100, (safeValue / safeMax) * 100))
      : 0;
  const { color: fg } = semanticVars(color);

  const valueText = unlimited
    ? "∞"
    : showValues
      ? `${safeValue} / ${safeMax}`
      : `${Math.round(pct)}%`;

  const wrap: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-1)",
    width: "100%",
    ...style,
  };

  const track: CSSProperties = {
    height: "6px",
    width: "100%",
    borderRadius: "var(--radius-full)",
    background: "var(--bg-input)",
    overflow: "hidden",
    boxShadow: "none",
  };

  const fill: CSSProperties = {
    height: "100%",
    width: unlimited ? "100%" : `${pct}%`,
    background: unlimited ? "var(--ok)" : fg,
    borderRadius: "var(--radius-full)",
    opacity: unlimited ? 0.35 : 1,
    boxShadow: "none",
  };

  return (
    <div
      className={cn("mm-progress-bar", className)}
      style={wrap}
      data-unlimited={unlimited || undefined}
      data-testid="progress-bar"
      {...rest}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: "var(--space-2)",
        }}
      >
        <span style={{ ...fontMeta, color: "var(--text-muted)" }}>{label}</span>
        <span
          style={{
            ...fontMeta,
            color: "var(--text)",
            fontVariantNumeric: "tabular-nums",
          }}
          data-testid="progress-bar-value"
        >
          {valueText}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuetext={unlimited ? "Unlimited" : valueText}
        aria-valuenow={unlimited ? undefined : safeValue}
        aria-valuemin={unlimited ? undefined : 0}
        aria-valuemax={unlimited ? undefined : safeMax}
        style={track}
      >
        <div style={fill} />
      </div>
    </div>
  );
}
