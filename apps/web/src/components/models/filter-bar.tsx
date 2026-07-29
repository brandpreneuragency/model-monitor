"use client";

import { useMemo, type CSSProperties } from "react";
import { FilterChip, Popover } from "@model-monitor/ui";
import {
  FILTER_GROUPS,
  useModelFilters,
  type FilterGroupDef,
  type FilterOption,
} from "@/lib/use-model-filters";

function groupActiveLabel(
  group: FilterGroupDef,
  filters: Record<string, string | boolean | number>,
): string {
  // Show first matching option's valueLabel, else "All"
  for (const opt of group.options) {
    const current = filters[opt.key];
    if (current === undefined) continue;
    const asStr =
      typeof current === "boolean"
        ? current
          ? "true"
          : "false"
        : String(current);
    if (asStr === opt.value) return opt.valueLabel;
  }
  // Any key from this group set?
  const keys = new Set(group.options.map((o) => o.key));
  for (const key of keys) {
    if (filters[key] !== undefined) {
      const v = filters[key];
      return typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
    }
  }
  return "All";
}

function GroupDropdown({
  group,
  filters,
  onApply,
}: {
  group: FilterGroupDef;
  filters: Record<string, string | boolean | number>;
  onApply: (option: FilterOption) => void;
}) {
  const active = groupActiveLabel(group, filters);

  const triggerStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--space-1)",
    height: 32,
    padding: "0 var(--space-3)",
    borderRadius: "var(--radius-md)",
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: "var(--text-meta-size)",
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const itemStyle: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "var(--space-1_5) var(--space-2)",
    border: "none",
    background: "transparent",
    color: "var(--text)",
    fontSize: "var(--text-meta-size)",
    fontFamily: "var(--font-sans)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
  };

  return (
    <Popover
      align="start"
      data-testid={`filter-group-${group.id}`}
      trigger={
        <button
          type="button"
          style={triggerStyle}
          aria-haspopup="listbox"
          data-testid={`filter-group-trigger-${group.id}`}
        >
          <span style={{ color: "var(--text-muted)" }}>{group.label}:</span>
          <span>{active}</span>
          <span aria-hidden style={{ color: "var(--text-faint)" }}>
            ▾
          </span>
        </button>
      }
    >
      <div
        role="listbox"
        aria-label={group.label}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 180,
          maxHeight: 280,
          overflow: "auto",
        }}
      >
        {group.options.map((opt) => {
          const current = filters[opt.key];
          const asStr =
            current === undefined
              ? ""
              : typeof current === "boolean"
                ? current
                  ? "true"
                  : "false"
                : String(current);
          const selected = asStr === opt.value;
          return (
            <button
              key={`${opt.key}:${opt.value}`}
              type="button"
              role="option"
              aria-selected={selected}
              data-testid={`filter-option-${opt.key}-${opt.value}`}
              style={{
                ...itemStyle,
                background: selected ? "var(--accent-bg)" : "transparent",
                color: selected ? "var(--accent)" : "var(--text)",
              }}
              onClick={() => onApply(opt)}
            >
              {opt.label}: {opt.valueLabel}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}

/**
 * Sticky filter bar — six §7.3 group dropdowns + applied FilterChips + Clear all.
 * Not a filter builder: immediate apply, URL-backed via useModelFilters.
 */
export function FilterBar() {
  const { filters, chips, applyOption, removeChip, clearAll } =
    useModelFilters();

  const bar: CSSProperties = {
    position: "sticky",
    top: "var(--topbar-height, 56px)",
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-2)",
    padding: "var(--space-3)",
    marginBottom: "var(--space-3)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-lg)",
    fontFamily: "var(--font-sans)",
  };

  const row: CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: "var(--space-2)",
    alignItems: "center",
  };

  const clearStyle: CSSProperties = {
    appearance: "none",
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    fontSize: "var(--text-meta-size)",
    fontFamily: "var(--font-sans)",
    cursor: "pointer",
    padding: "var(--space-1) var(--space-2)",
    textDecoration: "none",
  };

  const groups = useMemo(() => FILTER_GROUPS, []);

  return (
    <div style={bar} data-testid="models-filter-bar">
      <div style={row} data-testid="models-filter-groups">
        {groups.map((group) => (
          <GroupDropdown
            key={group.id}
            group={group}
            filters={filters}
            onApply={applyOption}
          />
        ))}
      </div>

      {chips.length > 0 ? (
        <div style={row} data-testid="models-filter-chips">
          {chips.map((chip) => (
            <FilterChip
              key={chip.id}
              label={chip.label}
              value={chip.displayValue}
              onRemove={() => removeChip(chip.id)}
              data-testid={`filter-chip-${chip.key}`}
            />
          ))}
          <button
            type="button"
            style={clearStyle}
            onClick={clearAll}
            data-testid="filters-clear-all"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
