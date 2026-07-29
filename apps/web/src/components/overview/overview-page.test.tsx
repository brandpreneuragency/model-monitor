/** @jsxImportSource react */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OverviewPageClient } from "@/components/overview/overview-page";
import { SummaryCards } from "@/components/overview/summary-cards";
import { AccessOverview } from "@/components/overview/access-overview";
import { SkillLeaders } from "@/components/overview/skill-leaders";
import { ProviderDistribution } from "@/components/overview/provider-distribution";
import { OverviewScatter } from "@/components/overview/overview-scatter";
import { QuotaSummary } from "@/components/overview/quota-summary";
import { RecentUpdated } from "@/components/overview/recent-updated";
import type { OverviewInitialData } from "@/components/overview/types";
import { SCATTER_AXIS_PAIRS } from "@/components/rankings/ranking-scatter";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const summaryFixture: NonNullable<OverviewInitialData["summary"]> = {
  activeModels: { value: 12, trend: [8, 10, 12] },
  providers: { value: 5, active: 4, trend: [3, 4, 5] },
  paidPlans: {
    value: 3,
    monthlyTotal: 50,
    currency: "USD",
    trend: [2, 3, 3],
    subtitle: "USD 50 / month",
  },
  needsReview: { value: 2, trend: [1, 2], subtitle: "Models" },
};

const accessFixture: OverviewInitialData["access"] = [
  {
    planId: "p1111111-1111-1111-1111-111111111111",
    planName: "OpenCode Go",
    planSlug: "opencode-go",
    status: "active",
    monthlyCost: 10,
    currency: "USD",
    availableModels: 13,
    provider: {
      id: "a1111111-1111-1111-1111-111111111111",
      name: "OpenCode",
      slug: "opencode",
      logoUrl: null,
      colour: null,
    },
    mainQuota: {
      id: "q1111111-1111-1111-1111-111111111111",
      name: "5-hour window",
      amount: 90,
      remainingAmount: 42,
      unit: "requests",
      period: "five_hour_window",
      resetsAt: null,
      resetBehaviour: null,
      isUnlimited: false,
    },
    accessType: "subscription",
  },
];

const skillFixture: OverviewInitialData["skillLeaders"] = [
  {
    key: "best-overall",
    label: "Best Overall",
    skillId: null,
    skillSlug: null,
    profileId: "prof-1",
    profileSlug: "best-everyday",
    leaders: [
      {
        rank: 1,
        model: {
          id: "m1111111-1111-1111-1111-111111111111",
          name: "Model Alpha",
          slug: "model-alpha",
          creator: {
            id: "c1",
            name: "Acme",
            slug: "acme",
          },
        },
        personalScore: null,
        externalScore: 9.4,
        overallScore: 9.4,
        scoreBasis: "external",
        pinned: false,
        rankOverride: null,
      },
      {
        rank: 2,
        model: {
          id: "m2222222-2222-2222-2222-222222222222",
          name: "Model Beta",
          slug: "model-beta",
          creator: null,
        },
        personalScore: null,
        externalScore: 9.1,
        overallScore: 9.1,
        scoreBasis: "external",
        pinned: false,
        rankOverride: null,
      },
      {
        rank: 3,
        model: {
          id: "m3333333-3333-3333-3333-333333333333",
          name: "Model Gamma",
          slug: "model-gamma",
          creator: null,
        },
        personalScore: null,
        externalScore: 8.7,
        overallScore: 8.7,
        scoreBasis: "external",
        pinned: false,
        rankOverride: null,
      },
    ],
  },
  {
    key: "coding",
    label: "Coding",
    skillId: "s-coding",
    skillSlug: "coding",
    profileId: null,
    profileSlug: null,
    leaders: [
      {
        rank: 1,
        model: {
          id: "m4444444-4444-4444-4444-444444444444",
          name: "Coder One",
          slug: "coder-one",
          creator: null,
        },
        personalScore: null,
        externalScore: 100,
        overallScore: null,
        scoreBasis: "external",
        pinned: false,
        rankOverride: null,
      },
    ],
  },
];

const distFixture: OverviewInitialData["providerDistribution"] = [
  {
    providerId: "a1111111-1111-1111-1111-111111111111",
    providerName: "OpenCode",
    providerSlug: "opencode",
    logoUrl: null,
    colour: null,
    modelCount: 13,
  },
  {
    providerId: "a2222222-2222-2222-2222-222222222222",
    providerName: "Anthropic",
    providerSlug: "anthropic",
    logoUrl: null,
    colour: null,
    modelCount: 8,
  },
];

