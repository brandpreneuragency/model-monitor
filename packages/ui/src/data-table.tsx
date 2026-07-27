"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";
import { fontBody, fontMeta } from "./styles";
import type { Density } from "./types";
import { densityRowHeight } from "./types";

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  density?: Density;
  enableSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  getRowId?: (originalRow: T, index: number) => string;
  emptyMessage?: ReactNode;
  className?: string;
  style?: CSSProperties;
  "data-testid"?: string;
}

export function DataTable<T>({
  data,
  columns,
  density = "standard",
  enableSelection = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  sorting: controlledSorting,
  onSortingChange,
  getRowId,
  emptyMessage = "No rows",
  className,
  style,
  "data-testid": testId = "data-table",
}: DataTableProps<T>) {
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>(
    {},
  );

  const sorting = controlledSorting ?? internalSorting;
  const setSorting = onSortingChange ?? setInternalSorting;
  const rowSelection = controlledSelection ?? internalSelection;
  const setRowSelection = onRowSelectionChange ?? setInternalSelection;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection: enableSelection ? rowSelection : {},
    },
    enableRowSelection: enableSelection,
    onRowSelectionChange: enableSelection ? setRowSelection : undefined,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });

  const rowHeight = densityRowHeight(density);

  const wrap: CSSProperties = {
    width: "100%",
    overflow: "auto",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    background: "var(--bg-card)",
    boxShadow: "none",
    ...style,
  };

  const th: CSSProperties = {
    ...fontMeta,
    position: "sticky",
    top: 0,
    zIndex: 1,
    textAlign: "left",
    color: "var(--text-muted)",
    background: "var(--bg-card)",
    borderBottom: "1px solid var(--border)",
    padding: "0 var(--space-3)",
    height: rowHeight,
    fontWeight: 600,
    whiteSpace: "nowrap",
    boxShadow: "none",
  };

  const td: CSSProperties = {
    ...fontBody,
    color: "var(--text)",
    padding: "0 var(--space-3)",
    height: rowHeight,
    borderBottom: "1px solid var(--border-subtle)",
    verticalAlign: "middle",
  };

  return (
    <div
      className={cn("mm-data-table", className)}
      style={wrap}
      data-density={density}
      data-testid={testId}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          tableLayout: "auto",
        }}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {enableSelection ? (
                <th style={{ ...th, width: 40 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={table.getIsAllRowsSelected()}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = table.getIsSomeRowsSelected();
                      }
                    }}
                    onChange={table.getToggleAllRowsSelectedHandler()}
                  />
                </th>
              ) : null}
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <th key={header.id} style={th} colSpan={header.colSpan}>
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        disabled={!canSort}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{
                          appearance: "none",
                          background: "transparent",
                          border: "none",
                          color: "inherit",
                          font: "inherit",
                          fontWeight: "inherit",
                          cursor: canSort ? "pointer" : "default",
                          padding: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "var(--space-1)",
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {sorted === "asc"
                          ? " ↑"
                          : sorted === "desc"
                            ? " ↓"
                            : canSort
                              ? " ↕"
                              : null}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (enableSelection ? 1 : 0)}
                style={{
                  ...td,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  height: "var(--row-comfortable)",
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => {
              const selected = row.getIsSelected();
              return (
                <tr
                  key={row.id}
                  data-selected={selected || undefined}
                  style={{
                    background: selected
                      ? "var(--bg-row-selected)"
                      : "transparent",
                    boxShadow: selected
                      ? "inset 3px 0 0 0 var(--accent)"
                      : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background = "var(--bg-row-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selected
                      ? "var(--bg-row-selected)"
                      : "transparent";
                  }}
                >
                  {enableSelection ? (
                    <td style={td}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected}
                        onChange={row.getToggleSelectedHandler()}
                      />
                    </td>
                  ) : null}
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} style={td}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
