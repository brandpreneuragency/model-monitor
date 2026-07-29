/** @jsxImportSource react */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  CompareView,
  COMPARE_GROUP_LABELS,
  COMPARE_GROUPS,
  NOT_RECORDED,
  formatCompareValue,
  rowValuesAgree,
  type CompareModelInput,
} from "@/components/models/compare-view";

function model(
  id: string,
  name: string,
  overrides: Partial<CompareModelInput> = {},
): CompareModelInput {
  return {
    id,
    name,
    accessProvider: "OpenAI",
    accessType: "api",
    availability: "available",
    planName: "Pro",
    pricing: "$20/mo",
    quota: "unlimited",
    family: "gpt",
    generation: "5",
    contextTokens: 128_000,
    maxOutputTokens: 16_384,
    speed: "fast",
    modelType: "chat",
    lifecycle: "ga",
    vision: true,
    reasoning: true,
    toolUse: true,
    parallelAgents: false,
    computerUse: false,
    functionCalling: true,
    structuredOutput: true,
    overallScore: 8.5,
    scoreBasis: "personal",
    bestUse: "coding",
    avoidFor: "realtime audio",
    ...overrides,
  };
}

describe("CompareView", () => {
  it("renders two model columns", () => {
    const models = [model("a", "Alpha"), model("b", "Beta")];
    render(<CompareView models={models} />);

    const view = screen.getByTestId("compare-view");
    expect(view).toHaveAttribute("data-model-count", "2");
    expect(screen.getByTestId("compare-col-a")).toHaveTextContent("Alpha");
    expect(screen.getByTestId("compare-col-b")).toHaveTextContent("Beta");
    expect(screen.queryByTestId("compare-col-c")).toBeNull();
    expect(screen.getByTestId("compare-view-count")).toHaveTextContent(
      "2 models",
    );
  });

  it("renders three model columns", () => {
    const models = [
      model("a", "Alpha"),
      model("b", "Beta"),
      model("c", "Gamma"),
    ];
    render(<CompareView models={models} />);
    expect(screen.getByTestId("compare-view")).toHaveAttribute(
      "data-model-count",
      "3",
    );
    expect(screen.getByTestId("compare-col-a")).toBeTruthy();
    expect(screen.getByTestId("compare-col-b")).toBeTruthy();
    expect(screen.getByTestId("compare-col-c")).toBeTruthy();
  });

  it("renders four model columns", () => {
    const models = [
      model("a", "Alpha"),
      model("b", "Beta"),
      model("c", "Gamma"),
      model("d", "Delta"),
    ];
    render(<CompareView models={models} />);
    expect(screen.getByTestId("compare-view")).toHaveAttribute(
      "data-model-count",
      "4",
    );
    for (const id of ["a", "b", "c", "d"]) {
      expect(screen.getByTestId(`compare-col-${id}`)).toBeTruthy();
    }
  });

  it("marks identical values as agreeing and differences as differing", () => {
    const models = [
      model("a", "Alpha", { speed: "fast", vision: true, bestUse: "coding" }),
      model("b", "Beta", { speed: "fast", vision: false, bestUse: "writing" }),
    ];
    render(<CompareView models={models} />);

    const speedRow = screen.getByTestId("compare-row-speed");
    expect(speedRow).toHaveAttribute("data-agree", "true");
    expect(speedRow).toHaveAttribute("data-differ", "false");

    const visionRow = screen.getByTestId("compare-row-vision");
    expect(visionRow).toHaveAttribute("data-agree", "false");
    expect(visionRow).toHaveAttribute("data-differ", "true");

    const bestUseRow = screen.getByTestId("compare-row-bestUse");
    expect(bestUseRow).toHaveAttribute("data-agree", "false");
  });

  it('renders "not recorded" for missing values (never blank, never zero)', () => {
    const models = [
      model("a", "Alpha", {
        pricing: null,
        quota: undefined,
        contextTokens: null,
        overallScore: null,
        scoreBasis: null,
        personalOverall: null,
        externalOverall: null,
        bestUse: "  ",
        avoidFor: null,
        weaknesses: null,
      }),
      model("b", "Beta", {
        pricing: "$10",
        contextTokens: 0, // verified zero must show as 0, not "not recorded"
      }),
    ];
    render(<CompareView models={models} />);

    const pricingA = screen.getByTestId("compare-cell-pricing-a");
    expect(pricingA).toHaveTextContent(NOT_RECORDED);
    expect(within(pricingA).getByTestId("compare-not-recorded")).toBeTruthy();

    const quotaA = screen.getByTestId("compare-cell-quota-a");
    expect(quotaA).toHaveTextContent(NOT_RECORDED);

    const contextA = screen.getByTestId("compare-cell-contextTokens-a");
    expect(contextA).toHaveTextContent(NOT_RECORDED);
    expect(contextA).not.toHaveTextContent(/^0$/);

    const contextB = screen.getByTestId("compare-cell-contextTokens-b");
    expect(contextB).toHaveTextContent("0");
    expect(contextB).not.toHaveTextContent(NOT_RECORDED);

    const bestUseA = screen.getByTestId("compare-cell-bestUse-a");
    expect(bestUseA).toHaveTextContent(NOT_RECORDED);

    // All not-recorded markers present in the table
    const markers = screen.getAllByTestId("compare-not-recorded");
    expect(markers.length).toBeGreaterThan(0);
  });

  it("exposes the required row groups", () => {
    render(
      <CompareView models={[model("a", "Alpha"), model("b", "Beta")]} />,
    );
    for (const group of COMPARE_GROUPS) {
      expect(screen.getByTestId(`compare-group-${group.id}`)).toHaveTextContent(
        group.label,
      );
    }
    expect(COMPARE_GROUP_LABELS).toEqual([
      "Access",
      "Plans",
      "Pricing",
      "Quotas",
      "Specifications",
      "Capabilities",
      "Ratings",
      "Best-use notes",
      "Weaknesses",
    ]);
    expect(COMPARE_GROUPS.map((g) => g.id)).toEqual([
      "access",
      "plans",
      "pricing",
      "quotas",
      "specifications",
      "capabilities",
      "ratings",
      "best-use",
      "weaknesses",
    ]);
  });
});

describe("compare helpers", () => {
  it("formatCompareValue never invents zero or false for missing", () => {
    expect(formatCompareValue(null)).toBe(NOT_RECORDED);
    expect(formatCompareValue(undefined)).toBe(NOT_RECORDED);
    expect(formatCompareValue("")).toBe(NOT_RECORDED);
    expect(formatCompareValue(0)).toBe("0");
    expect(formatCompareValue(false)).toBe("No");
    expect(formatCompareValue(true)).toBe("Yes");
  });

  it("rowValuesAgree detects matches", () => {
    expect(rowValuesAgree(["a", "a", "a"])).toBe(true);
    expect(rowValuesAgree(["a", "b"])).toBe(false);
    expect(rowValuesAgree([NOT_RECORDED, NOT_RECORDED])).toBe(true);
  });
});
