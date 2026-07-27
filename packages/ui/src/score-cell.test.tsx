import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreCell } from "./score-cell";

describe("ScoreCell", () => {
  it('renders untested state for null (not "0")', () => {
    render(<ScoreCell value={null} />);
    const el = screen.getByTestId("score-cell");
    expect(el).toHaveAttribute("data-untested", "true");
    expect(el).toHaveAttribute("data-band", "empty");
    expect(el).toHaveTextContent("—");
    expect(el).not.toHaveTextContent("0");
    expect(el.getAttribute("aria-label")).toMatch(/untested/i);
  });

  it('renders untested state for undefined', () => {
    render(<ScoreCell value={undefined} />);
    expect(screen.getByTestId("score-cell")).toHaveTextContent("—");
    expect(screen.getByTestId("score-cell")).toHaveAttribute(
      "data-untested",
      "true",
    );
  });

  it('renders "0" for zero and uses weak band', () => {
    render(<ScoreCell value={0} scale="ten" />);
    const el = screen.getByTestId("score-cell");
    expect(el).toHaveTextContent("0");
    expect(el).not.toHaveAttribute("data-untested");
    expect(el).toHaveAttribute("data-band", "weak");
  });

  it("maps high scores to exceptional band", () => {
    render(<ScoreCell value={9.5} scale="ten" />);
    expect(screen.getByTestId("score-cell")).toHaveAttribute(
      "data-band",
      "exceptional",
    );
  });
});
