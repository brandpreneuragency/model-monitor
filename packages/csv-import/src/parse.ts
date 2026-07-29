import { parseProseBoolean, parseYesNo } from "./booleans";
import { parseCsvText } from "./csv";
import { emptyToNull, parseDecimal, parseGeneration } from "./numbers";
import { splitPackageRoutes } from "./packages";
import type {
  ParsedAccessRoute,
  ParsedBenchmarkResult,
  ParsedMaster,
  ParsedModel,
  ParsedPlan,
  ParsedPricing,
  ParsedProvider,
  ParsedQuota,
  ParsedSkillScore,
  ParsedSource,
} from "./types";

/** Expected header row (row 4 / 0-indexed 3). First cell must be Provider; length 76. */
export const EXPECTED_HEADER = [
  "Provider",
  "Package",
  "Model",
  "Model ID",
  "Family",
  "Generation",
  "Status",
  "Release Date",
  "Model Type",
  "Coding Specialization",
  "Vision Support",
  "Reasoning Support",
  "Parallel-Agent Support",
  "Knowledge Cutoff",
  "Context Tokens",
  "Max Output Tokens",
  "Speed Rating",
  "Verified TPS",
  "Subscription USD/mo",
  "Intro Price USD",
  "Usage Window Hours",
  "5h Min Requests",
  "5h Max Requests",
  "Weekly Requests",
  "Monthly Requests",
  "Input $/M",
  "Cached Read $/M",
  "Cache Write $/M",
  "Output $/M",
  "Long Context Input $/M",
  "Long Context Cached $/M",
  "Long Context Cache Write $/M",
  "Long Context Output $/M",
  "Avg Request Cost $",
  "Provider Relative Usage Cost",
  "SWE-Bench Pro",
  "Terminal-Bench 2.1",
  "Terminal-Bench 2.0",
  "Coding Agent Index",
  "SWE-Bench Verified",
  "Toolathlon",
  "MCP Atlas",
  "OSWorld",
  "GPQA Diamond",
  "Headline Long-Context %",
  "Benchmark Confidence",
  "Coding Benchmark Score",
  "Agent/Tool Score",
  "Repository Repair Score",
  "Long Context Score",
  "Speed Score",
  "Usage Efficiency Score",
  "Multimodality Score",
  "Provider Reliability Score",
  "Capability Score",
  "Capability Rank",
  "Balanced Score",
  "Balanced Rank",
  "Value Score",
  "Value Rank",
  "Long Context Rank",
  "Terminal/DevOps Rank",
  "UI/Frontend Rank",
  "Architecture Rank",
  "Review/Debug Rank",
  "Bulk Worker Rank",
  "Best Use",
  "Avoid For",
  "Roster Source",
  "Pricing Source",
  "Benchmark Source",
  "Verified On",
  "Needs Recheck",
  "Global Capability Eligible",
  "Balanced / Value Eligible",
  "Rank / QC Note",
] as const;

const BENCHMARK_COLUMNS = [
  "SWE-Bench Pro",
  "Terminal-Bench 2.1",
  "Terminal-Bench 2.0",
  "Coding Agent Index",
  "SWE-Bench Verified",
  "Toolathlon",
  "MCP Atlas",
  "OSWorld",
  "GPQA Diamond",
  "Headline Long-Context %",
] as const;

/** SPEC §5.4 skill seeding map. */
const SKILL_DEFS: ReadonlyArray<{
  skillKey: string;
  skillLabel: string;
  scoreCol?: string;
  rankCol?: string;
}> = [
  {
    skillKey: "coding",
    skillLabel: "Coding",
    scoreCol: "Coding Benchmark Score",
  },
  {
    skillKey: "agent_tool",
    skillLabel: "Agent / Tool Use",
    scoreCol: "Agent/Tool Score",
  },
  {
    skillKey: "review_debug",
    skillLabel: "Review / Debug",
    scoreCol: "Repository Repair Score",
    rankCol: "Review/Debug Rank",
  },
  {
    skillKey: "long_context",
    skillLabel: "Long Context",
    scoreCol: "Long Context Score",
    rankCol: "Long Context Rank",
  },
  { skillKey: "speed", skillLabel: "Speed", scoreCol: "Speed Score" },
  {
    skillKey: "value",
    skillLabel: "Value",
    scoreCol: "Usage Efficiency Score",
  },
  {
    skillKey: "multimodality",
    skillLabel: "Multimodality",
    scoreCol: "Multimodality Score",
  },
  {
    skillKey: "reliability",
    skillLabel: "Reliability",
    scoreCol: "Provider Reliability Score",
  },
  {
    skillKey: "terminal_devops",
    skillLabel: "Terminal / DevOps",
    rankCol: "Terminal/DevOps Rank",
  },
  {
    skillKey: "ui_frontend",
    skillLabel: "UI / Frontend",
    rankCol: "UI/Frontend Rank",
  },
  {
    skillKey: "architecture",
    skillLabel: "Architecture",
    rankCol: "Architecture Rank",
  },
  {
    skillKey: "bulk_work",
    skillLabel: "Bulk Work",
    rankCol: "Bulk Worker Rank",
  },
];

