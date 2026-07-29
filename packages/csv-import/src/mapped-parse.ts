import { autoDetectColumnMapping, type ColumnMapping, requiredMappingErrors } from "./column-map";

export type ImportRowError = { row: number; column: string; code: string; message: string };
export type MappedRow = { row: number; values: Record<string, string | null> };
export type MappedParse = { headers: string[]; mapping: ColumnMapping; rows: MappedRow[]; errors: ImportRowError[]; skipped: number };

export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) records.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim() !== "")) records.push(row); }
  return records;
}

export function parseMappedCsv(text: string, suppliedMapping: ColumnMapping = {}): MappedParse {
  const records = parseCsvRecords(text);
  const headers = records[0] ?? [];
  const mapping = { ...autoDetectColumnMapping(headers), ...suppliedMapping };
  const errors: ImportRowError[] = requiredMappingErrors(mapping).map((message) => ({ row: 1, column: "headers", code: "missing_mapping", message }));
  const rows: MappedRow[] = [];
  let skipped = 0;
  for (let i = 1; i < records.length; i++) {
    const record = records[i]!;
    const values: Record<string, string | null> = {};
    for (const [field, header] of Object.entries(mapping)) {
      const index = headers.indexOf(header);
      const raw = index < 0 ? undefined : record[index];
      values[field] = raw === undefined || raw.trim() === "" ? null : raw.trim();
    }
    const name = values.modelName;
    if (!name) { errors.push({ row: i + 1, column: mapping.modelName ?? "modelName", code: "required", message: "Model name is required" }); skipped++; continue; }
    let invalidNumber = false;
    for (const field of ["contextTokens", "maxOutputTokens", "subscriptionUsdMo"] as const) {
      const raw = values[field];
      const sourceColumn = mapping[field] ?? field;
      if (!mapping[field]) continue;
      if (raw !== null) {
        const number = Number(raw);
        if (!Number.isFinite(number)) {
          errors.push({ row: i + 1, column: sourceColumn, code: "invalid_number", message: `${sourceColumn} must be a finite number` });
          invalidNumber = true;
        } else {
          values[field] = String(number);
        }
      }
    }
    if (invalidNumber) { skipped++; continue; }
    rows.push({ row: i + 1, values });
  }
  return { headers, mapping, rows, errors, skipped };
}

export type ExistingIdentity = { id: string; name: string; aliases: string[] };
export type Conflict = { row: number; modelId: string; reason: "model_name" | "provider_alias"; existingName: string; alias?: string };
export function detectDuplicates(rows: MappedRow[], existing: ExistingIdentity[]): Conflict[] {
  const byName = new Map(existing.map((item) => [item.name.trim().toLowerCase(), item]));
  const byAlias = new Map(existing.flatMap((item) => item.aliases.map((alias) => [alias.trim().toLowerCase(), item] as const)));
  return rows.flatMap(({ row, values }) => {
    const name = values.modelName?.toLowerCase();
    const alias = values.providerAlias?.toLowerCase();
    const match = (name && byName.get(name)) || (alias && byAlias.get(alias));
    if (!match) return [];
    return [{ row, modelId: match.id, reason: name && byName.has(name) ? "model_name" : "provider_alias", existingName: match.name, ...(alias ? { alias } : {}) }];
  });
}
