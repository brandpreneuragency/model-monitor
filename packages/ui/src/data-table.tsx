"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnMeta,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";
import { fontBody, fontMeta } from "./styles";
import type { Density } from "./types";
import { densityRowHeight } from "./types";

export type DataTableColumnMeta = ColumnMeta<unknown, unknown> & {
  /** Stick this column to the left while scrolling horizontally. */
  sticky?: "left";
  /** Extra left offset (px) when stacking multiple sticky columns. */
  stickyOffset?: number;
  /** Minimum width hint. */
  minWidth?: number | string;
  /** Column width hint. */
  width?: number | string;
};

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  density?: Density;
  enableSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** When true, sorting is controlled externally (server-side). */
  manualSorting?: boolean;
  getRowId?: (originalRow: T, index: number) => string;
  emptyMessage?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onRowClick?: (row: T) => void;
  /** Sticky the selection checkbox column when selection is enabled. */
  stickySelection?: boolean;
  "data-testid"?: string;
}

const SELECTION_COL_WIDTH = 40;

export function DataTable<T>({
  data,
  columns,
  density = "standard",
  enableSelection = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  sorting: controlledSorting,
  onSortingChange,
  manualSorting = false,
  getRowId,
  emptyMessage = "No rows",
  className,
  style,
  onRowClick,
  stickySelection = true,
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
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    manualSorting,
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

  const thBase: CSSProperties = {
    ...fontMeta,
    position: "sticky",
    top: 0,
    zIndex: 2,
    textAlign: "left",
    color: "var(--text-muted)",
    background: "var(--bg-card)",
    borderBottom: "1px solid var(--border)",
    padding: "0 var(--space-3)",
    height: 40,
    fontWeight: 500,
    whiteSpace: "nowrap",
    boxShadow: "none",
  };

  const tdBase: CSSProperties = {
    ...fontBody,
    color: "var(--text)",
    padding: "0 var(--space-3)",
    height: rowHeight,
    borderBottom: "1px solid var(--border-subtle)",
    verticalAlign: "middle",
    background: "inherit",
  };

  function readMeta(
    meta: unknown,
  ): DataTableColumnMeta | undefined {
    if (!meta || typeof meta !== "object") return undefined;
    const m = meta as {
      sticky?: unknown;
      stickyOffset?: unknown;
      minWidth?: unknown;
      width?: unknown;
    };
    const out: DataTableColumnMeta = {};
    if (m.sticky === "left") out.sticky = "left";
    if (typeof m.stickyOffset === "number") out.stickyOffset = m.stickyOffset;
    if (typeof m.minWidth === "number" || typeof m.minWidth === "string") {
      out.minWidth = m.minWidth;
    }
    if (typeof m.width === "number" || typeof m.width === "string") {
      out.width = m.width;
    }
    return out;
  }

  function stickyStyle(
    meta: DataTableColumnMeta | undefined,
    kind: "th" | "td",
    extraLeft = 0,
  ): CSSProperties {
    if (meta?.sticky !== "left") return {};
    const offset = (meta.stickyOffset ?? 0) + extraLeft;
    return {
      position: "sticky",
      left: offset,
      zIndex: kind === "th" ? 4 : 3,
      background: "var(--bg-card)",
    };
  }

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
          borderCollapse: "separate",
          borderSpacing: 0,
          tableLayout: "auto",
        }}
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {enableSelection ? (
                <th
                  style={{
                    ...thBase,
                    width: SELECTION_COL_WIDTH,
                    minWidth: SELECTION_COL_WIDTH,
                    ...(stickySelection
                      ? {
                          position: "sticky",
                          left: 0,
                          zIndex: 5,
                          background: "var(--bg-card)",
                        }
                      : null),
                  }}
                >
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
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
              ) : null}
              {hg.headers.map((header) => {
                const meta = readMeta(header.column.columnDef.meta);
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                const sticky = stickyStyle(
                  meta,
                  "th",
                  enableSelection && stickySelection ? SELECTION_COL_WIDTH : 0,
                );
                return (
                  <th
                    key={header.id}
                    style={{
                      ...thBase,
                      ...sticky,
                      width: meta?.width,
                      minWidth: meta?.minWidth,
                    }}
                    colSpan={header.colSpan}
                  >
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
                  ...tdBase,
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
              const rowBg = selected
                ? "var(--bg-row-selected)"
                : "var(--bg-card)";
              return (
                <tr
                  key={row.id}
                  data-selected={selected || undefined}
                  data-testid="data-table-row"
                  style={{
                    background: rowBg,
                    cursor: onRowClick ? "pointer" : undefined,
                    boxShadow: selected
                      ? "inset 3px 0 0 0 var(--accent)"
                      : undefined,
                  }}
                  onClick={() => onRowClick?.(row.original)}
                  onMouseEnter={(e) => {
                    if (!selected) {
                      e.currentTarget.style.background = "var(--bg-row-hover)";
                      e.currentTarget
                        .querySelectorAll<HTMLElement>("[data-sticky-cell]")
                        .forEach((cell) => {
                          cell.style.background = "var(--bg-row-hover)";
                        });
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = rowBg;
                    e.currentTarget
                      .querySelectorAll<HTMLElement>("[data-sticky-cell]")
                      .forEach((cell) => {
                        cell.style.background = rowBg;
                      });
                  }}
                >
                  {enableSelection ? (
                    <td
                      data-sticky-cell={stickySelection || undefined}
                      style={{
                        ...tdBase,
                        background: rowBg,
                        ...(stickySelection
                          ? {
                              position: "sticky",
                              left: 0,
                              zIndex: 2,
                            }
                          : null),
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected}
                        onChange={row.getToggleSelectedHandler()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {row.getVisibleCells().map((cell) => {
                    const meta = readMeta(cell.column.columnDef.meta);
                    const sticky = stickyStyle(
                      meta,
                      "td",
                      enableSelection && stickySelection
                        ? SELECTION_COL_WIDTH
                        : 0,
                    );
                    const isSticky = meta?.sticky === "left";
                    return (
                      <td
                        key={cell.id}
                        data-sticky-cell={isSticky || undefined}
                        style={{
                          ...tdBase,
                          background: rowBg,
                          ...sticky,
                          width: meta?.width,
                          minWidth: meta?.minWidth,
                        }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