type HeaderIndex = Map<string, number>;

function buildHeaderIndex(header: string[]): HeaderIndex {
  const map = new Map<string, number>();
  header.forEach((name, i) => {
    map.set(name, i);
  });
  return map;
}

function cell(row: string[], idx: HeaderIndex, name: string): string {
  const i = idx.get(name);
  if (i === undefined) return "";
  return row[i] ?? "";
}

function requireHeader(rows: string[][]): { header: string[]; headerIndex: HeaderIndex } {
  if (rows.length < 4) {
    throw new Error(
      `CSV too short: expected at least 4 rows (3-row preamble + header), got ${rows.length}`,
    );
  }

  const header = rows[3]!;
  if (header[0] !== "Provider") {
    throw new Error(
      `CSV header row (row 4 / index 3) first cell must be "Provider", got ${JSON.stringify(header[0])}`,
    );
  }
  if (header.length !== 76) {
    throw new Error(
      `CSV header row must have 76 columns, got ${header.length}`,
    );
  }

  // Soft check: warn later if names drift; hard-fail on missing criticals
  for (const expected of [
    "Model",
    "Generation",
    "Vision Support",
    "Reasoning Support",
    "Package",
    "Context Tokens",
  ] as const) {
    if (!header.includes(expected)) {
      throw new Error(`CSV header missing required column ${JSON.stringify(expected)}`);
    }
  }

  return { header, headerIndex: buildHeaderIndex(header) };
}

/**
 * Parse LLM_MASTER_v1.csv bytes into typed records.
 * Decodes as UTF-8 only. Does not write to the database.
 */
