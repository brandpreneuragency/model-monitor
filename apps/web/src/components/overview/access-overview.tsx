"use client";

import { useRouter } from "next/navigation";
import { Card, EmptyState, StatusChip } from "@model-monitor/ui";
import type { OverviewAccessCard } from "./types";
import { formatMonthly, initials, periodLabel } from "./utils";

export type AccessOverviewProps = {
  cards: OverviewAccessCard[];
};

export function AccessOverview({ cards }: AccessOverviewProps) {
  const router = useRouter();

  return (
    <Card data-testid="overview-access" padding="md" style={{ minWidth: 0 }}>
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
            fontWeight: "var(--text-section-weight)" as unknown as number,
            color: "var(--text)",
          }}
        >
          My Access Overview
        </h2>
      </div>

      {cards.length === 0 ? (
        <EmptyState
          data-testid="overview-access-empty"
          title="No access plans"
          message="Plans with active model access will appear here."
          style={{ padding: "var(--space-6) var(--space-4)" }}
        />
      ) : (
        <div
          data-testid="overview-access-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "var(--space-2)",
          }}
        >
          {cards.map((card) => {
            const quotaLine = card.mainQuota
              ? card.mainQuota.isUnlimited
                ? "Unlimited"
                : periodLabel(card.mainQuota.period)
              : periodLabel(null);
            return (
              <button
                key={card.planId}
                type="button"
                data-testid="overview-access-card"
                data-plan-id={card.planId}
                data-plan-slug={card.planSlug}
                data-provider-slug={card.provider.slug}
                onClick={() => {
                  router.push(
                    `/providers?tab=plans&plan=${encodeURIComponent(card.planSlug)}`,
                  );
                }}
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-lg)",
                  padding: "var(--space-3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-1)",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "inherit",
                  fontFamily: "inherit",
                  fontSize: "inherit",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
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
                    {initials(card.provider.name)}
                  </span>
                  <span
                    style={{
                      fontSize: "var(--text-card-size)",
                      fontWeight: 600,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={card.planName}
                  >
                    {card.planName}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "var(--text-meta-size)",
                    color: "var(--text-muted)",
                  }}
                  data-testid="access-card-models"
                >
                  {card.availableModels} model
                  {card.availableModels === 1 ? "" : "s"}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-meta-size)",
                    color: "var(--text-muted)",
                  }}
                  data-testid="access-card-cost"
                >
                  {formatMonthly(card.monthlyCost, card.currency)}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-meta-size)",
                    color: "var(--text-muted)",
                  }}
                  data-testid="access-card-quota"
                >
                  {quotaLine}
                </div>
                <span style={{ alignSelf: "flex-start", marginTop: "var(--space-1)" }}>
                  <StatusChip
                    color={card.status === "active" ? "ok" : "neutral"}
                    label={card.status === "active" ? "Active" : card.status}
                  />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
