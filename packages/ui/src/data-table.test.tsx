import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "./data-table";

type Row = { id: string; name: string };

const columns: ColumnDef<Row, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
  },
];

const data: Row[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];

describe("DataTable", () => {
  it("respects the density prop", () => {
    const { rerender } = render(
      <DataTable data={data} columns={columns} density="compact" />,
    );
    expect(screen.getByTestId("data-table")).toHaveAttribute(
      "data-density",
      "compact",
    );

    rerender(
      <DataTable data={data} columns={columns} density="comfortable" />,
    );
    expect(screen.getByTestId("data-table")).toHaveAttribute(
      "data-density",
      "comfortable",
    );

    rerender(<DataTable data={data} columns={columns} density="standard" />);
    expect(screen.getByTestId("data-table")).toHaveAttribute(
      "data-density",
      "standard",
    );
  });

  it("renders row content", () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });
});
