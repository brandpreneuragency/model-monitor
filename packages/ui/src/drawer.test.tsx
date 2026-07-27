import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Drawer } from "./drawer";

describe("Drawer", () => {
  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Drawer open onClose={onClose} title="Model details">
        <p>Body</p>
      </Drawer>,
    );

    expect(screen.getByTestId("drawer")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when closed", () => {
    render(
      <Drawer open={false} onClose={() => undefined} title="Hidden">
        secret
      </Drawer>,
    );
    expect(screen.queryByTestId("drawer")).not.toBeInTheDocument();
  });
});
