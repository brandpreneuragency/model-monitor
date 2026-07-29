"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@model-monitor/ui";
import { LeaderboardTable } from "./leaderboard-table";
import { ProfilesPanel } from "./profiles-panel";
import { ScoreMatrix } from "./score-matrix";
import type {
  LeaderboardEntryDto,
  ModelEnrichment,
  ProfileDto,
  RankingType,
  RankingsInitialData,
  RatingCell,
  SkillDto,
} from "./types";
import { readApiError } from "./utils";

type LeaderboardResponse = {
  data: LeaderboardEntryDto[];
  meta?: {
    type?: RankingType;
    skill?: SkillDto | null;
    profile?: { id: string; name: string } | null;
  };
};

function topNames(entries: LeaderboardEntryDto[], n = 5): string[] {
  return entries.slice(0, n).map((e) => e.model.name);
}

export function RankingsPageClient({
  initial,
  fetchImpl = fetch,
}: {
  initial: RankingsInitialData;
  fetchImpl?: typeof fetch;
}) {
  const [skills, setSkills] = useState<SkillDto[]>(initial.skills);
  const [profiles, setProfiles] = useState<ProfileDto[]>(initial.profiles);
  const [type, setType] = useState<RankingType>(initial.leaderboardType);
  const [skillId, setSkillId] = useState<string | null>(initial.skillId);
  const [profileId, setProfileId] = useState<string | null>(initial.profileId);
  const [entries, setEntries] = useState<LeaderboardEntryDto[]>(initial.leaderboard);
  const [ratings, setRatings] = useState<RatingCell[]>(initial.ratings);
  const [models] = useState<ModelEnrichment[]>(initial.models);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minConfidence, setMinConfidence] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [addSkillOpen, setAddSkillOpen] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [boardMode, setBoardMode] = useState<"skill" | "profile">(
    initial.skillId ? "skill" : "profile",
  );

  const modelsById = useMemo(() => {
    const m = new Map<string, ModelEnrichment>();
    for (const row of models) m.set(row.id, row);
    return m;
  }, [models]);

  const activeSkill = skills.find((s) => s.id === skillId) ?? null;

  const providerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const m of models) {
      if (m.accessProviderName) names.add(m.accessProviderName);
    }
    return [
      { value: "all", label: "All Providers" },
      ...[...names].sort().map((n) => ({ value: n, label: n })),
    ];
  }, [models]);

  const reloadLeaderboard = useCallback(
    async (opts?: {
      type?: RankingType;
      skillId?: string | null;
      profileId?: string | null;
      mode?: "skill" | "profile";
    }) => {
      const nextType = opts?.type ?? type;
      const nextMode = opts?.mode ?? boardMode;
      const nextSkill = opts?.skillId !== undefined ? opts.skillId : skillId;
      const nextProfile =
        opts?.profileId !== undefined ? opts.profileId : profileId;

      const qs = new URLSearchParams();
      qs.set("type", nextType);
      if (nextMode === "skill" && nextSkill) {
        qs.set("skillId", nextSkill);
      } else if (nextProfile) {
        qs.set("profileId", nextProfile);
      } else if (nextSkill) {
        qs.set("skillId", nextSkill);
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetchImpl(`/api/v1/leaderboard?${qs.toString()}`, {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error(await readApiError(res));
        const body = (await res.json()) as LeaderboardResponse;
        setEntries(body.data ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    },
    [boardMode, fetchImpl, profileId, skillId, type],
  );

  const reloadRatings = useCallback(async () => {
    try {
      const res = await fetchImpl("/api/v1/ratings", { credentials: "same-origin" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        data?: Array<{
          modelId: string;
          skillId: string;
          personalScore: number | null;
          externalScore: number | null;
          personalConfidence: RatingCell["personalConfidence"];
          notes: string | null;
          tested: boolean;
          testedAt: string | null;
          rankOverride: number | null;
          pinned: boolean;
          hidden: boolean;
        }>;
      };
      setRatings(
        (body.data ?? []).map((r) => ({
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
        })),
      );
    } catch {
      /* matrix is secondary */
    }
  }, [fetchImpl]);

  useEffect(() => {
    void reloadLeaderboard();
    // initial already loaded — skip first mount double-fetch if identical
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTypeChange(next: RankingType) {
    setType(next);
    await reloadLeaderboard({ type: next });
  }

  async function handleSkillChange(next: string) {
    if (next === "__profile__") {
      setBoardMode("profile");
      setSkillId(null);
      await reloadLeaderboard({ skillId: null, mode: "profile" });
      return;
    }
    setBoardMode("skill");
    setSkillId(next);
    await reloadLeaderboard({ skillId: next, mode: "skill" });
  }

  async function handleProfileSelect(id: string) {
    setProfileId(id);
    // Profile boards reorder when in profile mode; skill boards keep skill order.
    if (boardMode === "profile") {
      await reloadLeaderboard({ profileId: id, mode: "profile" });
    } else {
      await reloadLeaderboard({ profileId: id, mode: "skill" });
    }
  }

  async function handleAddSkill() {
    const name = newSkillName.trim();
    if (!name) return;
    try {
      const res = await fetchImpl("/api/v1/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const skill = (await res.json()) as SkillDto;
      setSkills((prev) => [...prev, skill].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)));
      setAddSkillOpen(false);
      setNewSkillName("");
      setBoardMode("skill");
      setSkillId(skill.id);
      await reloadLeaderboard({ skillId: skill.id, mode: "skill" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add skill");
    }
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (minConfidence !== "all") {
        if (e.personalConfidence !== minConfidence) return false;
      }
      if (providerFilter !== "all") {
        const m = modelsById.get(e.model.id);
        if ((m?.accessProviderName ?? "") !== providerFilter) return false;
      }
      return true;
    });
  }, [entries, minConfidence, modelsById, providerFilter]);

  const matrixModels = useMemo(() => {
    // Top models from current board for matrix rows
    const seen = new Set<string>();
    const list: Array<{ id: string; name: string }> = [];
    for (const e of entries) {
      if (seen.has(e.model.id)) continue;
      seen.add(e.model.id);
      list.push({ id: e.model.id, name: e.model.name });
      if (list.length >= 12) break;
    }
    return list;
  }, [entries]);

  const skillOptions = [
    { value: "__profile__", label: "Profile overall (weighted)" },
    ...skills.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <div data-testid="rankings-page" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="page-head">
        <h1
          style={{
            margin: 0,
            fontSize: "var(--text-page-size)",
            fontWeight: 600,
            lineHeight: "var(--text-page-line)",
            color: "var(--text)",
            fontFamily: "var(--font-sans)",
          }}
        >
          Rankings
        </h1>
        <p
          style={{
            margin: "var(--space-1) 0 0",
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
            fontFamily: "var(--font-sans)",
          }}
        >
          Rank and compare models across the skills that matter most to you.
        </p>
      </div>

      <Tabs
        value={type}
        onValueChange={(v) => void handleTypeChange(v as RankingType)}
        data-testid="rankings-type-tabs"
      >
        <TabsList>
          <TabsTrigger value="personal" data-testid="tab-personal">
            My Rankings
          </TabsTrigger>
          <TabsTrigger value="external" data-testid="tab-external">
            External Rankings
          </TabsTrigger>
          <TabsTrigger value="combined" data-testid="tab-combined">
            Combined
          </TabsTrigger>
        </TabsList>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr var(--rail-width, 280px)",
            gap: "var(--space-4)",
            alignItems: "start",
            marginTop: "var(--space-4)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
            <div
              data-testid="rankings-filters"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-2)",
                alignItems: "center",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "var(--space-3)",
              }}
            >
              <label style={{ display: "grid", gap: 2, minWidth: 160 }}>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Skill</span>
                <Select
                  options={skillOptions}
                  value={boardMode === "profile" ? "__profile__" : (skillId ?? "")}
                  onChange={(v) => void handleSkillChange(v)}
                  data-testid="skill-select"
                />
              </label>
              <label style={{ display: "grid", gap: 2, minWidth: 180 }}>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Profile</span>
                <Select
                  options={profiles.map((p) => ({ value: p.id, label: p.name }))}
                  value={profileId ?? ""}
                  onChange={(v) => void handleProfileSelect(v)}
                  data-testid="profile-select"
                />
              </label>
              <label style={{ display: "grid", gap: 2, minWidth: 140 }}>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Provider</span>
                <Select
                  options={providerOptions}
                  value={providerFilter}
                  onChange={setProviderFilter}
                  data-testid="provider-filter"
                />
              </label>
              <label style={{ display: "grid", gap: 2, minWidth: 140 }}>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Min. Confidence</span>
                <Select
                  options={[
                    { value: "all", label: "All" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ]}
                  value={minConfidence}
                  onChange={setMinConfidence}
                  data-testid="confidence-filter"
                />
              </label>
              <Button
                variant="secondary"
                style={{ marginLeft: "auto" }}
                data-testid="add-skill"
                onClick={() => setAddSkillOpen(true)}
              >
                + Add Skill
              </Button>
            </div>

            {error ? (
              <p role="alert" style={{ color: "var(--danger)", margin: 0 }}>
                {error}
              </p>
            ) : null}

            {(["personal", "external", "combined"] as RankingType[]).map((t) => (
              <TabsContent key={t} value={t}>
                <Card padding="md" data-testid={`leaderboard-card-${t}`}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--space-3)",
                      marginBottom: "var(--space-3)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: "var(--text-section-size)",
                          fontWeight: 600,
                        }}
                      >
                        Leaderboard
                        {boardMode === "skill" && activeSkill
                          ? ` — ${activeSkill.name}`
                          : " — Profile overall"}
                      </h2>
                      {loading ? (
                        <span style={{ color: "var(--text-faint)", fontSize: "var(--text-meta-size)" }}>
                          Updating…
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Combined must show adjacent personal + external columns — never merge */}
                  <LeaderboardTable
                    entries={filteredEntries}
                    type={t}
                    skill={activeSkill}
                    skills={skills}
                    modelsById={modelsById}
                    onRated={() => {
                      void reloadLeaderboard();
                      void reloadRatings();
                    }}
                    fetchImpl={fetchImpl}
                  />
                </Card>
              </TabsContent>
            ))}

            <Card padding="md">
              <ScoreMatrix
                skills={skills}
                modelNames={matrixModels}
                ratings={ratings}
                prefer={
                  type === "personal"
                    ? "personal"
                    : type === "external"
                      ? "external"
                      : "auto"
                }
              />
            </Card>
          </div>

          <aside style={{ position: "sticky", top: "calc(var(--topbar-height, 56px) + var(--space-4))" }}>
            <ProfilesPanel
              profiles={profiles}
              skills={skills}
              selectedId={profileId}
              onSelect={(id) => void handleProfileSelect(id)}
              onProfilesChange={setProfiles}
              onWeightsLiveChange={() => {
                if (boardMode === "profile") {
                  void reloadLeaderboard({ mode: "profile" });
                }
              }}
              fetchImpl={fetchImpl}
            />
          </aside>
        </div>
      </Tabs>

      {/* Hidden helper for verification tooling */}
      <div
        hidden
        data-testid="rankings-top5"
        data-top5={topNames(filteredEntries).join("|")}
        data-type={type}
        data-profile={profileId ?? ""}
        data-mode={boardMode}
      />

      <Dialog
        open={addSkillOpen}
        onClose={() => setAddSkillOpen(false)}
        title="Add skill"
        data-testid="add-skill-dialog"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddSkillOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              data-testid="add-skill-save"
              onClick={() => void handleAddSkill()}
            >
              Add skill
            </Button>
          </>
        }
      >
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
            Skill name
          </span>
          <Input
            value={newSkillName}
            onChange={(e) => setNewSkillName(e.target.value)}
            data-testid="add-skill-name"
            placeholder="e.g. Agent orchestration"
          />
        </label>
      </Dialog>
    </div>
  );
}
