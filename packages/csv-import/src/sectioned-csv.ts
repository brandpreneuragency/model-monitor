export type ExportSection = { table: string; headers: string[]; rows: Record<string, string | null>[] };

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" ? value.toString() : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function neutralizeFormulaCell(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return value;
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function serializeSections(sections: ExportSection[], neutralize = true): string {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push([section.table, ...section.headers].map(csvCell).join(","));
    for (const row of section.rows) lines.push([section.table, ...section.headers.map((header) => neutralize ? neutralizeFormulaCell(row[header]) : row[header])].map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

export function parseSections(text: string): ExportSection[] {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i]!; if (ch === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (ch === "," && !quoted) { row.push(cell); cell = ""; } else if ((ch === "\n" || ch === "\r") && !quoted) { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((v) => v)) records.push(row); row = []; cell = ""; } else cell += ch; }
  if (cell || row.length) { row.push(cell); if (row.some((v) => v)) records.push(row); }
  const sections: ExportSection[] = [];
  for (const record of records) {
    const table = record[0]!;
    let section = sections.find((item) => item.table === table);
    if (!section) { section = { table, headers: record.slice(1), rows: [] }; sections.push(section); continue; }
    const values = record.slice(1); section.rows.push(Object.fromEntries(section.headers.map((header, i) => [header, values[i] === "" ? null : values[i] ?? null])));
  }
  return sections;
}
