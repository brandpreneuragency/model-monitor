/** @jsxImportSource react */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelCard } from "@/components/models/model-card";
import type { ModelTableRow } from "@/components/models/models-columns";

function baseModel(overrides: Partial<ModelTableRow> = {}): ModelTableRow {
  return {
    id: "model-1",
    name: "Test Model",
    creator: { name: "Acme" },
    preferredAccess: {
      providerName: "Acme API",
      planName: "Pro",
    },
    workflowStatus: "active",
    context: 128_000,
    speed: "fast",
    overallScore: null,
    bestSkill: null,
    costOrQuota: null,
    bestUse: "General coding",
    tags: [{ name: "coding" }],
    capabilities: { vision: true, reasoning: false, toolUse: true },
    ...overrides,
  };
}

describe("ModelCard", () => {
  it("renders the untested state when overall score is null (not 0)", () => {
    render(<ModelCard model={baseModel({ overallScore: null })} />);

    const score = screen.getByTestId("model-card-score");
    expect(score).toHaveAttribute("data-untested", "true");
    expect(score).toHaveAttribute("data-band", "empty");
    expect(score).toHaveTextContent("—");
    expect(score).not.toHaveTextContent("0");
    expect(score.getAttribute("aria-label")).toMatch(/untested/i);

    // Card chrome still present
    expect(screen.getByTestId("model-card")).toBeTruthy();
    expect(screen.getByText("Test Model")).toBeTruthy();
  });

  it("renders a numeric score when provided", () => {
    render(<ModelCard model={baseModel({ overallScore: 8.5 })} />);
    const score = screen.getByTestId("model-card-score");
    expect(score).not.toHaveAttribute("data-untested");
    expect(score).toHaveTextContent("8.5");
  });
});
