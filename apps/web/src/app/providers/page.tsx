import {
  listAccessProviders,
  listPlanQuotas,
  listPlans,
  listRenewals,
} from "@model-monitor/database";
import { db } from "@/lib/db";
import { ProvidersPageClient } from "@/components/providers/providers-page";
import type {
  PlanDto,
  ProviderDto,
  ProvidersInitialData,
  QuotaDto,
  RenewalDto,
} from "@/components/providers/types";

export const dynamic = "force-dynamic";

function mapProvider(
  p: Awaited<ReturnType<typeof listAccessProviders>>[number],
): ProviderDto {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    providerType: p.providerType ?? null,
    websiteUrl: p.websiteUrl ?? null,
    logoUrl: p.logoUrl ?? null,
    colour: p.colour ?? null,
    notes: p.notes ?? null,
    status: p.status === "archived" ? "archived" : "active",
    archivedAt: p.archivedAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    activePlansCount: p.activePlansCount ?? 0,
    accessibleModelsCount: p.accessibleModelsCount ?? 0,
    monthlyTotal: p.monthlyTotal ?? null,
    capabilityTags: p.capabilityTags ?? [],
  };
}

function mapQuota(
  q: Awaited<ReturnType<typeof listPlanQuotas>>[number],
): QuotaDto {
  return {
    id: q.id,
    planId: q.planId,
    name: q.name,
    amount: q.amount,
    amountMin: q.amountMin,
    amountMax: q.amountMax,
    unit: q.unit,
    customUnit: q.customUnit ?? null,
    period: q.period,
    resetBehaviour: q.resetBehaviour ?? null,
    remainingAmount: q.remainingAmount,
    remainingUpdatedAt: q.remainingUpdatedAt,
    resetsAt: q.resetsAt,
    isUnlimited: q.isUnlimited,
    notes: q.notes ?? null,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

function mapPlan(
  p: Awaited<ReturnType<typeof listPlans>>[number],
  quotas: QuotaDto[],
): PlanDto {
  return {
    id: p.id,
    accessProviderId: p.accessProviderId,
    name: p.name,
    slug: p.slug,
    planType: p.planType ?? null,
    regularPrice: p.regularPrice ?? null,
    introductoryPrice: p.introductoryPrice ?? null,
    currency: p.currency ?? null,
    billingInterval: p.billingInterval ?? null,
    renewalDate: p.renewalDate ?? null,
    billingPeriod: p.billingPeriod ?? null,
    autoRenews: p.autoRenews ?? null,
    actualPrice: p.actualPrice ?? null,
    notes: p.notes ?? null,
    startedAt: p.startedAt ?? null,
    cancelledAt: p.cancelledAt ?? null,
    introPriceExpiresAt: p.introPriceExpiresAt ?? null,
    accessType: p.accessType ?? null,
    status: p.status === "archived" ? "archived" : "active",
    accessProvider: {
      id: p.accessProvider.id,
      name: p.accessProvider.name,
      slug: p.accessProvider.slug,
    },
    monthlyCost: p.monthlyCost ?? null,
    includedModels: (p.includedModels ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
    })),
    quotas,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function mapRenewal(
  r: Awaited<ReturnType<typeof listRenewals>>[number],
): RenewalDto {
  return {
    kind: r.kind,
    date: r.date,
    entityType: r.entityType,
    entityId: r.entityId,
    title: r.title,
    subtitle: r.subtitle,
    amount: r.amount,
    currency: r.currency,
    provider: r.provider
      ? { id: r.provider.id, name: r.provider.name, slug: r.provider.slug }
      : null,
  };
}

export default async function ProvidersPage() {
  let initial: ProvidersInitialData = {
    providers: [],
    plans: [],
    renewals: [],
  };

  try {
    const [providerRows, planRows, renewalRows] = await Promise.all([
      listAccessProviders(db, {}),
      listPlans(db, {}),
      listRenewals(db, { limit: 500 }),
    ]);

    const quotasByPlan = await Promise.all(
      planRows.map(async (plan) => {
        try {
          const qs = await listPlanQuotas(db, plan.id);
          return [plan.id, qs.map(mapQuota)] as const;
        } catch {
          // Fall back to summary items when full quota fetch fails
          const summary = plan.quotaSummary?.items ?? [];
          return [
            plan.id,
            summary.map(
              (q): QuotaDto => ({
                id: q.id,
                planId: plan.id,
                name: q.name,
                amount: q.amount,
                amountMin: q.amountMin,
                amountMax: q.amountMax,
                unit: q.unit,
                customUnit: q.customUnit ?? null,
                period: q.period,
                resetBehaviour: null,
                remainingAmount: q.remainingAmount ?? null,
                remainingUpdatedAt: q.remainingUpdatedAt ?? null,
                resetsAt: null,
                isUnlimited: q.isUnlimited ?? false,
                notes: null,
              }),
            ),
          ] as const;
        }
      }),
    );

    const quotaMap = new Map(quotasByPlan);

    initial = {
      providers: providerRows.map(mapProvider),
      plans: planRows.map((p) => mapPlan(p, quotaMap.get(p.id) ?? [])),
      renewals: renewalRows.map(mapRenewal),
    };
  } catch {
    // Render empty shell if DB is unavailable in this process — client still mounts tabs.
  }

  return <ProvidersPageClient initial={initial} />;
}
