/** @jsxImportSource react */
import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  CompareTrayProvider,
  useCompareTray,
  COMPARE_LIMIT_MESSAGE,
  COMPARE_TRAY_MAX,
} from "@/components/shell/compare-tray";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function Probe() {
  const tray = useCompareTray();
  return (
    <div>
      <span data-testid="count">{tray.selected.length}</span>
      <span data-testid="notice">{tray.limitNotice ?? ""}</span>
      <span data-testid="max">{tray.max}</span>
      <button
        type="button"
        data-testid="seed-four"
        onClick={() => {
          tray.clear();
          tray.add({ id: "m1", name: "Model 1" });
          tray.add({ id: "m2", name: "Model 2" });
          tray.add({ id: "m3", name: "Model 3" });
          tray.add({ id: "m4", name: "Model 4" });
        }}
      >
        seed-four
      </button>
      <button
        type="button"
        data-testid="add-fifth"
        onClick={() => {
          tray.add({ id: "m5", name: "Model 5" });
        }}
      >
        add-fifth
      </button>
      <button
        type="button"
        data-testid="toggle-extra"
        onClick={() => {
          tray.toggle({ id: "extra", name: "Extra" });
        }}
      >
        toggle-extra
      </button>
    </div>
  );
}

describe("CompareTray fifth selection", () => {
  it(`refuses a fifth model with message (max ${COMPARE_TRAY_MAX})`, () => {
    render(
      <CompareTrayProvider>
        <Probe />
      </CompareTrayProvider>,
    );

    expect(screen.getByTestId("max")).toHaveTextContent(String(COMPARE_TRAY_MAX));

    act(() => {
      screen.getByTestId("seed-four").click();
    });
    expect(screen.getByTestId("count")).toHaveTextContent(
      String(COMPARE_TRAY_MAX),
    );
    expect(screen.getByTestId("notice")).toHaveTextContent("");

    act(() => {
      screen.getByTestId("add-fifth").click();
    });

    expect(screen.getByTestId("count")).toHaveTextContent(
      String(COMPARE_TRAY_MAX),
    );
    expect(screen.getByTestId("notice")).toHaveTextContent(COMPARE_LIMIT_MESSAGE);
    expect(screen.getByTestId("compare-limit-notice")).toHaveTextContent(
      /limited to 4 models/i,
    );

    act(() => {
      screen.getByTestId("toggle-extra").click();
    });
    expect(screen.getByTestId("count")).toHaveTextContent(
      String(COMPARE_TRAY_MAX),
    );
    expect(screen.getByTestId("compare-limit-notice")).toBeTruthy();
  });
});
