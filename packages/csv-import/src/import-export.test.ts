import { describe, expect, it } from "vitest";
import { detectDuplicates, parseMappedCsv, parseSections, serializeSections } from "./index.js";

describe("mapped import/export", () => {
  it("preview/service contract maps reordered column headers without mutation", () => {
    const source = "Provider Alias,Extra,Model Name\nopenai/gpt,ok,GPT\n";
    const parsed = parseMappedCsv(source);
    expect(parsed.mapping.modelName).toBe("Model Name");
    expect(parsed.rows[0]?.values.providerAlias).toBe("openai/gpt");
    expect(parsed.errors).toHaveLength(0);
  });
  it("preview/service contract detects provider-alias duplicates", () => {
    const parsed = parseMappedCsv("Model,Model ID\nNew,alias/x\n");
    expect(detectDuplicates(parsed.rows, [{ id: "1", name: "Existing", aliases: ["alias/x"] }])[0]?.reason).toBe("provider_alias");
  });
  it("preview/service contract reports invalid mapped numeric cells by source row and column while retaining valid rows", () => {
    const parsed = parseMappedCsv(
      "Output,Model Name,Context,Monthly\n128,Good,4096,12.50\nbad,Skip One,not-a-number,Infinity\n256,Valid,8192,0\n",
      { modelName: "Model Name", contextTokens: "Context", maxOutputTokens: "Output", subscriptionUsdMo: "Monthly" },
    );
    expect(parsed.rows.map((row) => row.values.modelName)).toEqual(["Good", "Valid"]);
    expect(parsed.skipped).toBe(1);
    expect(parsed.errors).toEqual([
      { row: 3, column: "Context", code: "invalid_number", message: "Context must be a finite number" },
      { row: 3, column: "Output", code: "invalid_number", message: "Output must be a finite number" },
      { row: 3, column: "Monthly", code: "invalid_number", message: "Monthly must be a finite number" },
    ]);
  });
  it("round-trips sectioned data with nulls and neutralizes formulas", () => {
    const csv = serializeSections([{ table: "models", headers: ["name", "nullable"], rows: [{ name: "=SUM(A1)", nullable: null }] }]);
    expect(csv).toContain("'=SUM(A1)");
    expect(parseSections(csv)[0]?.rows[0]).toEqual({ name: "'=SUM(A1)", nullable: null });
  });
  it("does not duplicate an idempotent reimport", () => {
    const source = "Model\nSame\n";
    const first = parseMappedCsv(source);
    const second = parseMappedCsv(source);
    expect(first.rows).toEqual(second.rows);
    expect(detectDuplicates(second.rows, [{ id: "1", name: "Same", aliases: [] }])).toHaveLength(1);
  });
});
