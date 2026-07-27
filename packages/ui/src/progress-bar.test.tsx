import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./progress-bar";

describe("ProgressBar", () => {
  it("renders unlimited without a percentage", () => {
    render(
      <ProgressBar label="ChatGPT Plus" unlimited value={0} max={100} />,
    );
    const value = screen.getByTestId("progress-bar-value");
    expect(value).toHaveTextContent("∞");
    expect(value.textContent ?? "").not.toMatch(/%/);
    expect(screen.getByTestId("progress-bar")).toHaveAttribute(
      "data-unlimited",
      "true",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuetext",
      "Unlimited",
    );
  });

  it("renders finite quota as value / max", () => {
    render(<ProgressBar label="OpenCode Go" value={42} max={90} />);
    expect(screen.getByTestId("progress-bar-value")).toHaveTextContent(
      "42 / 90",
    );
    expect(screen.getByTestId("progress-bar-value").textContent ?? "").not.toMatch(
      /%/,
    );
  });
});
