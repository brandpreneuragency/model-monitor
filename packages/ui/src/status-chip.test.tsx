import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusChip } from "./status-chip";

describe("StatusChip", () => {
  it("renders its label text", () => {
    render(<StatusChip color="ok" label="Active" />);
    expect(screen.getByTestId("status-chip")).toHaveTextContent("Active");
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("exposes semantic colour via data attribute (with text)", () => {
    render(<StatusChip color="warn" label="Needs Review" />);
    const el = screen.getByTestId("status-chip");
    expect(el).toHaveAttribute("data-color", "warn");
    expect(el).toHaveTextContent("Needs Review");
  });
});
