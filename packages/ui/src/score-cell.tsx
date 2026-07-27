import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "./cn";
import { fontMeta } from "./styles";

export type ScoreScale = "ten" | "hundred" | "auto";

export type ScoreBand =
  | "exceptional"
  | "strong"
  | "average"
  | "below"
  | "weak"
  | "empty";

export interface ScoreCellProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * Numeric score. `null` / `undefined` means untested — never rendered as 0.
   * Accepts 0–10 or 0–100 depending on `scale`.
   */
  value: number | null | undefined;
  /** Scale interpretation. `auto` treats values > 10 as 0–100. */
  scale?: ScoreScale;
  /** Accessible name context, e.g. "Personal overall". */
  label?: string;
}

function normalizeToTen(
  value: number,
  scale: ScoreScale,
): { ten: number; display: string } {
  const isHundred =
    scale === "hundred" || (scale === "auto" && value > 10);
  if (isHundred) {
    const clamped = Math.max(0, Math.min(100, value));
    return {
      ten: clamped / 10,
      display: Number.isInteger(clamped)
        ? String(clamped)
        : clamped.toFixed(1),
    };
  }
  const clamped = Math.max(0, Math.min(10, value));
  const display = Number.isInteger(clamped)
    ? String(clamped)
    : String(Math.round(clamped * 10) / 10);
  return { ten: clamped, display };
}

export function scoreBandFromTen(ten: number): Exclude<ScoreBand, "empty"> {
  if (ten >= 9) return "exceptional";
  if (ten >= 7) return "strong";
  if (ten >= 5) return "average";
  if (ten >= 3) return "below";
  return "weak";
}

/**
 * Score box for tables/heatmaps.
 * Null is visibly distinct from zero (untested empty state with em dash).
 */
export function ScoreCell({
  value,
  scale = "auto",
  label,
  className,
  style,
  ...rest
}: ScoreCellProps) {
  const isUntested = value === null || value === undefined;

  let band: ScoreBand = "empty";
  let text = "—";
  let aria = label ? `${label}: untested` : "untested";

  if (!isUntested) {
    const { ten, display } = normalizeToTen(value, scale);
    band = scoreBandFromTen(ten);
    text = display;
    aria = label ? `${label}: ${display}` : display;
  }

  const color = `var(--score-${band})`;
  const bg = `var(--score-${band}-bg)`;

  const base: CSSProperties = {
    ...fontMeta,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "32px",
    height: "24px",
    padding: "0 var(--space-1_5)",
    borderRadius: "var(--radius-md)",
    border: `1px solid ${bg}`,
    background: bg,
    color,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    boxShadow: "none",
    ...style,
  };

  return (
    <span
      className={cn("mm-score-cell", className)}
      style={base}
      data-band={band}
      data-untested={isUntested || undefined}
      data-testid="score-cell"
      aria-label={aria}
      title={isUntested ? "Untested" : aria}
      {...rest}
    >
      {text}
    </span>
  );
}
