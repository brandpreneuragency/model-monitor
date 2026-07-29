"use client";

import Link from "next/link";
import { Card, EmptyState, ProgressBar } from "@model-monitor/ui";
import type { OverviewQuotaItem } from "./types";
import {
  formatCompactNumber,
  formatResetLine,
  initials,
  unitLabel,
} from "./utils";

export type QuotaSummaryProps = {
  items: OverviewQuotaItem[];
};

function pickPrimaryQuota(item: OverviewQuotaItem) {
  return item.quotas[0] ?? null;
}

export function QuotaSummary({ items }: QuotaSummaryProps) {
  return (
    <Card data-testid="overview-quota-summary" padding="md" style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-3)",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: "var(--text-section-size)",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          Quota Summary
        </h2>
        <Link
          href="/providers?tab=quotas"
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
            textDecoration: "none",
          }}
        >
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          data-testid="overview-quota-summary-empty"
          title="No quotas"
          message="Plan quotas will show remaining balance and reset timing here."
          style={{ padding: "var(--space-4)" }}
        />
      ) : (
        <div data-testid="overview-quota-list">
          {items.map((item) => {
            const q = pickPrimaryQuota(item);
            if (!q) {
              return (
                <div
                  key={item.planId}
                  data-testid="overview-quota-row"
                  data-plan-slug={item.planSlug}
                  style={{ marginBottom: "var(--space-4)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                      marginBottom: "var(--space-1_5)",
                    }}
                  >
                    <Logo name={item.provider.name} />
                    <span
                      style={{
                        fontSize: "var(--text-card-size)",
                        fontWeight: 600,
                        flex: 1,
                        color: "var(--text)",
                      }}
                    >
                      {item.planName}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-faint)",
                    }}
                  >
                    No quota rows
                  </div>
                </div>
              );
            }

            const unit = unitLabel(q.unit, q.customUnit);
            const max = q.amount ?? q.amountMax ?? q.amountMin;
            const remaining = q.remainingAmount;

            let valueLine: string;
            if (q.isUnlimited) {
              valueLine = "Unlimited ∞";
            } else if (remaining == null || max == null) {
              valueLine = "not recorded";
            } else {
              valueLine = `${formatCompactNumber(remaining)} / ${formatCompactNumber(max)} ${unit}`;
            }

            const resetLine = formatResetLine({
              resetsAt: q.resetsAt,
              resetBehaviour: q.resetBehaviour,
              period: q.period,
              isUnlimited: q.isUnlimited,
            });

            const usedOrRemaining =
              !q.isUnlimited && remaining != null && max != null && max > 0
                ? remaining
                : null;

            return (
              <div
                key={`${item.planId}-${q.id}`}
                data-testid="overview-quota-row"
                data-plan-slug={item.planSlug}
                data-unlimited={q.isUnlimited || undefined}
                style={{ marginBottom: "var(--space-4)" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    marginBottom: "var(--space-1_5)",
                  }}
                >
                  <Logo name={item.provider.name} />
                  <span
                    style={{
                      fontSize: "var(--text-card-size)",
                      fontWeight: 600,
                      flex: 1,
                      color: "var(--text)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={item.planName}
                  >
                    {item.planName}
                  </span>
                  <span
                    data-testid="quota-row-values"
                    style={{
                      fontSize: "var(--text-meta-size)",
                      color: "var(--text-muted)",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {valueLine}
                  </span>
                </div>
                <div
                  data-testid="quota-row-reset"
                  style={{
                    fontSize: 11,
                    color: "var(--text-faint)",
                    marginBottom: "var(--space-1_5)",
                  }}
                >
                  {resetLine}
                </div>
                {q.isUnlimited ? (
                  <ProgressBar
                    label={q.name}
                    unlimited
                    color="advanced"
                    showValues={false}
                  />
                ) : remaining == null || max == null || max <= 0 ? (
                  <div
                    role="progressbar"
                    aria-label={q.name}
                    aria-valuetext="not recorded"
                    data-testid="quota-row-track-empty"
                    style={{
                      height: 6,
                      width: "100%",
                      borderRadius: "var(--radius-full)",
                      background: "var(--bg-input)",
                    }}
                  />
                ) : (
                  <ProgressBar
                    label={q.name}
                    value={usedOrRemaining}
                    max={max}
                    color={
                      usedOrRemaining != null && usedOrRemaining / max < 0.25
                        ? "warn"
                        : "info"
                    }
                    showValues={false}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Logo({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 18,
        height: 18,
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        display: "grid",
        placeItems: "center",
        fontSize: 9,
        fontWeight: 700,
        color: "var(--text-muted)",
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}
