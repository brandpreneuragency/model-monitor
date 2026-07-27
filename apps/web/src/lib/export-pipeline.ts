import { deflateRawSync } from "node:zlib";
import {
  exportPayloadSchema,
  neutralizeExportRow,
  type ExportPayload,
  type ExportScope,
  type ExportFormat,
} from "@model-monitor/schemas";

type Row = Record<string, unknown>;

export function buildExportPayload(input: Omit<ExportPayload, "exportedAt"> & { exportedAt?: string }): ExportPayload {
  const payload = { ...input, exportedAt: input.exportedAt ?? new Date().toISOString() };
  return exportPayloadSchema.parse(payload);
}

function rowsFor(payload: ExportPayload): Array<[string, Row[]]> {
  const sections: Array<[string, Row[]]> = [];
  for (const key of ["models", "subscriptions", "access", "benchmarks", "scores", "sources", "provenance"] as const) {
    const rows = payload[key];
    if (rows && rows.length > 0) sections.push([key, rows]);
  }
  return sections;
}

function columnsFor(rows: Row[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) if (columns.indexOf(key) === -1) columns.push(key);
  }
  return columns;
}

function scalar(value: unknown): string | number | boolean {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number | boolean;
}

export function serializeCsv(payload: ExportPayload): string {
  const lines: string[] = [];
  for (const [section, rows] of rowsFor(payload)) {
    const columns = columnsFor(rows);
    lines.push([section, ...columns].map(escapeCsv).join(","));
    for (const row of rows) lines.push(columns.map((c) => escapeCsv(scalar(row[c]))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function escapeCsv(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(file.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);
    localParts.push(localHeader, compressed);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(file.data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += localHeader.length + compressed.length;
  }

  const centralDir = concat(centralParts);
  const localDir = concat(localParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(localDir.length),
    u16(0),
  ]);
  return concat([localDir, centralDir, end]);
}

function sheetXml(_name: string, rows: Row[]): string {
  const columns = columnsFor(rows);
  const sheetRows: string[] = [];
  const headerCells = columns
    .map((col, i) => `<c r="${colLetter(i)}1" t="inlineStr"><is><t>${xmlEscape(col)}</t></is></c>`)
    .join("");
  sheetRows.push(`<row r="1">${headerCells}</row>`);
  rows.forEach((row, rowIndex) => {
    const r = rowIndex + 2;
    const cells = columns
      .map((col, i) => {
        const value = scalar(row[col]);
        return `<c r="${colLetter(i)}${r}" t="inlineStr"><is><t>${xmlEscape(String(value))}</t></is></c>`;
      })
      .join("");
    sheetRows.push(`<row r="${r}">${cells}</row>`);
  });
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetRows.join("")}</sheetData></worksheet>`
  );
}

function colLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export async function serializeXlsx(payload: ExportPayload): Promise<Uint8Array> {
  const sections = rowsFor(payload);
  const sheetNames = sections.map(([name], i) => {
    const base = name.slice(0, 31) || `Sheet${i + 1}`;
    return base;
  });

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheetNames
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    `</Types>`;

  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    sheetNames
      .map(
        (name, i) =>
          `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
      )
      .join("") +
    `</sheets></workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheetNames
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `</Relationships>`;

  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "[Content_Types].xml", data: new TextEncoder().encode(contentTypes) },
    { name: "_rels/.rels", data: new TextEncoder().encode(rootRels) },
    { name: "xl/workbook.xml", data: new TextEncoder().encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: new TextEncoder().encode(workbookRels) },
  ];

  sections.forEach(([, rows], i) => {
    files.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: new TextEncoder().encode(sheetXml(sheetNames[i], rows)),
    });
  });

  if (sections.length === 0) {
    files.push({
      name: "xl/worksheets/sheet1.xml",
      data: new TextEncoder().encode(sheetXml("empty", [])),
    });
  }

  return zipStore(files);
}

export async function serializeExport(payload: ExportPayload, format: ExportFormat): Promise<Uint8Array> {
  if (format === "json") return new TextEncoder().encode(JSON.stringify(payload, null, 2));
  if (format === "csv") return new TextEncoder().encode(serializeCsv(payload));
  return serializeXlsx(payload);
}

export function filename(scope: ExportScope, format: ExportFormat): string {
  return `model-monitor-${scope}.${format}`;
}

export const mimeTypes: Record<ExportFormat, string> = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function preparePayload(payload: ExportPayload): ExportPayload {
  return payload.formulasNeutralized ? payload : (neutralizeExportRow(payload as unknown as Row) as ExportPayload);
}
