export type RankingType = "personal" | "external" | "combined";

export type Confidence = "low" | "medium" | "high";

export type SkillDto = {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  status: "active" | "archived";
};

export type ProfileWeightDto = {
  id: string;
  skillId: string;
  weight: number;
  skill: { id: string; name: string; slug: string };
};

export type ProfileDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isDefault: boolean;
  sortOrder: number;
  weights: ProfileWeightDto[];
};

export type LeaderboardEntryDto = {
  rank: number;
  model: {
    id: string;
    name: string;
    slug: string;
    creator: { id: string; name: string; slug: string } | null;
  };
  personalScore: number | null;
  externalScore: number | null;
  overallScore: number | null;
  scoreBasis: "personal" | "external" | "mixed" | null;
  personalConfidence: Confidence | null;
  externalRank: number | null;
  externalConfidence: number | null;
  rankOverride: number | null;
  pinned: boolean;
  tested: boolean;
  testedAt: string | null;
  notes: string | null;
  skillId: string | null;
  profileId: string | null;
};

export type ModelEnrichment = {
  id: string;
  name: string;
  bestUse: string | null;
  costOrQuota: string | null;
  creatorName: string | null;
  accessProviderName: string | null;
  planName: string | null;
};

export type RatingCell = {
  modelId: string;
  skillId: string;
  personalScore: number | null;
  externalScore: number | null;
  personalConfidence: Confidence | null;
  notes: string | null;
  tested: boolean;
  testedAt: string | null;
  rankOverride: number | null;
  pinned: boolean;
  hidden: boolean;
};

export type RankingsInitialData = {
  skills: SkillDto[];
  profiles: ProfileDto[];
  leaderboard: LeaderboardEntryDto[];
  leaderboardType: RankingType;
  skillId: string | null;
  profileId: string | null;
  models: ModelEnrichment[];
  ratings: RatingCell[];
};
