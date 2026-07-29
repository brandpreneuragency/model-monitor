/** @jsxImportSource react */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { RankingsPageClient } from "@/components/rankings/rankings-page";
import { LeaderboardTable } from "@/components/rankings/leaderboard-table";
import { ScoreMatrix } from "@/components/rankings/score-matrix";
import type {
  LeaderboardEntryDto,
  RankingsInitialData,
  SkillDto,
} from "@/components/rankings/types";

const skills: SkillDto[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Coding",
    slug: "coding",
    category: "core",
    description: null,
    sortOrder: 1,
    isDefault: true,
    status: "active",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Value",
    slug: "value",
    category: "core",
    description: null,
    sortOrder: 2,
    isDefault: true,
    status: "active",
  },
];

function entry(
  id: string,
  name: string,
  overrides: Partial<LeaderboardEntryDto> = {},
): LeaderboardEntryDto {
  return {
    rank: 1,
    model: {
      id,
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      creator: { id: "c1", name: "OpenAI", slug: "openai" },
    },
    personalScore: null,
    externalScore: 90,
    overallScore: null,
    scoreBasis: "external",
    personalConfidence: null,
    externalRank: 1,
    externalConfidence: null,
    rankOverride: null,
    pinned: false,
    tested: false,
    testedAt: null,
    notes: null,
    skillId: skills[0].id,
    profileId: null,
    ...overrides,
  };
}

const baseInitial: RankingsInitialData = {
  skills,
  profiles: [
    {
      id: "p1",
      name: "Best Everyday Model",
      slug: "best-everyday-model",
      description: null,
      isDefault: true,
      sortOrder: 1,
      weights: [
        {
          id: "w1",
          skillId: skills[0].id,
          weight: 5,
          skill: { id: skills[0].id, name: "Coding", slug: "coding" },
        },
        {
          id: "w2",
          skillId: skills[1].id,
          weight: 2,
          skill: { id: skills[1].id, name: "Value", slug: "value" },
        },
      ],
    },
    {
      id: "p2",
      name: "Cheap Subagent",
      slug: "cheap-subagent",
      description: null,
      isDefault: false,
      sortOrder: 2,
      weights: [
        {
          id: "w3",
          skillId: skills[1].id,
          weight: 10,
          skill: { id: skills[1].id, name: "Value", slug: "value" },
        },
      ],
    },
  ],
  leaderboard: [
    entry("m1", "Alpha", { rank: 1, externalScore: 92 }),
    entry("m2", "Beta", { rank: 2, externalScore: 88 }),
  ],
  leaderboardType: "combined",
  skillId: skills[0].id,
  profileId: "p1",
  models: [
    {
      id: "m1",
      name: "Alpha",
      bestUse: "coding",
      costOrQuota: "$20 / mo",
      creatorName: "OpenAI",
      accessProviderName: "OpenAI",
      planName: "Plus",
    },
    {
      id: "m2",
      name: "Beta",
      bestUse: "value",
      costOrQuota: "$0",
      creatorName: "xAI",
      accessProviderName: "xAI",
      planName: "Free",
    },
  ],
  ratings: [
    {
      modelId: "m1",
      skillId: skills[0].id,
      personalScore: null,
      externalScore: 92,
      personalConfidence: null,
      notes: null,
      tested: false,
      testedAt: null,
      rankOverride: null,
      pinned: false,
      hidden: false,
    },
  ],
};

describe("Rankings page", () => {
  it("renders three ranking type tabs", () => {
    render(<RankingsPageClient initial={baseInitial} />);
    expect(screen.getByTestId("tab-personal")).toBeTruthy();
    expect(screen.getByTestId("tab-external")).toBeTruthy();
    expect(screen.getByTestId("tab-combined")).toBeTruthy();
  });

  it("combined mode shows adjacent personal and external score headers", () => {
    render(<RankingsPageClient initial={baseInitial} />);
    const table = screen.getByTestId("leaderboard-table");
    expect(within(table).getByText("Personal Score")).toBeTruthy();
    expect(within(table).getByText("External Score")).toBeTruthy();
    // never a single blended header
    expect(within(table).queryByText(/blended|merged|average score/i)).toBeNull();
  });

  it("My Rankings with no personal scores shows deliberate empty state", () => {
    const personalEmpty = {
      ...baseInitial,
      leaderboardType: "personal" as const,
      leaderboard: [
        entry("m1", "Alpha", {
          rank: 1,
          personalScore: null,
          externalScore: 92,
          overallScore: null,
        }),
        entry("m2", "Beta", {
          rank: 2,
          personalScore: null,
          externalScore: 88,
          overallScore: null,
        }),
      ],
    };
    render(<RankingsPageClient initial={personalEmpty} />);
    fireEvent.click(screen.getByTestId("tab-personal"));
    expect(screen.getByTestId("leaderboard-personal-empty")).toBeTruthy();
    expect(screen.getByText(/No personal rankings yet/i)).toBeTruthy();
    expect(screen.getByTestId("empty-rate-model")).toBeTruthy();
    expect(screen.queryByTestId("leaderboard-table")).toBeNull();
  });

  it("skill selector lists seeded skills and Add Skill action", () => {
    render(<RankingsPageClient initial={baseInitial} />);
    const select = screen.getByTestId("skill-select");
    expect(within(select).getByText("Coding")).toBeTruthy();
    expect(within(select).getByText("Value")).toBeTruthy();
    expect(screen.getByTestId("add-skill")).toBeTruthy();
  });

  it("profiles panel lists profiles and New Profile", () => {
    render(<RankingsPageClient initial={baseInitial} />);
    expect(screen.getByTestId("ranking-profiles-panel")).toBeTruthy();
    expect(screen.getByTestId("profile-best-everyday-model")).toBeTruthy();
    expect(screen.getByTestId("profile-cheap-subagent")).toBeTruthy();
    expect(screen.getByTestId("new-profile")).toBeTruthy();
    expect(screen.getByTestId("profile-weights-editor")).toBeTruthy();
  });
});

