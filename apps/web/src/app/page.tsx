import {
  getOverviewAccess,
  getOverviewProviderDistribution,
  getOverviewQuotas,
  getOverviewRecent,
  getOverviewScatter,
  getOverviewSkillLeaders,
  getOverviewSummary,
} from "@model-monitor/database";
import { db } from "@/lib/db";
import { OverviewPageClient } from "@/components/overview/overview-page";
import type { OverviewInitialData } from "@/components/overview/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const initial: OverviewInitialData = {
    summary: null,
    access: [],
    skillLeaders: [],
    providerDistribution: [],
    quotas: [],
    recent: [],
    scatterPoints: [],
    scatterX: "cost",
    scatterY: "capability",
  };

  try {
    const [
      summary,
      access,
      skillLeaders,
      providerDistribution,
      quotas,
      recent,
      scatter,
    ] = await Promise.all([
      getOverviewSummary(db),
      getOverviewAccess(db),
      getOverviewSkillLeaders(db),
      getOverviewProviderDistribution(db),
      getOverviewQuotas(db),
      getOverviewRecent(db, { limit: 12 }),
      getOverviewScatter(db, { x: "cost", y: "capability" }),
    ]);

    initial.summary = summary;
    initial.access = access;
    initial.skillLeaders = skillLeaders;
    initial.providerDistribution = providerDistribution;
    initial.quotas = quotas;
    initial.recent = recent;
    initial.scatterPoints = scatter.points;
    initial.scatterX = scatter.x;
    initial.scatterY = scatter.y;
  } catch {
    // Empty shell if DB unavailable in this process — client still mounts sections.
  }

  return <OverviewPageClient initial={initial} />;
}
