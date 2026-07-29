/** @jsxImportSource react */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ProvidersPageClient } from "@/components/providers/providers-page";
import { QuotaProgress } from "@/components/providers/quota-progress";
import { RenewalsTab } from "@/components/providers/renewals-tab";
import { sortRenewals } from "@/components/providers/utils";
import type {
  PlanDto,
  ProviderDto,
  ProvidersInitialData,
  QuotaDto,
  RenewalDto,
} from "@/components/providers/types";

const providerA: ProviderDto = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "OpenAI",
  slug: "openai",
  providerType: "AI Lab",
  websiteUrl: "https://openai.com",
  logoUrl: null,
  colour: null,
  notes: null,
  status: "active",
  archivedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  activePlansCount: 1,
  accessibleModelsCount: 3,
  monthlyTotal: 20,
  capabilityTags: ["LLM", "Chat"],
};

const providerB: ProviderDto = {
  ...providerA,
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  name: "Anthropic",
  slug: "anthropic",
  monthlyTotal: 20,
  accessibleModelsCount: 2,
  capabilityTags: ["LLM", "Reasoning"],
};

const unlimitedQuota: QuotaDto = {
  id: "q1111111-1111-1111-1111-111111111111",
  planId: "p1111111-1111-1111-1111-111111111111",
  name: "Requests",
  amount: null,
  amountMin: null,
  amountMax: null,
  unit: "requests",
  customUnit: null,
  period: "monthly",
  resetBehaviour: "calendar month",
  remainingAmount: null,
  remainingUpdatedAt: null,
  resetsAt: null,
  isUnlimited: true,
  notes: null,
};

const unknownRemainingQuota: QuotaDto = {
  id: "q2222222-2222-2222-2222-222222222222",
  planId: "p1111111-1111-1111-1111-111111111111",
  name: "Tokens",
  amount: 3_000_000,
  amountMin: null,
  amountMax: null,
  unit: "tokens",
  customUnit: null,
  period: "monthly",
  resetBehaviour: "billing cycle",
  remainingAmount: null,
  remainingUpdatedAt: null,
  resetsAt: null,
  isUnlimited: false,
  notes: null,
};

const finiteQuota: QuotaDto = {
  id: "q3333333-3333-3333-3333-333333333333",
  planId: "p1111111-1111-1111-1111-111111111111",
  name: "Credits",
  amount: 100,
  amountMin: null,
  amountMax: null,
  unit: "credits",
  customUnit: null,
  period: "monthly",
  resetBehaviour: null,
  remainingAmount: 42,
  remainingUpdatedAt: "2026-07-01T12:00:00.000Z",
  resetsAt: null,
  isUnlimited: false,
  notes: null,
};