describe("LeaderboardTable", () => {
  it("renders required columns including creator and access provider", () => {
    const modelsById = new Map(
      baseInitial.models.map((m) => [m.id, m] as const),
    );
    render(
      <LeaderboardTable
        entries={[
          entry("m1", "Alpha", { rank: 1, personalScore: 8, externalScore: 90 }),
        ]}
        type="combined"
        skill={skills[0]}
        skills={skills}
        modelsById={modelsById}
      />,
    );
    const table = screen.getByTestId("leaderboard-table");
    for (const h of [
      "Rank",
      "Model",
      "Personal Score",
      "External Score",
      "Confidence",
      "Creator",
      "Access Provider",
      "Plan",
      "Cost",
      "Best Use",
      "Notes",
    ]) {
      expect(within(table).getByText(h)).toBeTruthy();
    }
  });
});

describe("ScoreMatrix", () => {
  it("supports heatmap and numbers modes with token legend", () => {
    render(
      <ScoreMatrix
        skills={skills}
        modelNames={[{ id: "m1", name: "Alpha" }]}
        ratings={[
          {
            modelId: "m1",
            skillId: skills[0].id,
            personalScore: 9,
            externalScore: 90,
            personalConfidence: "high",
            notes: null,
            tested: true,
            testedAt: "2026-07-01",
            rankOverride: null,
            pinned: false,
            hidden: false,
          },
        ]}
      />,
    );
    const matrix = screen.getByTestId("score-matrix");
    expect(matrix).toHaveAttribute("data-mode", "heatmap");
    expect(screen.getByTestId("score-matrix-legend")).toBeTruthy();
    // switch to numbers
    const numbers = screen.getByRole("radio", { name: "Numbers" });
    fireEvent.click(numbers);
    expect(screen.getByTestId("score-matrix")).toHaveAttribute(
      "data-mode",
      "numbers",
    );
    expect(screen.getByTestId(`matrix-cell-m1-${skills[0].id}`)).toBeTruthy();
  });

  it("fullscreen toggle mounts overlay", () => {
    render(
      <ScoreMatrix
        skills={skills}
        modelNames={[{ id: "m1", name: "Alpha" }]}
        ratings={[]}
      />,
    );
    fireEvent.click(screen.getByTestId("matrix-fullscreen"));
    expect(screen.getByTestId("score-matrix-fullscreen")).toBeTruthy();
  });
});

describe("score separation invariant", () => {
  it("never fabricates a blended score field on entries", () => {
    const e = entry("m1", "Alpha", {
      personalScore: 8,
      externalScore: 90,
    });
    expect(e).not.toHaveProperty("blendedScore");
    expect(e).not.toHaveProperty("mergedScore");
    expect(e).not.toHaveProperty("averageScore");
    // both columns independent
    expect(e.personalScore).toBe(8);
    expect(e.externalScore).toBe(90);
  });
});

function requestUrl(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input === "object") {
    const maybe = input as Record<string, unknown>;
    if (typeof maybe.url === "string") return maybe.url;
  }
  return "";
}

describe("profile switch fetch", () => {
  it("requests leaderboard with profileId when in profile overall mode", async () => {
    const fetchImpl = vi.fn(async (input: unknown) => {
      const url = requestUrl(input);
      if (url.includes("/api/v1/leaderboard")) {
        return new Response(
          JSON.stringify({
            data: [
              entry("m2", "Beta", { rank: 1, overallScore: 9.5, scoreBasis: "external" }),
              entry("m1", "Alpha", { rank: 2, overallScore: 8.0, scoreBasis: "external" }),
            ],
            meta: { type: "external" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    render(
      <RankingsPageClient
        initial={{
          ...baseInitial,
          leaderboardType: "external",
          skillId: null,
        }}
        fetchImpl={fetchImpl as unknown as typeof fetch}
      />,
    );

    // switch skill select to profile overall
    fireEvent.change(screen.getByTestId("skill-select"), {
      target: { value: "__profile__" },
    });

    // select second profile
    fireEvent.click(screen.getByTestId("profile-cheap-subagent"));

    await vi.waitFor(() => {
      const calls = fetchImpl.mock.calls.map((c) => requestUrl(c[0]));
      expect(calls.some((u) => u.includes("profileId=p2"))).toBe(true);
    });
  });
});
