"use client";

import Link from "next/link";
import { Button } from "@model-monitor/ui";
import { AccessOverview } from "./access-overview";
import { OverviewScatter } from "./overview-scatter";
import { ProviderDistribution } from "./provider-distribution";
import { QuotaSummary } from "./quota-summary";
import { RecentUpdated } from "./recent-updated";
import { SkillLeaders } from "./skill-leaders";
import { SummaryCards } from "./summary-cards";
import type { OverviewInitialData } from "./types";

export type OverviewPageClientProps = {
  initial: OverviewInitialData;
  fetchImpl?: typeof fetch;
};

export function OverviewPageClient({
  initial,
  fetchImpl = fetch,
}: OverviewPageClientProps) {
  return (
    <div data-testid="overview-page" style={{ width: "100%", minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "var(--space-4)",
          gap: "var(--space-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--text-page-size)",
              fontWeight: "var(--text-page-weight)" as unknown as number,
              lineHeight: "var(--text-page-line)",
              color: "var(--text)",
            }}
          >
            Overview
          </h1>
          <p
            style={{
              margin: "var(--space-1) 0 0",
              color: "var(--text-muted)",
              fontSize: "var(--text-meta-size)",
            }}
          >
            Your AI model directory at a glance
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <Link href="/models" style={{ textDecoration: "none" }}>
            <Button type="button" variant="ghost" size="sm">
              + Add Model
            </Button>
          </Link>
          <Link href="/providers" style={{ textDecoration: "none" }}>
            <Button type="button" variant="ghost" size="sm">
              + Add Provider
            </Button>
          </Link>
        </div>
      </div>

      <div
        data-testid="overview-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) var(--rail-width, 300px)",
          gap: "var(--space-4)",
          alignItems: "start",
        }}
      >
        <div
          data-testid="overview-main"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
            minWidth: 0,
          }}
        >
          <SummaryCards summary={initial.summary} />

          <div
            data-testid="overview-band-access-skills"
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 1fr",
              gap: "var(--space-3)",
              minWidth: 0,
            }}
          >
            <AccessOverview cards={initial.access} />
            <SkillLeaders categories={initial.skillLeaders} />
          </div>

          <div
            data-testid="overview-charts-row"
            style={{
              display: "grid",
              gridTemplateColumns: "0.9fr 1.2fr 0.9fr",
              gap: "var(--space-3)",
              minWidth: 0,
            }}
          >
            <ProviderDistribution items={initial.providerDistribution} />
            <OverviewScatter
              initialPoints={initial.scatterPoints ?? []}
              initialX={initial.scatterX ?? "cost"}
              initialY={initial.scatterY ?? "capability"}
              fetchImpl={fetchImpl}
            />
            <RecentUpdated items={initial.recent} />
          </div>
        </div>

        <aside
          data-testid="overview-rail"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
            position: "sticky",
            top: "calc(var(--topbar-height, 56px) + var(--space-4))",
            minWidth: 0,
          }}
        >
          <QuotaSummary items={initial.quotas} />
        </aside>
      </div>
    </div>
  );
}