const quotaFixture: OverviewInitialData["quotas"] = [
  {
    planId: "p1111111-1111-1111-1111-111111111111",
    planName: "OpenCode Go",
    planSlug: "opencode-go",
    provider: {
      id: "a1111111-1111-1111-1111-111111111111",
      name: "OpenCode",
      slug: "opencode",
      logoUrl: null,
      colour: null,
    },
    quotas: [
      {
        id: "q1111111-1111-1111-1111-111111111111",
        name: "5-hour window",
        amount: 90,
        amountMin: null,
        amountMax: null,
        remainingAmount: 42,
        remainingUpdatedAt: null,
        unit: "requests",
        customUnit: null,
        period: "five_hour_window",
        resetsAt: null,
        resetBehaviour: null,
        isUnlimited: false,
      },
    ],
  },
];

const recentFixture: OverviewInitialData["recent"] = [
  {
    entityType: "model",
    entityId: "m1111111-1111-1111-1111-111111111111",
    title: "Model Alpha",
    subtitle: "Updated notes",
    updatedAt: "2026-07-12T10:00:00.000Z",
  },
];

const scatterFixture: OverviewInitialData["scatterPoints"] = [
  {
    modelId: "m1111111-1111-1111-1111-111111111111",
    modelName: "Model Alpha",
    modelSlug: "model-alpha",
    x: 3,
    y: 9.4,
    provider: null,
    modelType: "chat",
  },
  {
    modelId: "m2222222-2222-2222-2222-222222222222",
    modelName: "Model Beta",
    modelSlug: "model-beta",
    x: 1,
    y: 8.1,
    provider: null,
    modelType: "chat",
  },
];

function fullInitial(
  overrides: Partial<OverviewInitialData> = {},
): OverviewInitialData {
  return {
    summary: summaryFixture,
    access: accessFixture,
    skillLeaders: skillFixture,
    providerDistribution: distFixture,
    quotas: quotaFixture,
    recent: recentFixture,
    scatterPoints: scatterFixture,
    scatterX: "cost",
    scatterY: "capability",
    ...overrides,
  };
}

describe("Overview page sections from API data", () => {
  it("renders each section from provided API-shaped data", () => {
    render(<OverviewPageClient initial={fullInitial()} />);

    expect(screen.getByTestId("overview-page")).toBeTruthy();
    expect(screen.getByTestId("overview-summary-cards")).toBeTruthy();
    expect(screen.getByTestId("kpi-active-models-value").textContent).toBe("12");
    expect(screen.getByTestId("kpi-providers-value").textContent).toBe("5");
    expect(screen.getByTestId("kpi-paid-plans-value").textContent).toBe("3");
    expect(screen.getByTestId("kpi-needs-review-value").textContent).toBe("2");

    expect(screen.getByTestId("overview-access")).toBeTruthy();
    expect(screen.getAllByText("OpenCode Go").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("access-card-models").textContent).toMatch(/13/);

    expect(screen.getByTestId("overview-skill-leaders")).toBeTruthy();
    expect(screen.getAllByText("Model Alpha").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByTestId("overview-provider-distribution")).toBeTruthy();
    const bars = screen.getAllByTestId("provider-bar-row");
    expect(bars).toHaveLength(2);
    expect(bars[0]?.getAttribute("data-count")).toBe("13");

    expect(screen.getByTestId("overview-scatter")).toBeTruthy();
    expect(screen.getByTestId("overview-scatter").getAttribute("data-point-count")).toBe(
      "2",
    );

    expect(screen.getByTestId("overview-quota-summary")).toBeTruthy();
    expect(screen.getByTestId("quota-row-values").textContent).toMatch(/42/);

    expect(screen.getByTestId("overview-recent")).toBeTruthy();
    expect(screen.getByText("Updated notes")).toBeTruthy();
  });

  it("summary empty state does not invent chart series numbers", () => {
    render(<SummaryCards summary={null} />);
    expect(screen.getByTestId("overview-summary-cards").getAttribute("data-empty")).toBe(
      "true",
    );
    expect(screen.getByTestId("kpi-active-models-value").textContent).toBe("—");
    // Sparkline still mounts with empty values — no numeric fixture series in DOM values
    expect(screen.getByTestId("kpi-active-models-spark")).toBeTruthy();
  });

  it("access section empty state (no zeroed cards)", () => {
    render(<AccessOverview cards={[]} />);
    expect(screen.getByTestId("overview-access-empty")).toBeTruthy();
    expect(screen.queryByTestId("overview-access-card")).toBeNull();
  });

  it("skill leaders empty state", () => {
    render(<SkillLeaders categories={[]} />);
    expect(screen.getByTestId("overview-skill-leaders-empty")).toBeTruthy();
  });

  it("skill chip switches top-three list", () => {
    render(<SkillLeaders categories={skillFixture} />);
    expect(screen.getByText("Model Alpha")).toBeTruthy();
    fireEvent.click(screen.getByTestId("skill-chip-coding"));
    expect(screen.getByTestId("skill-leaders-list").getAttribute("data-category")).toBe(
      "coding",
    );
    expect(screen.getByText("Coder One")).toBeTruthy();
  });

  it("provider distribution empty state (no zeroed bars)", () => {
    render(<ProviderDistribution items={[]} />);
    expect(screen.getByTestId("overview-provider-distribution-empty")).toBeTruthy();
    expect(screen.queryByTestId("provider-bar-row")).toBeNull();
  });

  it("quota summary empty state", () => {
    render(<QuotaSummary items={[]} />);
    expect(screen.getByTestId("overview-quota-summary-empty")).toBeTruthy();
  });

  it("recent empty state", () => {
    render(<RecentUpdated items={[]} />);
    expect(screen.getByTestId("overview-recent-empty")).toBeTruthy();
  });

  it("scatter empty state rather than zeroed chart", () => {
    render(<OverviewScatter points={[]} />);
    expect(screen.getByTestId("overview-scatter-empty")).toBeTruthy();
    expect(screen.queryByTestId("overview-scatter-chart")).toBeNull();
  });
});