const planA: PlanDto = {
  id: "p1111111-1111-1111-1111-111111111111",
  accessProviderId: providerA.id,
  name: "ChatGPT Plus",
  slug: "chatgpt-plus",
  planType: "consumer",
  regularPrice: 20,
  introductoryPrice: null,
  currency: "USD",
  billingInterval: "monthly",
  renewalDate: "2026-08-12",
  billingPeriod: "monthly",
  autoRenews: true,
  actualPrice: 20,
  notes: "Primary chat plan",
  startedAt: "2026-01-12",
  cancelledAt: null,
  introPriceExpiresAt: null,
  accessType: "subscription",
  status: "active",
  accessProvider: { id: providerA.id, name: providerA.name, slug: providerA.slug },
  monthlyCost: 20,
  includedModels: [
    { id: "m1", name: "GPT-5", slug: "gpt-5" },
    { id: "m2", name: "o3", slug: "o3" },
  ],
  quotas: [unlimitedQuota, unknownRemainingQuota, finiteQuota],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const renewals: RenewalDto[] = [
  {
    kind: "manual_review",
    date: "2026-09-01",
    entityType: "model",
    entityId: "m1",
    title: "GPT-5",
    subtitle: "OpenAI",
    amount: null,
    currency: null,
    provider: null,
  },
  {
    kind: "subscription_renewal",
    date: "2026-08-06",
    entityType: "plan",
    entityId: planA.id,
    title: "ChatGPT Plus",
    subtitle: "OpenAI",
    amount: 20,
    currency: "USD",
    provider: { id: providerA.id, name: "OpenAI", slug: "openai" },
  },
  {
    kind: "trial_expiration",
    date: "2026-08-01",
    entityType: "plan",
    entityId: "p-trial",
    title: "Gemini Trial",
    subtitle: "Google",
    amount: 0,
    currency: "USD",
    provider: {
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      name: "Google",
      slug: "google",
    },
  },
  {
    kind: "promotional_price_expiration",
    date: "2026-08-15",
    entityType: "plan",
    entityId: "p-promo",
    title: "Claude Promo",
    subtitle: "Anthropic",
    amount: 20,
    currency: "USD",
    provider: { id: providerB.id, name: "Anthropic", slug: "anthropic" },
  },
];

const initial: ProvidersInitialData = {
  providers: [providerA, providerB],
  plans: [planA],
  renewals,
};

describe("ProvidersPageClient", () => {
  it("renders four tabs: Providers, Plans, Quotas, Renewals", () => {
    render(<ProvidersPageClient initial={initial} fetchImpl={vi.fn() as unknown as typeof fetch} />);

    expect(screen.getByTestId("tab-providers")).toHaveTextContent("Providers");
    expect(screen.getByTestId("tab-plans")).toHaveTextContent("Plans");
    expect(screen.getByTestId("tab-quotas")).toHaveTextContent("Quotas");
    expect(screen.getByTestId("tab-renewals")).toHaveTextContent("Renewals");

    const tabs = within(screen.getByTestId("providers-tabs")).getAllByRole("tab");
    expect(tabs).toHaveLength(4);
  });

  it("shows provider cards on the Providers tab", () => {
    render(<ProvidersPageClient initial={initial} fetchImpl={vi.fn() as unknown as typeof fetch} />);
    const cards = screen.getAllByTestId("provider-card");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("switches to Plans, Quotas, and Renewals tabs", () => {
    render(<ProvidersPageClient initial={initial} fetchImpl={vi.fn() as unknown as typeof fetch} />);

    fireEvent.click(screen.getByTestId("tab-plans"));
    expect(screen.getByTestId("plans-tab")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT Plus")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tab-quotas"));
    expect(screen.getByTestId("quotas-tab")).toBeInTheDocument();
    expect(screen.getAllByText("Maximum allowance").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("tab-renewals"));
    expect(screen.getByTestId("renewals-tab")).toBeInTheDocument();
    expect(screen.getByTestId("renewals-list")).toBeInTheDocument();
  });
});

describe("QuotaProgress", () => {
  it("renders is_unlimited quota without a percentage", () => {
    render(<QuotaProgress quota={unlimitedQuota} />);
    const root = screen.getByTestId("quota-progress");
    expect(root).toHaveAttribute("data-state", "unlimited");
    const value = screen.getByTestId("progress-bar-value");
    expect(value).toHaveTextContent("∞");
    expect(value.textContent ?? "").not.toMatch(/%/);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Unlimited");
  });

  it('renders null remaining as "not recorded" rather than a full or empty bar', () => {
    render(<QuotaProgress quota={unknownRemainingQuota} />);
    const root = screen.getByTestId("quota-progress");
    expect(root).toHaveAttribute("data-state", "unknown");
    expect(screen.getByTestId("quota-progress-value")).toHaveTextContent("not recorded");
    // No ProgressBar fill — only empty track
    expect(screen.getByTestId("quota-progress-track-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();
    const text = root.textContent ?? "";
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/0\s*\/\s*0/);
  });

  it("renders finite remaining with ProgressBar value/max", () => {
    render(<QuotaProgress quota={finiteQuota} />);
    expect(screen.getByTestId("quota-progress")).toHaveAttribute("data-state", "finite");
    expect(screen.getByTestId("progress-bar-value")).toHaveTextContent("42 / 100");
  });
});

describe("Renewals list sorting", () => {
  it("sorts by date across all four kinds", () => {
    const sorted = sortRenewals(renewals);
    expect(sorted.map((r) => r.kind)).toEqual([
      "trial_expiration",
      "subscription_renewal",
      "promotional_price_expiration",
      "manual_review",
    ]);
    expect(sorted.map((r) => r.date)).toEqual([
      "2026-08-01",
      "2026-08-06",
      "2026-08-15",
      "2026-09-01",
    ]);

    // Also verify the rendered list order
    render(<RenewalsTab renewals={renewals} />);
    const rows = screen.getAllByTestId("renewal-row");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveAttribute("data-kind", "trial_expiration");
    expect(rows[0]).toHaveAttribute("data-date", "2026-08-01");
    expect(rows[1]).toHaveAttribute("data-kind", "subscription_renewal");
    expect(rows[2]).toHaveAttribute("data-kind", "promotional_price_expiration");
    expect(rows[3]).toHaveAttribute("data-kind", "manual_review");
    expect(rows[3]).toHaveAttribute("data-date", "2026-09-01");

    // Kind labels visible
    expect(screen.getByText("Trial expiration")).toBeInTheDocument();
    expect(screen.getByText("Subscription renewal")).toBeInTheDocument();
    expect(screen.getByText("Promotional price expiration")).toBeInTheDocument();
    expect(screen.getByText("Manual review")).toBeInTheDocument();
  });
});
