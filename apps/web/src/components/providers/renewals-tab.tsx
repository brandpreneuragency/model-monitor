"use client";

import type { CSSProperties } from "react";
import { Card, EmptyState, StatusChip } from "@model-monitor/ui";
import type { RenewalDto, RenewalKind } from "./types";
import {
  formatDate,
  formatMoney,
  initials,
  relativeDays,
  renewalKindLabel,
  sortRenewals,
} from "./utils";

export interface RenewalsTabProps {
  renewals: RenewalDto[];
}

const KIND_COLOR: Record<RenewalKind, "info" | "ok" | "warn" | "advanced" | "neutral"> = {
  subscription_renewal: "info",
  trial_expiration: "warn",
  promotional_price_expiration: "advanced",
  manual_review: "neutral",
};

/**
 * Upcoming renewals — informational only (no actions / side effects).
 * Sorted by date across all four kinds.
 */
export function RenewalsTab({ renewals }: RenewalsTabProps) {
  const sorted = sortRenewals(renewals);

  return (
    <div data-testid="renewals-tab">
      <Card padding="md">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "var(--space-3)",
            gap: "var(--space-2)",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "var(--text-section-size)", fontWeight: 600 }}>
            Upcoming renewals & dates
          </h2>
          <span style={{ fontSize: "var(--text-meta-size)", color: "var(--text-muted)" }}>
            {sorted.length} item{sorted.length === 1 ? "" : "s"} · informational only
          </span>
        </div>

        {sorted.length === 0 ? (
          <EmptyState
            title="No upcoming dates"
            message="No subscription renewals, trial ends, promo expirations, or manual reviews are scheduled."
          />
        ) : (
          <ul
            style={{ listStyle: "none", margin: 0, padding: 0 }}
            data-testid="renewals-list"
          >
            {sorted.map((item) => (
              <li
                key={`${item.kind}-${item.entityId}-${item.date}`}
                data-testid="renewal-row"
                data-kind={item.kind}
                data-date={item.date}
                style={rowStyle}
              >
                <span
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "var(--radius-md)",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {initials(item.provider?.name ?? item.subtitle ?? item.title)}
                </span>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    {item.subtitle ?? item.provider?.name ?? item.entityType}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <StatusChip
                      color={KIND_COLOR[item.kind]}
                      label={renewalKindLabel(item.kind)}
                    />
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {item.amount != null ? (
                    <div style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(item.amount, item.currency)}
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-faint)", fontSize: "var(--text-meta-size)" }}>
                      —
                    </div>
                  )}
                  <div style={{ fontSize: "var(--text-meta-size)", color: "var(--text-muted)" }}>
                    {formatDate(item.date)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    {relativeDays(item.date) ?? ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p
          style={{
            margin: "var(--space-3) 0 0",
            fontSize: 11,
            color: "var(--text-faint)",
          }}
        >
          All times shown in your local timezone. v1 is informational only — no reminders or
          actions.
        </p>
      </Card>
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px 1fr auto",
  gap: "var(--space-3)",
  padding: "var(--space-3) 0",
  borderBottom: "1px solid var(--border-subtle)",
  fontSize: "var(--text-meta-size)",
  alignItems: "start",
};
