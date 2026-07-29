import {
  getLeaderboard,
  listModels,
  listRankingProfiles,
  listRatings,
  listSkills,
} from "@model-monitor/database";
import { db } from "@/lib/db";
import { RankingsPageClient } from "@/components/rankings/rankings-page";
import type {
  LeaderboardEntryDto,
  ModelEnrichment,
  ProfileDto,
  RankingType,
  RatingCell,
  SkillDto,
} from "@/components/rankings/types";

export const dynamic = "force-dynamic";

function asSkill(s: {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  description: string | null;
  sortOrder: number;
  isDefault: boolean;
  status: "active" | "archived";
}): SkillDto {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    category: s.category,
    description: s.description,
    sortOrder: s.sortOrder,
    isDefault: s.isDefault,
    status: s.status,
  };
}

export default async function RankingsPage() {
  let skills: SkillDto[] = [];
  let profiles: ProfileDto[] = [];
  let leaderboard: LeaderboardEntryDto[] = [];
  let leaderboardType: RankingType = "combined";
  let skillId: string | null = null;
  let profileId: string | null = null;
  let models: ModelEnrichment[] = [];
  let ratings: RatingCell[] = [];

  try {
    const [skillRows, profileRows] = await Promise.all([
      listSkills(db, {}),
      listRankingProfiles(db),
    ]);
    skills = skillRows.filter((s) => s.status === "active").map(asSkill);
    profiles = profileRows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      isDefault: p.isDefault,
      sortOrder: p.sortOrder,
      weights: p.weights.map((w) => ({
        id: w.id,
        skillId: w.skillId,
        weight: w.weight,
        skill: w.skill,
      })),
    }));

    const coding =
      skills.find((s) => s.slug === "coding" || s.name.toLowerCase() === "coding") ??
      skills[0] ??
      null;
    const defaultProfile =
      profiles.find((p) => p.isDefault) ?? profiles[0] ?? null;

    skillId = coding?.id ?? null;
    profileId = defaultProfile?.id ?? null;
    leaderboardType = "combined";

    const board = await getLeaderboard(db, {
      skillId: skillId ?? undefined,
      profileId: profileId ?? undefined,
      type: leaderboardType,
    });
    leaderboard = board.data;

    const modelResult = await listModels(db, { page: 1, limit: 100, sort: "name" });
    models = (modelResult.data ?? []).map((m) => {
      const row = m as {
        id: string;
        name: string;
        bestUse?: string | null;
        costOrQuota?: string | null;
        creator?: { name?: string | null } | null;
        developerName?: string | null;
        preferredAccess?: {
          providerName?: string | null;
          planName?: string | null;
        } | null;
        preferredAccessProvider?: { name?: string | null } | null;
        preferredPlan?: { name?: string | null } | null;
      };
      return {
        id: row.id,
        name: row.name,
        bestUse: row.bestUse ?? null,
        costOrQuota: row.costOrQuota ?? null,
        creatorName: row.creator?.name ?? row.developerName ?? null,
        accessProviderName:
          row.preferredAccess?.providerName ??
          row.preferredAccessProvider?.name ??
          null,
        planName:
          row.preferredAccess?.planName ?? row.preferredPlan?.name ?? null,
      };
    });

    const ratingRows = await listRatings(db, {});
    ratings = ratingRows.map((r) => ({
      modelId: r.modelId,
      skillId: r.skillId,
      personalScore: r.personalScore,
      externalScore: r.externalScore,
      personalConfidence: r.personalConfidence,
      notes: r.notes,
      tested: r.tested,
      testedAt: r.testedAt,
      rankOverride: r.rankOverride,
      pinned: r.pinned,
      hidden: r.hidden,
    }));
  } catch {
    // Client can still fetch via API when SSR fails (auth/db).
  }

  return (
    <RankingsPageClient
      initial={{
        skills,
        profiles,
        leaderboard,
        leaderboardType,
        skillId,
        profileId,
        models,
        ratings,
      }}
    />
  );
}