export function parseMasterCsv(buffer: Buffer): ParsedMaster {
  const warnings: string[] = [];

  let text: string;
  try {
    text = buffer.toString("utf8");
  } catch (err) {
    throw new Error(
      `Failed to decode CSV as UTF-8: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Reject UTF-8 BOM only after decode; strip if present so header matches.
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
    warnings.push("Stripped UTF-8 BOM from CSV");
  }

  const rows = parseCsvText(text);
  const { headerIndex } = requireHeader(rows);

  const models: ParsedModel[] = [];
  const accessRoutes: ParsedAccessRoute[] = [];
  const quotas: ParsedQuota[] = [];
  const pricing: ParsedPricing[] = [];
  const benchmarkResults: ParsedBenchmarkResult[] = [];
  const skillScores: ParsedSkillScore[] = [];
  const sources: ParsedSource[] = [];

  const providerOrder: string[] = [];
  const providerSeen = new Set<string>();
  const planByPackage = new Map<string, ParsedPlan>();

  const dataRows = rows.slice(4);

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex]!;
    const sheetRow = rowIndex + 5; // 1-based sheet row (row 5 = first model)

    // Skip fully empty trailing rows
    if (row.every((c) => (c ?? "").trim() === "")) {
      warnings.push(`Skipped empty data row at sheet row ${sheetRow}`);
      continue;
    }

    if (row.length !== 76) {
      warnings.push(
        `Row ${sheetRow} has ${row.length} columns (expected 76); parsing available cells`,
      );
    }

    const name = cell(row, headerIndex, "Model").trim();
    if (!name) {
      warnings.push(`Row ${sheetRow}: missing Model name — skipped`);
      continue;
    }

    const providerName = cell(row, headerIndex, "Provider").trim();
    const packageName = cell(row, headerIndex, "Package").trim();
    const modelId = cell(row, headerIndex, "Model ID").trim();

    if (!providerName) {
      warnings.push(`Row ${sheetRow} (${name}): empty Provider`);
    }
    if (!packageName) {
      warnings.push(`Row ${sheetRow} (${name}): empty Package`);
    }

    if (providerName && !providerSeen.has(providerName)) {
      providerSeen.add(providerName);
      providerOrder.push(providerName);
    }

    const subscriptionUsd = parseDecimal(cell(row, headerIndex, "Subscription USD/mo"));
    const introPriceUsd = parseDecimal(cell(row, headerIndex, "Intro Price USD"));
    const usageWindowHours = parseDecimal(cell(row, headerIndex, "Usage Window Hours"));

    if (packageName) {
      const existing = planByPackage.get(packageName);
      if (!existing) {
        planByPackage.set(packageName, {
          packageName,
          providerName,
          subscriptionUsd,
          introPriceUsd,
          usageWindowHours,
        });
      } else {
        // Detect conflicting commercial terms on the same package label
        const conflict = (
          label: string,
          a: number | null,
          b: number | null,
        ): void => {
          if (a !== null && b !== null && a !== b) {
            warnings.push(
              `Package ${JSON.stringify(packageName)} has conflicting ${label}: ${a} vs ${b} (model ${name})`,
            );
          }
        };
        conflict("Subscription USD/mo", existing.subscriptionUsd, subscriptionUsd);
        conflict("Intro Price USD", existing.introPriceUsd, introPriceUsd);
        conflict("Usage Window Hours", existing.usageWindowHours, usageWindowHours);
        if (existing.subscriptionUsd === null && subscriptionUsd !== null) {
          existing.subscriptionUsd = subscriptionUsd;
        }
        if (existing.introPriceUsd === null && introPriceUsd !== null) {
          existing.introPriceUsd = introPriceUsd;
        }
        if (existing.usageWindowHours === null && usageWindowHours !== null) {
          existing.usageWindowHours = usageWindowHours;
        }
      }
    }

    const generationRaw = cell(row, headerIndex, "Generation");
    const generation = parseGeneration(generationRaw);

    const model: ParsedModel = {
      rowIndex,
      sheetRow,
      name,
      providerName,
      packageName,
      modelId,
      family: emptyToNull(cell(row, headerIndex, "Family")),
      generation,
      status: emptyToNull(cell(row, headerIndex, "Status")),
      releaseDate: emptyToNull(cell(row, headerIndex, "Release Date")),
      modelType: emptyToNull(cell(row, headerIndex, "Model Type")),
      codingSpecialization: emptyToNull(
        cell(row, headerIndex, "Coding Specialization"),
      ),
      knowledgeCutoff: emptyToNull(cell(row, headerIndex, "Knowledge Cutoff")),
      contextTokens: parseDecimal(cell(row, headerIndex, "Context Tokens")),
      maxOutputTokens: parseDecimal(cell(row, headerIndex, "Max Output Tokens")),
      speedRating: emptyToNull(cell(row, headerIndex, "Speed Rating")),
      verifiedTps: parseDecimal(cell(row, headerIndex, "Verified TPS")),
      bestUse: emptyToNull(cell(row, headerIndex, "Best Use")),
      avoidFor: emptyToNull(cell(row, headerIndex, "Avoid For")),
      needsRecheck: emptyToNull(cell(row, headerIndex, "Needs Recheck")),
      globalCapabilityEligible: parseYesNo(
        cell(row, headerIndex, "Global Capability Eligible"),
      ),
      balancedValueEligible: parseYesNo(
        cell(row, headerIndex, "Balanced / Value Eligible"),
      ),
      rankQcNote: emptyToNull(cell(row, headerIndex, "Rank / QC Note")),
      vision: parseProseBoolean(cell(row, headerIndex, "Vision Support")),
      reasoning: parseProseBoolean(cell(row, headerIndex, "Reasoning Support")),
      parallelAgent: parseProseBoolean(
        cell(row, headerIndex, "Parallel-Agent Support"),
      ),
      capabilityScore: parseDecimal(cell(row, headerIndex, "Capability Score")),
      capabilityRank: parseDecimal(cell(row, headerIndex, "Capability Rank")),
      balancedScore: parseDecimal(cell(row, headerIndex, "Balanced Score")),
      balancedRank: parseDecimal(cell(row, headerIndex, "Balanced Rank")),
      valueScore: parseDecimal(cell(row, headerIndex, "Value Score")),
      valueRank: parseDecimal(cell(row, headerIndex, "Value Rank")),
    };
    models.push(model);

    const routes = splitPackageRoutes(packageName);
    if (routes.length === 0) {
      warnings.push(`Row ${sheetRow} (${name}): Package produced zero access routes`);
    }
    const avgRequestCost = parseDecimal(cell(row, headerIndex, "Avg Request Cost $"));
    const providerRelativeUsageCost = parseDecimal(
      cell(row, headerIndex, "Provider Relative Usage Cost"),
    );
    for (const routeName of routes) {
      accessRoutes.push({
        modelName: name,
        providerName,
        packageName,
        routeName,
        providerModelId: modelId,
        avgRequestCost,
        providerRelativeUsageCost,
      });
    }

    quotas.push({
      modelName: name,
      providerName,
      packageName,
      usageWindowHours,
      fiveHourMin: parseDecimal(cell(row, headerIndex, "5h Min Requests")),
      fiveHourMax: parseDecimal(cell(row, headerIndex, "5h Max Requests")),
      weeklyRequests: parseDecimal(cell(row, headerIndex, "Weekly Requests")),
      monthlyRequests: parseDecimal(cell(row, headerIndex, "Monthly Requests")),
    });

    pricing.push({
      modelName: name,
      providerName,
      packageName,
      inputPerM: parseDecimal(cell(row, headerIndex, "Input $/M")),
      cachedReadPerM: parseDecimal(cell(row, headerIndex, "Cached Read $/M")),
      cacheWritePerM: parseDecimal(cell(row, headerIndex, "Cache Write $/M")),
      outputPerM: parseDecimal(cell(row, headerIndex, "Output $/M")),
      longContextInputPerM: parseDecimal(
        cell(row, headerIndex, "Long Context Input $/M"),
      ),
      longContextCachedPerM: parseDecimal(
        cell(row, headerIndex, "Long Context Cached $/M"),
      ),
      longContextCacheWritePerM: parseDecimal(
        cell(row, headerIndex, "Long Context Cache Write $/M"),
      ),
      longContextOutputPerM: parseDecimal(
        cell(row, headerIndex, "Long Context Output $/M"),
      ),
    });

    const confidence = emptyToNull(cell(row, headerIndex, "Benchmark Confidence"));
    for (const bench of BENCHMARK_COLUMNS) {
      const raw = cell(row, headerIndex, bench);
      const score = parseDecimal(raw);
      // Keep a result row even when blank so migration can see coverage; score null.
      if (raw.trim() !== "" || score !== null) {
        benchmarkResults.push({
          modelName: name,
          benchmark: bench,
          score,
          confidence,
        });
      } else {
        // Still record blank? Prefer only non-empty to keep arrays lean; blank→null is
        // asserted via model numeric fields. Emit nothing for pure blanks.
      }
      if (raw.trim() !== "" && score === null) {
        warnings.push(
          `Row ${sheetRow} (${name}): could not parse ${bench}=${JSON.stringify(raw)}`,
        );
      }
    }

    for (const def of SKILL_DEFS) {
      const externalScore = def.scoreCol
        ? parseDecimal(cell(row, headerIndex, def.scoreCol))
        : null;
      const externalRank = def.rankCol
        ? parseDecimal(cell(row, headerIndex, def.rankCol))
        : null;
      skillScores.push({
        modelName: name,
        skillKey: def.skillKey,
        skillLabel: def.skillLabel,
        externalScore,
        externalRank,
      });
    }

    sources.push({
      modelName: name,
      rosterSource: emptyToNull(cell(row, headerIndex, "Roster Source")),
      pricingSource: emptyToNull(cell(row, headerIndex, "Pricing Source")),
      benchmarkSource: emptyToNull(cell(row, headerIndex, "Benchmark Source")),
      verifiedOn: emptyToNull(cell(row, headerIndex, "Verified On")),
    });
  }

  const providers: ParsedProvider[] = providerOrder.map((name) => ({ name }));
  const plans: ParsedPlan[] = [...planByPackage.values()];

  return {
    models,
    providers,
    plans,
    accessRoutes,
    quotas,
    pricing,
    benchmarkResults,
    skillScores,
    sources,
    warnings,
  };
}

export { parseDecimal, parseGeneration } from "./numbers";
export { parseProseBoolean } from "./booleans";
export { splitPackageRoutes, KNOWN_COMPOUND_PACKAGES } from "./packages";
