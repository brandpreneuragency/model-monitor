"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Badge,
  Button,
  IconButton,
  Popover,
  StatusChip,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@model-monitor/ui";
import {
  workflowColor,
  workflowLabel,
  type ModelTableRow,
} from "@/components/models/models-columns";
import { OverviewTab } from "./overview-tab";
import { AccessCostTab } from "./access-cost-tab";
import { RankingsTab } from "./rankings-tab";
import { SpecificationsTab } from "./specifications-tab";
import { ResearchTab } from "./research-tab";
import {
  DRAWER_TABS,
  type DrawerAccessRoute,
  type DrawerBenchmark,
  type DrawerModel,
  type DrawerSkillRating,
  type DrawerSource,
  type DrawerTabId,
  type ModelDrawerData,
} from "./types";

export { DRAWER_TABS } from "./types";
export type { ModelDrawerData, DrawerTabId } from "./types";

type PlanLite = {
  id: string;
  name: string;
  slug?: string | null;
  accessType?: string | null;
  monthlyCost?: number | null;
  regularPrice?: number | null;
  currency?: string | null;
  billingInterval?: string | null;
  accessProvider?: { id?: string; name?: string | null; slug?: string | null };
  quotaSummary?: {
    count?: number;
    items?: Array<{
      name?: string | null;
      amount?: number | null;
      amountMin?: number | null;
      amountMax?: number | null;
      unit?: string | null;
      period?: string | null;
    }>;
  };
};

