"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useMemo, useState } from "react";

type Mapping = Record<string, string>;
type ImportRow = { classification: string; sourceRow?: number; label?: string; proposedValues?: Record<string, unknown>; conflictId?: string };
type Conflict = { id: string; sourceRow?: number | null; sourceColumn?: string | null; currentValue?: unknown; importedValue?: unknown };
type Preview = { importJobId: string; mapping: Mapping; plan: { modelRows: Array<Record<string, unknown>>; benchmarkRows: [] }; rows: ImportRow[]; conflicts: Conflict[]; errors?: Array<{ row?: number; message: string }> };
const fields = ["modelName", "providerAlias", "provider", "plan", "developer", "canonicalId", "family", "generation", "lifecycle", "releaseDate", "modelType", "contextTokens", "maxOutputTokens", "speedRating", "bestUse", "tags"];

export default function ImportExportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<number, "create-new" | "update-existing">>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Choose a CSV file to begin.");
  const [busy, setBusy] = useState(false);

  const unresolved = useMemo(() => (preview?.conflicts ?? []).filter((conflict) => conflict.sourceRow && !choices[conflict.sourceRow]), [choices, preview]);
  async function previewFile(nextMapping = mapping) {
    if (!file) return;
    setBusy(true); setStatus("Uploading and building a read-only preview…");
    try {
      const body = new FormData(); body.set("file", file); body.set("mapping", JSON.stringify(nextMapping));
      const response = await fetch("/api/v1/imports/preview", { method: "POST", body });
      const data = await response.json() as Preview & { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Preview failed");
      setPreview(data); setMapping(data.mapping); setStatus(`Preview ready: ${data.rows.length} rows, ${data.conflicts.length} conflicts.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Preview failed"); }
    finally { setBusy(false); }
  }
  async function commit() {
    if (!preview || unresolved.length > 0) return;
    setBusy(true); setStatus("Committing in one transaction…");
    try {
      const plan = preview.plan;
      const response = await fetch("/api/v1/imports/commit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importJobId: preview.importJobId, plan, resolutions: Object.entries(choices).map(([row, action]) => ({ row: Number(row), action })) }) });
      const data = await response.json() as { result?: Record<string, number>; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? "Commit failed; transaction was rolled back");
      setStatus(`Committed successfully: ${JSON.stringify(data.result)}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Commit failed"); }
    finally { setBusy(false); }
  }
  function selectFile(next: File | null) {
    setFile(next); setPreview(null); setChoices({});
    if (!next) return;
    void next.text().then((text) => setHeaders((text.split(/\r?\n/, 1)[0] ?? "").split(",").map((header) => header.replace(/^"|"$/g, "").trim())));
  }
  const exportQuery = new URLSearchParams({ format: "csv", neutralizeFormulas: "true", search });
  const selectedQuery = new URLSearchParams(exportQuery); selectedIds.forEach((id) => selectedQuery.append("modelId", id));

  return <section className="space-y-6" aria-labelledby="import-export-title">
    <div><h1 id="import-export-title" className="text-2xl font-bold text-foreground">Import / Export</h1><p className="text-sm text-muted-foreground">Preview is read-only. Domain data changes only after an explicit commit.</p></div>
    <div className="rounded border border-border bg-card p-5 space-y-4">
      <h2 className="font-semibold">Import CSV</h2>
      <label htmlFor="csv-file">CSV file (maximum 10 MiB)</label><input id="csv-file" aria-describedby="import-status" type="file" accept=".csv,text/csv" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} />
      <button type="button" disabled={!file || busy} onClick={() => void previewFile()} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy ? "Working…" : "Upload and preview"}</button>
      {headers.length > 0 && <fieldset className="grid gap-3 md:grid-cols-2"><legend className="font-semibold">Column mapping</legend>{fields.map((field) => <label key={field} className="flex items-center gap-2" htmlFor={`mapping-${field}`}><span className="w-40">{field}</span><select id={`mapping-${field}`} value={mapping[field] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))} className="rounded border border-border bg-background p-2"><option value="">Not mapped</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</fieldset>}
      {headers.length > 0 && <button type="button" disabled={!file || busy || !mapping.modelName} onClick={() => void previewFile(mapping)} className="rounded border border-border px-4 py-2 disabled:opacity-50">Re-preview with mapping</button>}
      <p id="import-status" role="status" aria-live="polite">{status}</p>
      {preview && <div aria-label="Read-only import preview" className="space-y-3"><p>{preview.rows.length} valid rows · {preview.conflicts.length} conflicts · {(preview.errors ?? []).length} errors</p><div className="overflow-auto"><table><caption className="sr-only">Import row proposals</caption><thead><tr><th>Source row</th><th>Model</th><th>Proposed action</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={`${row.sourceRow}-${row.label}`}><td>{row.sourceRow}</td><td>{row.label}</td><td>{row.classification}</td></tr>)}</tbody></table></div>{(preview.errors ?? []).map((error) => <p key={`${error.row}-${error.message}`} role="alert">Row {error.row ?? "?"}: {error.message}</p>)}{preview.conflicts.map((conflict) => conflict.sourceRow ? <label key={conflict.id} className="flex items-center gap-2" htmlFor={`conflict-${conflict.id}`}>Row {conflict.sourceRow} ({conflict.sourceColumn ?? "model"})<select id={`conflict-${conflict.id}`} value={choices[conflict.sourceRow] ?? ""} onChange={(event) => setChoices((current) => ({ ...current, [conflict.sourceRow!]: event.target.value as "create-new" | "update-existing" }))}><option value="">Choose action</option><option value="create-new">Create new</option><option value="update-existing">Update existing</option></select></label> : null)}<button type="button" disabled={busy || unresolved.length > 0} onClick={() => void commit()} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Commit import transaction</button></div>}
    </div>
    <div className="rounded border border-border bg-card p-5 space-y-3"><h2 className="font-semibold">Export</h2><label htmlFor="export-search">Current model filter</label><input id="export-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models" className="rounded border border-border bg-background p-2" /><label htmlFor="selected-models">Selected model IDs (comma separated)</label><input id="selected-models" value={selectedIds.join(",")} onChange={(event) => setSelectedIds(event.target.value.split(",").map((id) => id.trim()).filter(Boolean))} placeholder="UUIDs" className="rounded border border-border bg-background p-2" /><div className="flex flex-wrap gap-2"><a className="rounded border border-border px-3 py-2" href={`/api/v1/exports/current?${exportQuery}`}>Download current view</a><a className="rounded border border-border px-3 py-2" href={`/api/v1/exports/selected?${selectedQuery}`}>Download selected</a><a className="rounded border border-border px-3 py-2" href="/api/v1/exports/all?format=csv&neutralizeFormulas=true">Download all</a><a className="rounded border border-border px-3 py-2" href="/api/v1/exports/backup?format=json&neutralizeFormulas=true">Download backup archive</a></div></div>
  </section>;
}
