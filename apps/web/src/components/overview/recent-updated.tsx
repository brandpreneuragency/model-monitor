"use client";

import Link from "next/link";
import { Card, EmptyState } from "@model-monitor/ui";
import type { OverviewRecentItem } from "./types";
import { entityTypeLabel, formatRecentWhen, initials } from "./utils";

export type RecentUpdatedProps = {
  items: OverviewRecentItem[];
};

export function RecentUpdated({ items }: RecentUpdatedProps) {
  return (
    <Card data-testid="overview-recent" padding="md" style={{ minWidth: 0 }}>
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
          Recently Updated
        </h2>
        <Link
          href="/models"
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
          data-testid="overview-recent-empty"
          title="No recent activity"
          message="Edits to models, plans, quotas, and ratings will show up here."
          style={{ padding: "var(--space-4)" }}
        />
      ) : (
        <div
          data-testid="overview-recent-list"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          {items.map((item) => {
            const subtitle = item.subtitle?.trim() || entityTypeLabel(item.entityType);
            return (
              <div
                key={`${item.entityType}-${item.entityId}-${item.updatedAt}`}
                data-testid="overview-recent-row"
                data-entity-type={item.entityType}
                style={{
                  display: "grid",
                  gridTemplateColumns: "22px 1fr auto",
                  gap: "var(--space-2)",
                  alignItems: "start",
                  fontSize: "var(--text-meta-size)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "var(--radius-sm)",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    color: "var(--text-muted)",
                  }}
                >
                  {initials(item.title)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      color: "var(--text)",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={item.title}
                  >
                    {item.title}
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>{subtitle}</div>
                </div>
                <span
                  style={{
                    color: "var(--text-faint)",
                    whiteSpace: "nowrap",
                  }}
                  data-testid="recent-when"
                >
                  {formatRecentWhen(item.updatedAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