describe("Overview scatter axis selector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("changes requested x/y query parameters when selector changes", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              modelId: "m1111111-1111-1111-1111-111111111111",
              modelName: "Model Alpha",
              modelSlug: "model-alpha",
              x: 8,
              y: 9,
              provider: null,
              modelType: null,
            },
          ],
        }),
        status: 200,
      } as Response;
    });

    render(
      <OverviewScatter
        initialPoints={scatterFixture}
        initialX="cost"
        initialY="capability"
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    expect(screen.getByTestId("overview-scatter").getAttribute("data-pair")).toBe(
      "capability-vs-cost",
    );

    const select = screen.getByTestId("overview-scatter-axis-select");
    const codingPair = SCATTER_AXIS_PAIRS.find((p) => p.id === "coding-vs-speed");
    expect(codingPair).toBeTruthy();

    fireEvent.change(select, { target: { value: "coding-vs-speed" } });

    await waitFor(() => {
      expect(fetchImpl).toHaveBeenCalled();
    });

    const lastCall = fetchImpl.mock.calls.at(-1)?.[0];
    const calledUrl =
      typeof lastCall === "string"
        ? lastCall
        : lastCall instanceof URL
          ? lastCall.toString()
          : lastCall instanceof Request
            ? lastCall.url
            : "";
    expect(calledUrl).toContain("/api/v1/overview/scatter?");
    expect(calledUrl).toContain("x=coding");
    expect(calledUrl).toContain("y=speed");
    expect(screen.getByTestId("overview-scatter").getAttribute("data-pair")).toBe(
      "coding-vs-speed",
    );
  });
});

describe("Overview page composition empty", () => {
  it("renders empty states for every section when initial is empty", () => {
    render(
      <OverviewPageClient
        initial={{
          summary: null,
          access: [],
          skillLeaders: [],
          providerDistribution: [],
          quotas: [],
          recent: [],
          scatterPoints: [],
        }}
      />,
    );

    expect(screen.getByTestId("overview-access-empty")).toBeTruthy();
    expect(screen.getByTestId("overview-skill-leaders-empty")).toBeTruthy();
    expect(screen.getByTestId("overview-provider-distribution-empty")).toBeTruthy();
    expect(screen.getByTestId("overview-quota-summary-empty")).toBeTruthy();
    expect(screen.getByTestId("overview-recent-empty")).toBeTruthy();
    expect(screen.getByTestId("overview-scatter-empty")).toBeTruthy();
  });
});
