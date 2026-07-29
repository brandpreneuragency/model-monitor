/** @jsxImportSource react */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer } from "@model-monitor/ui";
import { ModelDrawer, DRAWER_TABS } from "./model-drawer";
import { RankingsTab } from "./rankings-tab";
import { ResearchTab } from "./research-tab";
import type { ModelDrawerData } from "./types";

const fixture: ModelDrawerData = {
  model: {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Claude Sonnet 5",
    canonicalId: "claude-sonnet-5",
    developerName: "Anthropic",
    creator: { name: "Anthropic" },
    workflowStatus: "active",
    lifecycle: "flagship",
    isFavourite: false,
    bestUse: "Complex reasoning and coding",
    avoidFor: "Real-time data",
    description: "Go-to for serious work",
    personalNotes: "Go-to for serious work",
    family: "Claude",
    generation: "4",
    releaseDate: "2025-01-01",
    knowledgeCutoff: "2025-06",
    contextTokens: 200_000,
    maxOutputTokens: 32_000,
    modelType: "chat",
    overallScore: null,
    capabilities: {
      vision: true,
      reasoning: true,
      toolUse: true,
      parallelAgents: true,
      imageInput: true,
      display: { vision: "yes", reasoning: "excellent", toolUse: "yes" },
    },
    tags: [{ name: "coding" }],
    needsRecheck: true,
    verificationStatus: "partial",
  },
  accessRoutes: [
    {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      providerName: "Anthropic",
      planName: "Pro",
      accessType: "api",
      accessMethod: "api",
      providerModelId: "claude-sonnet-5",
      availability: "available",
      isPreferred: true,
      pricingSummary: "$3 / 1M tok",
      quotaSummary: "Unlimited",
      notes: "Primary route",
    },
  ],
  ratings: [
    {
      skillId: "skill-coding",
      skillName: "Coding",
      skillSlug: "coding",
      personalScore: null,
      personalConfidence: null,
      externalScore: 9.2,
      externalRank: 3,
      externalConfidence: null,
      tested: false,
      rankingPosition: "3rd",
    },
    {
      skillId: "skill-reasoning",
      skillName: "Reasoning",
      skillSlug: "reasoning",
      personalScore: null,
      personalConfidence: null,
      externalScore: null,
      externalRank: null,
      externalConfidence: null,
      tested: false,
      rankingPosition: null,
    },
  ],
  benchmarks: [
    {
      id: "bench-1",
      benchmarkName: "SWE-bench",
      setting: "verified",
      harness: "official",
      scoreDisplay: "72.4",
      verifiedAt: "2026-01-15T00:00:00.000Z",
    },
  ],
  sources: [
    {
      id: "src-1",
      title: "Model card",
      sourceType: "official",
      url: "https://example.com/model",
      verifiedAt: "2026-01-10T00:00:00.000Z",
    },
  ],
};

describe("ModelDrawer", () => {
  it("renders five tabs with the expected labels", () => {
    render(<ModelDrawer data={fixture} />);

    const tablist = screen.getByTestId("model-drawer-tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(DRAWER_TABS).toHaveLength(5);

    for (const t of DRAWER_TABS) {
      expect(
        screen.getByTestId(`model-drawer-tab-${t.id}`),
      ).toHaveTextContent(t.label);
    }

    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Access & Cost")).toBeTruthy();
    expect(screen.getByText("Rankings")).toBeTruthy();
    expect(screen.getByText("Specifications")).toBeTruthy();
    expect(screen.getByText("Research")).toBeTruthy();
  });

  it("Rankings tab shows personal and external in separate columns, never merged", async () => {
    const user = userEvent.setup();
    render(<ModelDrawer data={fixture} defaultTab="rankings" />);

    // Ensure rankings visible
    await user.click(screen.getByTestId("model-drawer-tab-rankings"));

    expect(screen.getByTestId("rankings-col-personal")).toHaveTextContent(
      "Personal",
    );
    expect(screen.getByTestId("rankings-col-external")).toHaveTextContent(
      "External",
    );

    const personalCells = screen.getAllByTestId("rankings-personal-cell");
    const externalCells = screen.getAllByTestId("rankings-external-cell");
    expect(personalCells.length).toBeGreaterThan(0);
    expect(externalCells.length).toBe(personalCells.length);

    // Seeded personal scores empty → untested labels present
    const untested = screen.getAllByTestId("rankings-untested-label");
    expect(untested.length).toBeGreaterThan(0);

    // No merged single-score column or blended value attribute
    expect(screen.queryByTestId("rankings-col-merged")).toBeNull();
    expect(screen.queryByTestId("rankings-merged-cell")).toBeNull();
    expect(screen.getByTestId("rankings-no-merged-score")).toBeTruthy();

    // Personal cells must not contain the external numeric as a blended label
    for (const cell of personalCells) {
      expect(cell.getAttribute("data-merged")).toBeNull();
      // ScoreCell untested for personal
      const score = within(cell).getByTestId("score-cell");
      expect(score).toHaveAttribute("data-untested", "true");
    }

    // External column can show a value for coding without affecting personal
    const codingRow = screen.getByTestId("rankings-row-coding");
    const ext = within(codingRow).getByTestId("rankings-external-cell");
    expect(within(ext).getByTestId("score-cell")).toHaveTextContent("9.2");
    const pers = within(codingRow).getByTestId("rankings-personal-cell");
    expect(within(pers).getByTestId("score-cell")).toHaveAttribute(
      "data-untested",
      "true",
    );
  });

  it("RankingsTab alone never exposes a merged score field", () => {
    render(
      <RankingsTab
        ratings={[
          {
            skillId: "s1",
            skillName: "Coding",
            skillSlug: "coding",
            personalScore: 8,
            personalConfidence: "high",
            externalScore: 9,
            externalRank: 2,
            externalConfidence: null,
            tested: true,
            rankingPosition: "2nd",
          },
        ]}
      />,
    );
    expect(screen.getByTestId("rankings-col-personal")).toBeTruthy();
    expect(screen.getByTestId("rankings-col-external")).toBeTruthy();
    expect(screen.queryByTestId("rankings-col-merged")).toBeNull();
    expect(screen.queryByTestId("rankings-merged-cell")).toBeNull();
    // Two distinct score cells — never one blended value
    const scores = screen.getAllByTestId("score-cell");
    expect(scores.length).toBe(2);
    expect(scores[0]).toHaveTextContent("8");
    expect(scores[1]).toHaveTextContent("9");
    expect(scores[0]?.textContent).not.toBe(scores[1]?.textContent);
  });

  it("Research tab starts collapsed", () => {
    render(<ModelDrawer data={fixture} defaultTab="research" />);
    const toggle = screen.getByTestId("research-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("research-collapsed-hint")).toBeTruthy();
    expect(screen.queryByTestId("research-content")).toBeNull();
  });

  it("ResearchTab defaultOpen=false hides content until expanded", async () => {
    const user = userEvent.setup();
    render(
      <ResearchTab
        benchmarks={fixture.benchmarks}
        sources={fixture.sources}
        model={fixture.model}
      />,
    );
    expect(screen.getByTestId("research-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("research-content")).toBeNull();
    await user.click(screen.getByTestId("research-toggle"));
    expect(screen.getByTestId("research-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByTestId("research-content")).toBeTruthy();
  });

  it("Escape closes the drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Claude Sonnet 5">
        <ModelDrawer data={fixture} />
      </Drawer>,
    );

    expect(screen.getByTestId("drawer")).toBeInTheDocument();
    expect(screen.getByTestId("model-drawer")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
