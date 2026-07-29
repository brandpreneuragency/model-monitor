import { Suspense } from "react";
import { listModels } from "@model-monitor/database";
import { db } from "@/lib/db";
import {
  ModelsTable,
  type ModelsListResponse,
} from "@/components/models/models-table";
import type { ModelTableRow } from "@/components/models/models-columns";
import { parseModelFilters } from "@/lib/use-model-filters";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 20;
  if (![10, 20, 50, 100].includes(n)) return 20;
  return n;
}

function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export default async function ModelsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const page = parsePage(first(sp.page));
  const limit = parseLimit(first(sp.limit));
  const sort = first(sp.sort)?.trim() || "name";
  const filters = parseModelFilters(sp);

  let initialData: ModelsListResponse = {
    data: [],
    page: {
      nextCursor: null,
      hasMore: false,
      total: 0,
      page,
      pageSize: limit,
    },
  };

  try {
    const result = await listModels(db, {
      page,
      limit,
      sort,
      ...filters,
    });
    initialData = {
      data: (result.data ?? []) as ModelTableRow[],
      page: {
        nextCursor: result.page.nextCursor ?? null,
        hasMore: Boolean(result.page.hasMore),
        total: result.page.total ?? 0,
        page: result.page.page ?? page,
        pageSize: result.page.pageSize ?? limit,
      },
      meta: result.meta,
    };
  } catch {
    // Render empty table; client can retry via navigation.
    initialData = {
      data: [],
      page: {
        nextCursor: null,
        hasMore: false,
        total: 0,
        page,
        pageSize: limit,
      },
    };
  }

  return (
    <Suspense
      fallback={
        <div data-testid="models-page-loading" style={{ color: "var(--text-muted)" }}>
          Loading models…
        </div>
      }
    >
      <ModelsTable
        initialData={initialData}
        initialQuery={{ page, limit, sort, filters }}
      />
    </Suspense>
  );
}