function formatQuotaSummary(plan: PlanLite | undefined): string | null {
  if (!plan?.quotaSummary?.items?.length) return null;
  return plan.quotaSummary.items
    .map((q) => {
      const amt =
        q.amount != null
          ? String(q.amount)
          : q.amountMin != null || q.amountMax != null
            ? `${q.amountMin ?? "?"}–${q.amountMax ?? "?"}`
            : null;
      return [q.name, amt, q.unit, q.period].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("; ");
}

function modelFromTableRow(row: ModelTableRow): DrawerModel {
  return {
    id: row.id,
    name: row.name,
    canonicalId: row.canonicalId,
    slug: row.slug,
    isFavourite: row.isFavourite,
    workflowStatus: row.workflowStatus,
    status: row.status,
    lifecycle: row.lifecycle,
    family: row.family,
    generation: row.generation,
    releaseDate: row.releaseDate,
    knowledgeCutoff: null,
    modelType: row.modelType,
    description: row.description,
    bestUse: row.bestUse,
    avoidFor: row.avoidFor,
    personalNotes: row.description,
    contextTokens: row.contextTokens ?? row.context,
    context: row.context,
    maxOutputTokens: row.maxOutputTokens,
    speedRating: row.speed ?? row.speedRating,
    speed: row.speed,
    overallScore: row.overallScore,
    scoreBasis: row.scoreBasis,
    verificationStatus: row.verificationStatus,
    developerName: row.developerName ?? row.creator?.name,
    creator: row.creator,
    capabilities: row.capabilities ?? null,
    tags: row.tags,
    codingSpecialization: row.codingSpecialization,
  };
}

function mergeModel(
  base: DrawerModel,
  detail: Record<string, unknown> | null,
): DrawerModel {
  if (!detail) return base;
  const caps = (detail.capabilities as DrawerModel["capabilities"]) ?? base.capabilities;
  return {
    ...base,
    name: (detail.name as string) ?? base.name,
    canonicalId: (detail.canonicalId as string | null) ?? base.canonicalId,
    slug: (detail.slug as string | null) ?? base.slug,
    isFavourite: (detail.isFavourite as boolean | null) ?? base.isFavourite,
    workflowStatus:
      (detail.workflowStatus as string | null) ?? base.workflowStatus,
    status: (detail.status as string | null) ?? base.status,
    lifecycle: (detail.lifecycle as string | null) ?? base.lifecycle,
    family: (detail.family as string | null) ?? base.family,
    generation: (detail.generation as string | null) ?? base.generation,
    releaseDate: (detail.releaseDate as string | null) ?? base.releaseDate,
    knowledgeCutoff:
      (detail.knowledgeCutoff as string | null) ?? base.knowledgeCutoff,
    modelType: (detail.modelType as string | null) ?? base.modelType,
    description: (detail.description as string | null) ?? base.description,
    bestUse: (detail.bestUse as string | null) ?? base.bestUse,
    avoidFor: (detail.avoidFor as string | null) ?? base.avoidFor,
    personalNotes:
      (detail.description as string | null) ?? base.personalNotes,
    contextTokens:
      (detail.contextTokens as number | null) ?? base.contextTokens,
    maxOutputTokens:
      (detail.maxOutputTokens as number | null) ?? base.maxOutputTokens,
    speedRating: (detail.speedRating as string | null) ?? base.speedRating,
    overallScore:
      (detail.overallScore as number | null | undefined) ?? base.overallScore,
    scoreBasis: (detail.scoreBasis as string | null) ?? base.scoreBasis,
    verificationStatus:
      (detail.verificationStatus as string | null) ?? base.verificationStatus,
    needsRecheck: (detail.needsRecheck as boolean | null) ?? base.needsRecheck,
    needsReview: (detail.needsReview as boolean | null) ?? base.needsReview,
    developerName:
      (detail.developerName as string | null) ?? base.developerName,
    creator: base.creator ?? {
      name: (detail.developerName as string | null) ?? null,
      slug: (detail.developerSlug as string | null) ?? null,
    },
    capabilities: caps,
    codingSpecialization:
      (detail.codingSpecialization as string | null) ??
      base.codingSpecialization,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

function ordinal(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export type ModelDrawerProps = {
  /** Presentational mode: supply fully resolved data (unit tests). */
  data?: ModelDrawerData;
  /** Live mode: seed from list row and fetch detail. */
  modelId?: string;
  initialModel?: ModelTableRow;
  defaultTab?: DrawerTabId;
  onFavouriteToggle?: () => void | Promise<void>;
  onEditModel?: () => void;
  onCompare?: () => void;
  onEditAccessRoute?: (accessId: string) => void;
  /** Optional controlled favourite flag override. */
  isFavourite?: boolean | null;
  headerActions?: ReactNode;
};

/**
 * Model details drawer body — five tabs matching docs/design/models.html.
 * Renders inside the shell Drawer host (title/close provided by host).
 */
export function ModelDrawer({
  data: dataProp,
  modelId,
  initialModel,
  defaultTab = "overview",
  onFavouriteToggle,
  onEditModel,
  onCompare,
  onEditAccessRoute,
  isFavourite: favouriteOverride,
  headerActions,
}: ModelDrawerProps) {
  const seed = useMemo<DrawerModel | null>(() => {
    if (dataProp?.model) return dataProp.model;
    if (initialModel) return modelFromTableRow(initialModel);
    return null;
  }, [dataProp, initialModel]);

  const [model, setModel] = useState<DrawerModel | null>(seed);
  const [accessRoutes, setAccessRoutes] = useState<DrawerAccessRoute[]>(
    dataProp?.accessRoutes ?? [],
  );
  const [ratings, setRatings] = useState<DrawerSkillRating[]>(
    dataProp?.ratings ?? [],
  );
  const [benchmarks, setBenchmarks] = useState<DrawerBenchmark[]>(
    dataProp?.benchmarks ?? [],
  );
  const [sources, setSources] = useState<DrawerSource[]>(
    dataProp?.sources ?? [],
  );
  const [tab, setTab] = useState<DrawerTabId>(defaultTab);
  const [loading, setLoading] = useState(!dataProp);
  const [error, setError] = useState<string | null>(null);
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);
  const [localFavourite, setLocalFavourite] = useState<boolean | null>(null);

  const id = modelId ?? seed?.id ?? dataProp?.model.id;

  useEffect(() => {
    setModel(seed);
    if (dataProp) {
      setAccessRoutes(dataProp.accessRoutes);
      setRatings(dataProp.ratings);
      setBenchmarks(dataProp.benchmarks);
      setSources(dataProp.sources);
      setLoading(false);
    }
  }, [seed, dataProp]);

  useEffect(() => {
    if (dataProp || !id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [detailRaw, accessRaw, ratingsRaw, skillsRaw, tagsRaw, plansRaw] =
          await Promise.all([
            fetchJson<Record<string, unknown>>(
              `/api/v1/models/${encodeURIComponent(id!)}`,
            ).catch(() => null),
            fetchJson<{ data?: unknown[] }>(
              `/api/v1/model-access?modelId=${encodeURIComponent(id!)}&limit=100`,
            ).catch(() => ({ data: [] })),
            fetchJson<{ data?: unknown[] }>(
              `/api/v1/ratings?modelId=${encodeURIComponent(id!)}`,
            ).catch(() => ({ data: [] })),
            fetchJson<{ data?: unknown[] }>(`/api/v1/skills`).catch(() => ({
              data: [],
            })),
            fetchJson<{ data?: unknown[] }>(
              `/api/v1/models/${encodeURIComponent(id!)}/tags`,
            ).catch(() => ({ data: [] })),
            fetchJson<{ data?: PlanLite[] }>(`/api/v1/plans`).catch(() => ({
              data: [],
            })),
          ]);

        if (cancelled) return;

        let detailRecord: Record<string, unknown> | null = null;
        if (detailRaw && typeof detailRaw === "object") {
          if ("id" in detailRaw) {
            detailRecord = detailRaw;
          } else {
            const nested = detailRaw.data;
            if (nested && typeof nested === "object" && !Array.isArray(nested)) {
              detailRecord = nested as Record<string, unknown>;
            }
          }
        }

        const base = seed ?? {
          id: id!,
          name: "Model",
        };
        const merged = mergeModel(base, detailRecord);
        const tagList = Array.isArray(tagsRaw?.data)
          ? (tagsRaw.data as DrawerModel["tags"])
          : merged.tags;
        setModel({ ...merged, tags: tagList ?? merged.tags });

        const plans = Array.isArray(plansRaw?.data) ? plansRaw.data : [];
        const planById = new Map(plans.map((p) => [p.id, p]));

        const accessList = Array.isArray(accessRaw?.data) ? accessRaw.data : [];
        const routes: DrawerAccessRoute[] = accessList.map((raw) => {
          const r = raw as Record<string, unknown>;
          const planObj = r.plan as
            | {
                id?: string;
                name?: string;
                slug?: string;
                accessType?: string | null;
                accessProviderName?: string | null;
                accessProviderSlug?: string | null;
              }
            | undefined;
          const planId = (r.planId as string | undefined) ?? planObj?.id;
          const plan = planId ? planById.get(planId) : undefined;
          return {
            id: String(r.id),
            modelId: r.modelId as string | undefined,
            planId,
            providerModelId: (r.providerModelId as string | null) ?? null,
            availability: (r.availability as string | null) ?? null,
            accessMethod: (r.accessMethod as string | null) ?? null,
            accessType:
              plan?.accessType ??
              planObj?.accessType ??
              null,
            authenticationType: (r.authenticationType as string | null) ?? null,
            includedInPlan: (r.includedInPlan as boolean | null) ?? null,
            apiCompatible: (r.apiCompatible as boolean | null) ?? null,
            cliOnly: (r.cliOnly as boolean | null) ?? null,
            webOnly: (r.webOnly as boolean | null) ?? null,
            limitations: (r.limitations as string | null) ?? null,
            notes: (r.notes as string | null) ?? null,
            isPreferred: Boolean(r.isPreferred),
            status: (r.status as string | null) ?? null,
            providerName:
              (r.providerName as string | null) ??
              plan?.accessProvider?.name ??
              planObj?.accessProviderName ??
              null,
            providerSlug:
              (r.providerSlug as string | null) ??
              plan?.accessProvider?.slug ??
              planObj?.accessProviderSlug ??
              null,
            planName:
              (r.planName as string | null) ?? plan?.name ?? planObj?.name ?? null,
            planSlug:
              (r.planSlug as string | null) ?? plan?.slug ?? planObj?.slug ?? null,
            pricingSummary: null,
            quotaSummary: formatQuotaSummary(plan),
            plan: plan
              ? {
                  id: plan.id,
                  name: plan.name,
                  slug: plan.slug,
                  accessType: plan.accessType,
                  accessProviderName: plan.accessProvider?.name ?? null,
                  accessProviderSlug: plan.accessProvider?.slug ?? null,
                  monthlyCost: plan.monthlyCost ?? null,
                  regularPrice: plan.regularPrice ?? null,
                  currency: plan.currency ?? null,
                  billingInterval: plan.billingInterval ?? null,
                }
              : planObj
                ? {
                    id: planObj.id,
                    name: planObj.name,
                    slug: planObj.slug,
                    accessType: planObj.accessType,
                    accessProviderName: planObj.accessProviderName,
                    accessProviderSlug: planObj.accessProviderSlug,
                  }
                : null,
          };
        });
        // Preferred first
        routes.sort((a, b) => Number(Boolean(b.isPreferred)) - Number(Boolean(a.isPreferred)));
        setAccessRoutes(routes);

        const skillList = Array.isArray(skillsRaw?.data) ? skillsRaw.data : [];
        const ratingList = Array.isArray(ratingsRaw?.data) ? ratingsRaw.data : [];
        const ratingBySkill = new Map<string, Record<string, unknown>>();
        for (const raw of ratingList) {
          const r = raw as Record<string, unknown>;
          if (typeof r.skillId === "string") ratingBySkill.set(r.skillId, r);
        }

        const skillRows: DrawerSkillRating[] = skillList.map((raw) => {
          const s = raw as {
            id: string;
            name: string;
            slug?: string;
          };
          const r = ratingBySkill.get(s.id);
          const personalScore =
            r && r.personalScore != null ? Number(r.personalScore) : null;
          const externalScore =
            r && r.externalScore != null ? Number(r.externalScore) : null;
          const externalRank =
            r && r.externalRank != null ? Number(r.externalRank) : null;
          const tested = Boolean(r?.tested);
          const personalConfidence =
            (r?.personalConfidence as DrawerSkillRating["personalConfidence"]) ??
            null;
          return {
            id: r && typeof r.id === "string" ? r.id : null,
            skillId: s.id,
            skillName: s.name,
            skillSlug: s.slug ?? null,
            personalScore:
              personalScore != null && Number.isFinite(personalScore)
                ? personalScore
                : null,
            personalConfidence,
            externalScore:
              externalScore != null && Number.isFinite(externalScore)
                ? externalScore
                : null,
            externalRank:
              externalRank != null && Number.isFinite(externalRank)
                ? externalRank
                : null,
            externalConfidence:
              r && r.externalConfidence != null
                ? Number(r.externalConfidence)
                : null,
            rankOverride:
              r && r.rankOverride != null ? Number(r.rankOverride) : null,
            tested,
            rankingPosition:
              externalRank != null && Number.isFinite(externalRank)
                ? ordinal(externalRank)
                : null,
            notes: (r?.notes as string | null) ?? null,
          };
        });
        // If no skills returned, still show rating rows we have
        if (skillRows.length === 0 && ratingList.length > 0) {
          for (const raw of ratingList) {
            const r = raw as Record<string, unknown>;
            const skill = r.skill as { id?: string; name?: string; slug?: string } | undefined;
            const skillId = (r.skillId as string) ?? skill?.id;
            if (!skillId) continue;
            skillRows.push({
              id: typeof r.id === "string" ? r.id : null,
              skillId,
              skillName: skill?.name ?? "Skill",
              skillSlug: skill?.slug ?? null,
              personalScore:
                r.personalScore != null ? Number(r.personalScore) : null,
              personalConfidence:
                (r.personalConfidence as DrawerSkillRating["personalConfidence"]) ??
                null,
              externalScore:
                r.externalScore != null ? Number(r.externalScore) : null,
              externalRank:
                r.externalRank != null ? Number(r.externalRank) : null,
              externalConfidence:
                r.externalConfidence != null
                  ? Number(r.externalConfidence)
                  : null,
              tested: Boolean(r.tested),
              rankingPosition:
                r.externalRank != null
                  ? ordinal(Number(r.externalRank))
                  : null,
            });
          }
        }
        setRatings(skillRows);

        const detailBenchmarks = Array.isArray(detailRecord?.benchmarks)
          ? (detailRecord.benchmarks as DrawerBenchmark[])
          : [];
        setBenchmarks(detailBenchmarks);

        const detailSources = Array.isArray(detailRecord?.sources)
          ? (detailRecord.sources as DrawerSource[])
          : [];
        setSources(detailSources);
      } catch {
        if (!cancelled) setError("Could not load model details.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [dataProp, id, seed]);

  const favourite =
    favouriteOverride ??
    localFavourite ??
    model?.isFavourite ??
    false;

  const handleFavourite = useCallback(async () => {
    setLocalFavourite(!favourite);
    await onFavouriteToggle?.();
  }, [favourite, onFavouriteToggle]);

  const handleSetPreferred = useCallback(
    async (accessId: string) => {
      setAccessBusyId(accessId);
      try {
        const res = await fetch(
          `/api/v1/model-access/${encodeURIComponent(accessId)}`,
          {
            method: "PATCH",
            credentials: "same-origin",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ isPreferred: true }),
          },
        );
        if (!res.ok) throw new Error("preferred failed");
        setAccessRoutes((prev) =>
          prev
            .map((r) => ({
              ...r,
              isPreferred: r.id === accessId,
            }))
            .sort(
              (a, b) =>
                Number(Boolean(b.isPreferred)) - Number(Boolean(a.isPreferred)),
            ),
        );
      } catch {
        setError("Could not update preferred access route.");
      } finally {
        setAccessBusyId(null);
      }
    },
    [],
  );

  const handleArchiveAccess = useCallback(async (accessId: string) => {
    setAccessBusyId(accessId);
    try {
      const res = await fetch(
        `/api/v1/model-access/${encodeURIComponent(accessId)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      if (!res.ok) throw new Error("archive failed");
      setAccessRoutes((prev) => prev.filter((r) => r.id !== accessId));
    } catch {
      setError("Could not archive access route.");
    } finally {
      setAccessBusyId(null);
    }
  }, []);

  if (!model) {
    return (
      <div data-testid="model-drawer" style={{ color: "var(--text-muted)" }}>
        {loading ? "Loading…" : "Model not found."}
      </div>
    );
  }

  const creator =
    model.creator?.name?.trim() ||
    model.developerName?.trim() ||
    "—";
  const status = model.workflowStatus ?? model.status;
  const modelIdLabel = model.canonicalId ?? model.slug ?? model.id;

  const metaRow: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    alignItems: "center",
  };

  return (
    <div
      data-testid="model-drawer"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
      }}
    >
      {/* Header chrome (name may also appear in host title) */}
      <div
        data-testid="model-drawer-header"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "var(--space-2)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text)",
              flex: 1,
              minWidth: 0,
            }}
            data-testid="model-drawer-name"
          >
            {model.name}
            {model.lifecycle &&
            ["new", "preview", "beta"].includes(
              model.lifecycle.toLowerCase(),
            ) ? (
              <Badge
                color="info"
                style={{ marginLeft: "var(--space-2)", verticalAlign: "middle" }}
              >
                {model.lifecycle.charAt(0).toUpperCase() +
                  model.lifecycle.slice(1)}
              </Badge>
            ) : null}
          </h2>
          <IconButton
            label={favourite ? "Unfavourite" : "Favourite"}
            onClick={() => void handleFavourite()}
            data-testid="model-drawer-favourite"
            aria-pressed={Boolean(favourite)}
            style={{
              color: favourite ? "var(--warn)" : "var(--text-muted)",
            }}
          >
            <span aria-hidden="true">{favourite ? "★" : "☆"}</span>
          </IconButton>
          <Popover
            align="end"
            trigger={
              <IconButton label="More actions" data-testid="model-drawer-overflow">
                <span aria-hidden="true">⋮</span>
              </IconButton>
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                minWidth: 160,
                padding: "var(--space-1)",
              }}
            >
              {onEditModel ? (
                <Button variant="ghost" size="sm" onClick={onEditModel}>
                  Edit model
                </Button>
              ) : null}
              {onCompare ? (
                <Button variant="ghost" size="sm" onClick={onCompare}>
                  Compare
                </Button>
              ) : null}
              {headerActions}
            </div>
          </Popover>
        </div>

        <div style={metaRow}>
          {creator && creator !== "—" ? (
            <Badge color="neutral" data-testid="model-drawer-creator">
              {creator}
            </Badge>
          ) : null}
          <span
            className="model-id"
            data-testid="model-drawer-model-id"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            Model ID: {modelIdLabel}
          </span>
        </div>

        <div style={metaRow}>
          <StatusChip
            color={workflowColor(status)}
            label={workflowLabel(status)}
          />
          {model.lifecycle ? (
            <StatusChip
              color="info"
              label={
                model.lifecycle.charAt(0).toUpperCase() +
                model.lifecycle.slice(1)
              }
            />
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          style={{
            color: "var(--danger)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div
          style={{ color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}
          data-testid="model-drawer-loading"
        >
          Loading details…
        </div>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as DrawerTabId)}
        data-testid="model-drawer-tabs"
      >
        <TabsList data-testid="model-drawer-tablist">
          {DRAWER_TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              data-testid={`model-drawer-tab-${t.id}`}
              style={
                t.id === "research"
                  ? { fontSize: 12, opacity: 0.85 }
                  : undefined
              }
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab model={model} previewRatings={ratings} />
        </TabsContent>
        <TabsContent value="access">
          <AccessCostTab
            routes={accessRoutes}
            onSetPreferred={handleSetPreferred}
            onArchive={handleArchiveAccess}
            onEditRoute={onEditAccessRoute}
            busyId={accessBusyId}
          />
        </TabsContent>
        <TabsContent value="rankings">
          <RankingsTab ratings={ratings} />
        </TabsContent>
        <TabsContent value="specifications">
          <SpecificationsTab model={model} />
        </TabsContent>
        <TabsContent value="research">
          <ResearchTab
            benchmarks={benchmarks}
            sources={sources}
            model={model}
            defaultOpen={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Footer actions matching the mockup: Compare · Edit Model · overflow */
export function ModelDrawerFooter({
  onCompare,
  onEditModel,
  compareLabel = "Compare",
}: {
  onCompare?: () => void;
  onEditModel?: () => void;
  compareLabel?: string;
}) {
  return (
    <div
      data-testid="model-drawer-footer"
      style={{
        display: "flex",
        gap: "var(--space-2)",
        width: "100%",
        alignItems: "center",
      }}
    >
      {onCompare ? (
        <Button variant="secondary" size="sm" onClick={onCompare} style={{ flex: 1 }}>
          ⇄ {compareLabel}
        </Button>
      ) : null}
      {onEditModel ? (
        <Button variant="ghost" size="sm" onClick={onEditModel} style={{ flex: 1 }}>
          ✎ Edit Model
        </Button>
      ) : null}
    </div>
  );
}
