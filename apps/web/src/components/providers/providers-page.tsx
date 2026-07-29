"use client";

import { useMemo, useState } from "react";
import {
  EmptyState,
  SegmentedControl,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@model-monitor/ui";
import { ProviderCard } from "./provider-card";
import { ProviderDetail } from "./provider-detail";
import { PlanDetail } from "./plan-detail";
import { PlansTab } from "./plans-tab";
import { QuotasTab } from "./quotas-tab";
import { RenewalsTab } from "./renewals-tab";
import type {
  PlanDto,
  ProviderDto,
  ProviderViewMode,
  ProvidersInitialData,
  ProvidersTab,
  QuotaDto,
  RenewalDto,
} from "./types";

export function ProvidersPageClient({
  initial,
  fetchImpl = fetch,
}: {
  initial: ProvidersInitialData;
  fetchImpl?: typeof fetch;
}) {
  const [tab, setTab] = useState<ProvidersTab>("providers");
  const [viewMode, setViewMode] = useState<ProviderViewMode>("grid");
  const [providers] = useState<ProviderDto[]>(initial.providers);
  const [plans, setPlans] = useState<PlanDto[]>(initial.plans);
  const [renewals] = useState<RenewalDto[]>(initial.renewals);
  const [planSearch, setPlanSearch] = useState("");
  const [planProviderFilter, setPlanProviderFilter] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState<ProviderDto | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanDto | null>(null);

  const providerOptions = useMemo(
    () => [
      { value: "all", label: "All Providers" },
      ...providers.map((p) => ({ value: p.id, label: p.name })),
    ],
    [providers],
  );

  const onQuotaPatched = (quota: QuotaDto) => {
    setPlans((prev) =>
      prev.map((plan) => {
        if (plan.id !== quota.planId) return plan;
        return {
          ...plan,
          quotas: plan.quotas.map((q) => (q.id === quota.id ? { ...q, ...quota } : q)),
        };
      }),
    );
    setSelectedPlan((prev) => {
      if (!prev || prev.id !== quota.planId) return prev;
      return {
        ...prev,
        quotas: prev.quotas.map((q) => (q.id === quota.id ? { ...q, ...quota } : q)),
      };
    });
  };

  return (
    <div data-testid="providers-page">
      <header style={{ marginBottom: "var(--space-4)" }}>
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
          Providers & Plans
        </h1>
        <p
          style={{
            margin: "var(--space-1) 0 0",
            color: "var(--text-muted)",
            fontSize: "var(--text-meta-size)",
            fontFamily: "var(--font-sans)",
          }}
        >
          Manage your AI providers, access plans, quotas, and renewals in one place.
        </p>
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ProvidersTab)}
      >
        <div data-testid="providers-tabs">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-3)",
            flexWrap: "wrap",
          }}
        >
          <TabsList>
            <TabsTrigger value="providers" data-testid="tab-providers">
              Providers
            </TabsTrigger>
            <TabsTrigger value="plans" data-testid="tab-plans">
              Plans
            </TabsTrigger>
            <TabsTrigger value="quotas" data-testid="tab-quotas">
              Quotas
            </TabsTrigger>
            <TabsTrigger value="renewals" data-testid="tab-renewals">
              Renewals
            </TabsTrigger>
          </TabsList>

          {tab === "providers" ? (
            <SegmentedControl
              label="Provider view mode"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "grid", label: "View as Grid" },
                { value: "list", label: "View as List" },
              ]}
              size="sm"
            />
          ) : null}
        </div>

        <TabsContent value="providers">
          {providers.length === 0 ? (
            <EmptyState
              title="No providers"
              message="Add an access provider to start tracking plans and quotas."
            />
          ) : viewMode === "grid" ? (
            <div
              data-testid="providers-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "var(--space-3)",
              }}
            >
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  mode="grid"
                  onOpen={setSelectedProvider}
                />
              ))}
            </div>
          ) : (
            <div
              data-testid="providers-list"
              style={{ display: "grid", gap: "var(--space-2)" }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(160px, 1.4fr) 100px 90px 100px 110px 120px minmax(120px, 1fr)",
                  gap: "var(--space-3)",
                  padding: "0 var(--space-4)",
                  fontSize: "var(--text-meta-size)",
                  color: "var(--text-muted)",
                }}
              >
                <span>Provider</span>
                <span>Status</span>
                <span>Plans</span>
                <span>Models</span>
                <span>Monthly</span>
                <span>Tags</span>
              </div>
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  mode="list"
                  onOpen={setSelectedProvider}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="plans">
          <PlansTab
            plans={plans}
            search={planSearch}
            onSearchChange={setPlanSearch}
            providerFilter={planProviderFilter}
            onProviderFilterChange={setPlanProviderFilter}
            providerOptions={providerOptions}
            onOpenPlan={setSelectedPlan}
          />
        </TabsContent>

        <TabsContent value="quotas">
          <QuotasTab
            plans={plans}
            onQuotaPatched={onQuotaPatched}
            fetchImpl={fetchImpl}
          />
        </TabsContent>

        <TabsContent value="renewals">
          <RenewalsTab renewals={renewals} />
        </TabsContent>
        </div>
      </Tabs>

      <ProviderDetail
        open={selectedProvider != null}
        onClose={() => setSelectedProvider(null)}
        provider={selectedProvider}
        plans={plans}
        onOpenPlan={(plan) => {
          setSelectedProvider(null);
          setSelectedPlan(plan);
        }}
      />

      <PlanDetail
        open={selectedPlan != null}
        onClose={() => setSelectedPlan(null)}
        plan={selectedPlan}
      />
    </div>
  );
}
