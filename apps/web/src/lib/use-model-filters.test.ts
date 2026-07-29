import { describe, expect, it } from "vitest";
import {
  FILTER_GROUPS,
  applyFilterOption,
  clearAllFilters,
  clearFiltersFromSearchParams,
  filtersToChips,
  parseModelFilters,
  removeFilterKey,
  serializeModelFilters,
} from "./use-model-filters";

describe("use-model-filters URL serialisation", () => {
  it("defines six filter groups (brief §7.3)", () => {
    expect(FILTER_GROUPS).toHaveLength(6);
    expect(FILTER_GROUPS.map((g) => g.id)).toEqual([
      "identity",
      "status",
      "capabilities",
      "ratings",
      "costQuota",
      "maintenance",
    ]);
  });

  it("serialises and parses each filter group to/from the URL", () => {
    for (const group of FILTER_GROUPS) {
      expect(group.options.length).toBeGreaterThan(0);
      // Pick first option of the group as representative
      const option = group.options[0];
      expect(option).toBeDefined();
      if (!option) continue;
      const filters = applyFilterOption({}, option);
      const sp = serializeModelFilters(filters);
      expect(sp.get(option.key)).toBe(option.value);

      const roundTrip = parseModelFilters(sp);
      expect(roundTrip).toHaveProperty(option.key);
      // Boolean keys come back as booleans
      if (option.value === "true" || option.value === "false") {
        expect(roundTrip[option.key]).toBe(option.value === "true");
      } else if (/^-?\d+(\.\d+)?$/.test(option.value)) {
        // numeric option values
        const n = Number(option.value);
        if (
          [
            "personalScoreMin",
            "personalScoreMax",
            "skillScoreMin",
            "skillScoreMax",
            "rankMin",
            "rankMax",
          ].includes(option.key)
        ) {
          expect(roundTrip[option.key]).toBe(n);
        } else {
          expect(String(roundTrip[option.key])).toBe(option.value);
        }
      } else {
        expect(roundTrip[option.key]).toBe(option.value);
      }

      // Full group: apply every option (last write wins per key)
      let acc = {};
      for (const opt of group.options) {
        acc = applyFilterOption(acc, opt);
      }
      const groupSp = serializeModelFilters(acc);
      const groupParsed = parseModelFilters(groupSp);
      // Every distinct key in the group appears
      const keys = new Set(group.options.map((o) => o.key));
      for (const key of keys) {
        expect(groupParsed[key]).toBeDefined();
        expect(groupSp.has(key)).toBe(true);
      }
    }
  });

  it("round-trips mixed filters across all six groups", () => {
    const samples = FILTER_GROUPS.map((g) => g.options[0]).filter(
      (o): o is NonNullable<typeof o> => o != null,
    );
    expect(samples).toHaveLength(FILTER_GROUPS.length);
    let filters = {};
    for (const opt of samples) {
      filters = applyFilterOption(filters, opt);
    }
    const sp = serializeModelFilters(filters);
    const parsed = parseModelFilters(sp);
    expect(Object.keys(parsed).length).toBe(
      new Set(samples.map((s) => s.key)).size,
    );
    // Query string is non-empty and stable
    expect(sp.toString().length).toBeGreaterThan(0);
    const again = serializeModelFilters(parsed);
    expect(again.toString()).toBe(sp.toString());
  });

  it("removing a chip removes exactly one filter", () => {
    const filters = {
      workflowStatus: "active",
      accessType: "api",
      vision: true,
      skill: "coding",
    };
    const chips = filtersToChips(filters);
    expect(chips).toHaveLength(4);

    const target = chips.find((c) => c.key === "accessType");
    expect(target).toBeDefined();

    const next = removeFilterKey(filters, target!.id);
    expect(Object.keys(next)).toHaveLength(3);
    expect(next).not.toHaveProperty("accessType");
    expect(next.workflowStatus).toBe("active");
    expect(next.vision).toBe(true);
    expect(next.skill).toBe("coding");

    // serialize reflects single removal
    const sp = serializeModelFilters(next);
    expect(sp.has("accessType")).toBe(false);
    expect(sp.get("workflowStatus")).toBe("active");
    expect(sp.get("vision")).toBe("true");
    expect(sp.get("skill")).toBe("coding");
    expect([...sp.keys()].filter((k) => k !== "page").length).toBe(3);
  });

  it("Clear all empties the query string of filters", () => {
    const filters = {
      workflowStatus: "active",
      accessType: "api",
      vision: true,
      free: true,
      needsReview: true,
      skill: "coding",
    };
    const base = serializeModelFilters(filters);
    base.set("page", "2");
    base.set("limit", "20");
    base.set("sort", "name");
    expect(base.toString().length).toBeGreaterThan(0);

    // clearAllFilters returns empty bag
    expect(clearAllFilters()).toEqual({});

    // clearFiltersFromSearchParams drops every filter key
    const cleared = clearFiltersFromSearchParams(base);
    for (const key of Object.keys(filters)) {
      expect(cleared.has(key)).toBe(false);
    }
    // page is reset
    expect(cleared.has("page")).toBe(false);
    // non-filter chrome may remain
    expect(cleared.get("limit")).toBe("20");
    expect(cleared.get("sort")).toBe("name");

    // emptyAll empties the entire query string
    const empty = clearFiltersFromSearchParams(base, { emptyAll: true });
    expect(empty.toString()).toBe("");

    // Serialising empty filters onto empty base → empty query string
    const onlyFilters = serializeModelFilters(filters);
    const afterClear = serializeModelFilters(clearAllFilters(), onlyFilters);
    expect(afterClear.toString()).toBe("");
  });

  it("preserves non-filter keys when serialising filters", () => {
    const base = new URLSearchParams("page=3&limit=50&sort=-name&view=table");
    const sp = serializeModelFilters({ vision: true }, base);
    expect(sp.get("page")).toBe("3");
    expect(sp.get("limit")).toBe("50");
    expect(sp.get("sort")).toBe("-name");
    expect(sp.get("view")).toBe("table");
    expect(sp.get("vision")).toBe("true");
  });
});
