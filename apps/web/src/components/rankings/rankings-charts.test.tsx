/** @jsxImportSource react */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  SkillRadar,
  buildRadarChartData,
  defaultTopIds,
  radarScoreTen,
} from "@/components/rankings/skill-radar";
import {
  RankingScatter,
  omitIncompleteScatterPoints,
} from "@/components/rankings/ranking-scatter";
import type { RatingCell, SkillDto } from "@/components/rankings/types";

const skills: SkillDto[] = [
  {
    id: "s-coding",
    name: "Coding",
    slug: "coding",
    category: "core",
    description: null,
    sortOrder: 1,
    isDefault: true,
    status: "active",
  },
  {
    id: "s-value",
    name: "Value",
    slug: "value",
    category: "core",
    description: null,
    sortOrder: 2,
    isDefault: true,
    status: "active",
  },
  {
    id: "s-speed",
    name: "Speed",
    slug: "speed",
    category: "core",
    description: null,
    sortOrder: 3,
    isDefault: true,
    status: "active",
  },
];

const candidates = [
  { id: "m1", name: "Alpha" },
  { id: "m2", name: "Beta" },
  { id: "m3", name: "Gamma" },
  { id: "m4", name: "Delta" },
];

function rating(
  modelId: string,
  skillId: string,
  external: number | null,
  personal: number | null = null,
): RatingCell {
  return {
    modelId,
    skillId,
    personalScore: personal,
    externalScore: external,
    personalConfidence: null,
    notes: null,
    tested: false,
    testedAt: null,
    rankOverride: null,
    pinned: false,
    hidden: false,
  };
}

const ratings: RatingCell[] = [
  rating("m1", "s-coding", 92, 9.2),
  rating("m1", "s-value", 80, 8.0),
  rating("m1", "s-speed", 70, 7.0),
  rating("m2", "s-coding", 88, 8.8),
  rating("m2", "s-value", 85, 8.5),
  rating("m2", "s-speed", 90, 9.0),
  rating("m3", "s-coding", 75, null),
  rating("m3", "s-value", 70, null),
  rating("m3", "s-speed", 95, null),
  rating("m4", "s-coding", 60, 6.0),
  rating("m4", "s-value", 65, 6.5),
  rating("m4", "s-speed", 55, 5.5),
];

describe("radarScoreTen / buildRadarChartData", () => {
  it("never coerces missing scores to zero", () => {
    expect(radarScoreTen(null, null, "combined")).toBeNull();
    expect(radarScoreTen(null, 80, "external")).toBe(8);
    expect(radarScoreTen(9, null, "personal")).toBe(9);
  });

  it("builds one value column per selected model", () => {
    const models = candidates.slice(0, 3);
    const data = buildRadarChartData(skills, models, ratings, "external");
    expect(data.length).toBe(skills.length);
    for (const row of data) {
      expect(row).toHaveProperty("m1");
      expect(row).toHaveProperty("m2");
      expect(row).toHaveProperty("m3");
      expect(row).not.toHaveProperty("m4");
    }
  });
});

