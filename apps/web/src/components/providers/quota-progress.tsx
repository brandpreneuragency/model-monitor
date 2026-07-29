"use client";

import type { CSSProperties } from "react";
import { ProgressBar } from "@model-monitor/ui";
import type { QuotaDto } from "./types";
import { NOT_RECORDED, quotaMax, unitLabel } from "./utils";

export interface QuotaProgressProps {
  quota: Pick<
    QuotaDto,
    | "name"
    | "amount"
    | "amountMin"
    | "amountMax"
    | "remainingAmount"
    | "isUnlimited"
    | "unit"
    | "customUnit"
  >;
  /** Compact single-line mini bar (plans table). */
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Quota progress using ProgressBar.
 * - unlimited → no percentage
 * - null remaining → "not recorded" (no fabricated bar)
 */
export function QuotaProgress({
  quota,
  compact = false,
  className,
  style,
}: QuotaProgressProps) {
  const label = quota.name || unitLabel(quota.unit, quota.customUnit);
  const max = quotaMax(quota);

  if (quota.isUnlimited) {
    return (
      <div
        className={className}
        style={style}
        data-testid="quota-progress"
        data-state="unlimited"
      >
        <ProgressBar label={label} unlimited color="ok" showValues={!compact} />
      </div>
    );
  }

  if (quota.remainingAmount == null) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
          width: "100%",
          ...style,
        }}
        data-testid="quota-progress"
        data-state="unknown"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "var(--space-2)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>{label}</span>
          <span
            style={{ color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}
            data-testid="quota-progress-value"
          >
            {NOT_RECORDED}
          </span>
        </div>
        {/* Track only — no fill (unknown remaining must not fabricate a bar) */}
        <div
          role="progressbar"
          aria-label={label}
          aria-valuetext={NOT_RECORDED}
          style={{
            height: compact ? "4px" : "6px",
            width: "100%",
            borderRadius: "var(--radius-full)",
            background: "var(--bg-input)",
            overflow: "hidden",
          }}
          data-testid="quota-progress-track-empty"
        />
      </div>
    );
  }

  if (max == null || max <= 0) {
    return (
      <div
        className={className}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
          width: "100%",
          ...style,
        }}
        data-testid="quota-progress"
        data-state="no-max"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "var(--text-meta-size)",
          }}
        >
          <span style={{ color: "var(--text-muted)" }}>{label}</span>
          <span style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {quota.remainingAmount} remaining
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={style}
      data-testid="quota-progress"
      data-state="finite"
    >
      <ProgressBar
        label={label}
        value={quota.remainingAmount}
        max={max}
        color="info"
        showValues
      />
    </div>
  );
}
