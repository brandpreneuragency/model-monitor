import Link from "next/link";
import { getModelById } from "@model-monitor/database";
import { db } from "@/lib/db";
import {
  CompareView,
  CompareViewLegend,
  COMPARE_MAX_MODELS,
  COMPARE_MIN_MODELS,
  toCompareModelInput,
  type CompareModelInput,
} from "@/components/models/compare-view";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Preserve order, drop duplicates, cap at max.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of parts) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= COMPARE_MAX_MODELS) break;
  }
  return out;
}

type AccessRow = {
  availability?: string | null;
  accessMethod?: string | null;
  planName?: string | null;
  providerName?: string | null;
  status?: string | null;
  includedInPlan?: boolean | null;
};

function mapDetailToCompare(
  detail: Record<string, unknown>,
): CompareModelInput {
  const accessList = Array.isArray(detail.access)
    ? (detail.access as AccessRow[])
    : [];
  const preferred =
    accessList.find((a) => a.status === "active" || a.status == null) ??
    accessList[0] ??
    null;

  const providers = Array.isArray(detail.accessProviders)
    ? (detail.accessProviders as string[])
    : [];

  const base = toCompareModelInput(detail, {
    accessProvider:
      preferred?.providerName ??
      providers[0] ??
      null,
    planName: preferred?.planName ?? null,
    availability: preferred?.availability ?? null,
    accessMethod: preferred?.accessMethod ?? null,
    // Pricing/quota live on plan; detail snapshot may not include them.
    pricing: null,
    quota: null,
  });

  // If multiple access routes, surface a compact summary in Access provider.
  if (accessList.length > 1) {
    const names = [
      ...new Set(
        accessList
          .map((a) => a.providerName)
          .filter((n): n is string => Boolean(n?.trim())),
      ),
    ];
    if (names.length > 1) {
      base.accessProvider = names.join(", ");
    }
    const plans = [
      ...new Set(
        accessList
          .map((a) => a.planName)
          .filter((n): n is string => Boolean(n?.trim())),
      ),
    ];
    if (plans.length > 1) {
      base.planName = plans.join(", ");
    }
  }

  return base;
}

async function loadModels(ids: string[]): Promise<{
  models: CompareModelInput[];
  missing: string[];
}> {
  const models: CompareModelInput[] = [];
  const missing: string[] = [];

  for (const id of ids) {
    try {
      const detail = (await getModelById(db, id)) as Record<string, unknown>;
      models.push(mapDetailToCompare(detail));
    } catch {
      missing.push(id);
    }
  }

  return { models, missing };
}

export default async function ModelsComparePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const ids = parseIds(first(sp.ids));
  const { models, missing } = ids.length > 0 ? await loadModels(ids) : { models: [], missing: [] };

  const tooFew = models.length > 0 && models.length < COMPARE_MIN_MODELS;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        paddingBottom: "var(--space-12)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          alignItems: "center",
        }}
      >
        <Link
          href="/models"
          style={{
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
            textDecoration: "none",
          }}
        >
          ← Models
        </Link>
      </div>

      {ids.length === 0 ? (
        <CompareView models={[]} emptyMessage="No models selected. Pick two to four models from the Models list, then open Compare from the tray." />
      ) : tooFew ? (
        <CompareView
          models={models}
          emptyMessage={undefined}
          title="Compare models"
        />
      ) : (
        <CompareView models={models} />
      )}

      {tooFew ? (
        <p
          role="status"
          data-testid="compare-too-few"
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          Add at least {COMPARE_MIN_MODELS} models to compare (currently{" "}
          {models.length}). Use the compare tray on the Models page.
        </p>
      ) : null}

      {missing.length > 0 ? (
        <p
          role="status"
          data-testid="compare-missing"
          style={{
            margin: 0,
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
          }}
        >
          {missing.length} selected id{missing.length === 1 ? "" : "s"} could
          not be loaded.
        </p>
      ) : null}

      {models.length >= COMPARE_MIN_MODELS ? <CompareViewLegend /> : null}
    </div>
  );
}
