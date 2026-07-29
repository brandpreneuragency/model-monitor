"use client";

import Link from "next/link";
import { Card, EmptyState } from "@model-monitor/ui";
import type { OverviewProviderDistributionItem } from "./types";

const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-4)",
  "var(--ok)",
  "var(--fast)",
  "var(--danger)",
  "var(--neutral)",
] as const;

export type ProviderDistributionProps = {
  items: OverviewProviderDistributionItem[];
};

export function ProviderDistribution({ items }: ProviderDistributionProps) {
  const max = items.reduce((m, i) => Math.max(m, i.modelCount), 0);

  return (
    <Card data-testid="overview-provider-distribution" padding="md" style={{ minWidth: 0 }}>
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
          Models by Provider
        </h2>
        <Link
          href="/providers"
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
            textDecoration: "none",
          }}
        >
          View all
        </Link>
      </div>

      {items.length === 0 || max === 0 ? (
        <EmptyState
          data-testid="overview-provider-distribution-empty"
          title="No distribution data"
          message="Access routes will populate provider bars."
          style={{ padding: "var(--space-4)" }}
        />
      ) : (
        <div data-testid="provider-distribution-bars">
          {items.map((item, idx) => {
            const pct = max > 0 ? (item.modelCount / max) * 100 : 0;
            const color = BAR_COLORS[idx % BAR_COLORS.length];
            return (
              <div
                key={item.providerId}
                data-testid="provider-bar-row"
                data-provider-slug={item.providerSlug}
                data-count={item.modelCount}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr 28px",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginBottom: "var(--space-2)",
                  fontSize: "var(--text-meta-size)",
                }}
              >
                <span
                  style={{
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.providerName}
                >
                  {item.providerName}
                </span>
                <div
                  style={{
                    height: 8,
                    background: "var(--bg-input)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${pct}%`,
                      borderRadius: "var(--radius-full)",
                      background: color,
                    }}
                    data-testid="provider-bar-fill"
                  />
                </div>
                <span
                  data-testid="provider-bar-count"
                  style={{
                    textAlign: "right",
                    color: "var(--text-muted)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {item.modelCount}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