describe("SkillRadar", () => {
  it("renders one series marker per selected model", () => {
    render(
      <SkillRadar
        skills={skills}
        ratings={ratings}
        candidates={candidates}
        selectedIds={["m1", "m2", "m3"]}
        type="external"
      />,
    );

    const root = screen.getByTestId("skill-radar");
    expect(root).toHaveAttribute("data-series-count", "3");
    expect(screen.getByTestId("radar-series-m1")).toBeTruthy();
    expect(screen.getByTestId("radar-series-m2")).toBeTruthy();
    expect(screen.getByTestId("radar-series-m3")).toBeTruthy();
    expect(screen.queryByTestId("radar-series-m4")).toBeNull();
    expect(screen.queryByTestId("skill-radar-empty")).toBeNull();
  });

  it("shows empty state when fewer than two models are selected", () => {
    render(
      <SkillRadar
        skills={skills}
        ratings={ratings}
        candidates={candidates}
        selectedIds={["m1"]}
        type="external"
      />,
    );

    expect(screen.getByTestId("skill-radar")).toHaveAttribute(
      "data-series-count",
      "1",
    );
    expect(screen.getByTestId("skill-radar-empty")).toBeTruthy();
    expect(screen.getByText(/Select at least two models/i)).toBeTruthy();
    expect(screen.queryByTestId("radar-chart-wrap")).toBeNull();
  });

  it("shows empty state for zero selection", () => {
    render(
      <SkillRadar
        skills={skills}
        ratings={ratings}
        candidates={candidates}
        selectedIds={[]}
        type="external"
      />,
    );
    expect(screen.getByTestId("skill-radar-empty")).toBeTruthy();
  });

  it("top-N shortcut selects that many series", () => {
    render(
      <SkillRadar
        skills={skills}
        ratings={ratings}
        candidates={candidates}
        type="external"
      />,
    );

    // default top 4
    expect(screen.getByTestId("skill-radar")).toHaveAttribute(
      "data-series-count",
      "4",
    );

    fireEvent.change(screen.getByTestId("radar-topn"), {
      target: { value: "2" },
    });
    expect(screen.getByTestId("skill-radar")).toHaveAttribute(
      "data-series-count",
      "2",
    );
    expect(screen.getByTestId("radar-series-m1")).toBeTruthy();
    expect(screen.getByTestId("radar-series-m2")).toBeTruthy();
    expect(screen.queryByTestId("radar-series-m3")).toBeNull();
  });

  it("defaultTopIds respects max four", () => {
    expect(defaultTopIds(candidates, 10)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(defaultTopIds(candidates, 1)).toEqual(["m1"]);
  });
});

describe("omitIncompleteScatterPoints", () => {
  it("omits models missing either axis — never substitutes zero", () => {
    const input = [
      { modelId: "a", modelName: "A", x: 1, y: 2 },
      { modelId: "b", modelName: "B", x: null, y: 5 },
      { modelId: "c", modelName: "C", x: 3, y: null },
      { modelId: "d", modelName: "D", x: undefined, y: undefined },
      { modelId: "e", modelName: "E", x: 0, y: 0 }, // verified zeros kept
    ];
    const out = omitIncompleteScatterPoints(input);
    expect(out.map((p) => p.modelId)).toEqual(["a", "e"]);
    expect(out.find((p) => p.modelId === "b")).toBeUndefined();
    expect(out.find((p) => p.modelId === "c")).toBeUndefined();
    // zeros are valid values when present — only missing is omitted
    expect(out.find((p) => p.modelId === "e")).toEqual({
      modelId: "e",
      modelName: "E",
      x: 0,
      y: 0,
    });
  });
});

describe("RankingScatter", () => {
  it("plots only complete points and lists them for inspection", () => {
    render(
      <RankingScatter
        points={[
          { modelId: "a", modelName: "Alpha", x: 1.5, y: 80 },
          { modelId: "b", modelName: "Beta", x: null, y: 90 },
          { modelId: "c", modelName: "Gamma", x: 2, y: null },
          { modelId: "d", modelName: "Delta", x: 0.5, y: 70 },
        ]}
      />,
    );

    const root = screen.getByTestId("ranking-scatter");
    expect(root).toHaveAttribute("data-point-count", "2");
    expect(screen.getByTestId("scatter-point-a")).toBeTruthy();
    expect(screen.getByTestId("scatter-point-d")).toBeTruthy();
    expect(screen.queryByTestId("scatter-point-b")).toBeNull();
    expect(screen.queryByTestId("scatter-point-c")).toBeNull();
    // Ensure missing models were not zero-plotted as synthetic points
    const list = screen.getByTestId("scatter-point-list");
    expect(list.textContent).toContain("Alpha");
    expect(list.textContent).toContain("Delta");
    expect(list.textContent).not.toContain("Beta");
    expect(list.textContent).not.toContain("Gamma");
  });

  it("shows empty state when every model is missing an axis", () => {
    render(
      <RankingScatter
        points={[
          { modelId: "b", modelName: "Beta", x: null, y: 90 },
          { modelId: "c", modelName: "Gamma", x: 2, y: null },
        ]}
      />,
    );
    expect(screen.getByTestId("ranking-scatter-empty")).toBeTruthy();
    expect(screen.getByTestId("ranking-scatter")).toHaveAttribute(
      "data-point-count",
      "0",
    );
  });

  it("does not fetch when points are injected", async () => {
    const fetchImpl = vi.fn();
    render(
      <RankingScatter
        fetchImpl={fetchImpl as unknown as typeof fetch}
        points={[{ modelId: "a", modelName: "Alpha", x: 1, y: 2 }]}
      />,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
