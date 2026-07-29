import type {
  OverviewAccessCard,
  OverviewProviderDistributionItem,
  OverviewQuotaItem,
  OverviewRecentItem,
  OverviewScatterPoint,
  OverviewSkillCategory,
  OverviewSummary,
} from "@model-monitor/schemas";

export type {
  OverviewAccessCard,
  OverviewProviderDistributionItem,
  OverviewQuotaItem,
  OverviewRecentItem,
  OverviewScatterPoint,
  OverviewSkillCategory,
  OverviewSummary,
};

export type OverviewInitialData = {
  summary: OverviewSummary | null;
  access: OverviewAccessCard[];
  skillLeaders: OverviewSkillCategory[];
  providerDistribution: OverviewProviderDistributionItem[];
  quotas: OverviewQuotaItem[];
  recent: OverviewRecentItem[];
  /** Optional initial scatter points (default axes). */
  scatterPoints?: OverviewScatterPoint[];
  scatterX?: string;
  scatterY?: string;
};
