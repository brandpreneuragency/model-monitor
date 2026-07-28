"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { modelWriteSchema } from "@model-monitor/schemas";
import type { z } from "zod";

const formSchema = modelWriteSchema;
type FormValues = z.infer<typeof formSchema>;

interface Developer {
  id: string;
  name: string;
  slug: string;
}

interface AliasInitial {
  id?: string;
  alias: string;
  aliasType?: "display" | "short" | "provider" | "legacy" | "other";
  accessProviderId?: string | null;
}

interface Props {
  mode: "create" | "edit";
  developers: Developer[];
  initial?: Partial<FormValues> & {
    id?: string;
    aliasesText?: string;
    aliases?: AliasInitial[];
    capabilities?: {
      vision?: boolean | null;
      reasoning?: boolean | null;
      toolUse?: boolean | null;
    };
  };
}

function triToSelect(v: boolean | null | undefined): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "unknown";
}

function selectToTri(v: string): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export function ModelForm({ mode, developers, initial }: Props) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const initialAliasRows: AliasInitial[] = initial?.aliases ?? [];
  const initialAliasesText =
    initial?.aliasesText ??
    initialAliasRows.map((a) => a.alias).join("\n");
  const [aliasesText, setAliasesText] = useState(initialAliasesText);
  const [aliasRows, setAliasRows] = useState<AliasInitial[]>(() =>
    initialAliasRows.map((a, index) => ({ ...a, id: a.id ?? `initial-${index}` })),
  );
  const [aliasesTouched, setAliasesTouched] = useState(false);
  const [vision, setVision] = useState(triToSelect(initial?.capabilities?.vision));
  const [reasoning, setReasoning] = useState(triToSelect(initial?.capabilities?.reasoning));
  const [toolUse, setToolUse] = useState(triToSelect(initial?.capabilities?.toolUse));
  const [canonicalWarning, setCanonicalWarning] = useState<string | null>(null);
  /** Bound to the exact pending canonical ID that was shown when confirmation opened. */
  const [pendingCanonicalConfirm, setPendingCanonicalConfirm] = useState<string | null>(null);

  const defaults = useMemo<FormValues>(
    () => ({
      canonicalId: initial?.canonicalId ?? "",
      name: initial?.name ?? "",
      developerId: initial?.developerId ?? developers[0]?.id ?? "",
      family: initial?.family ?? null,
      generation: initial?.generation ?? null,
      lifecycle: initial?.lifecycle ?? "unknown",
      lifecycleRaw: initial?.lifecycleRaw ?? null,
      releaseDate: initial?.releaseDate ?? null,
      knowledgeCutoff: initial?.knowledgeCutoff ?? null,
      modelType: initial?.modelType ?? null,
      description: initial?.description ?? null,
      codingSpecialization: initial?.codingSpecialization ?? null,
      bestUse: initial?.bestUse ?? null,
      avoidFor: initial?.avoidFor ?? null,
      contextTokens: initial?.contextTokens ?? null,
      maxOutputTokens: initial?.maxOutputTokens ?? null,
      speedRating: initial?.speedRating ?? null,
      needsRecheck: initial?.needsRecheck ?? true,
    }),
    [developers, initial],
  );

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });

  async function save(values: FormValues) {
    setServerError(null);
    const payload: Record<string, unknown> = {
      ...values,
      contextTokens:
        values.contextTokens == null || Number.isNaN(values.contextTokens)
          ? null
          : values.contextTokens,
      maxOutputTokens:
        values.maxOutputTokens == null || Number.isNaN(values.maxOutputTokens)
          ? null
          : values.maxOutputTokens,
      capabilities: {
        vision: selectToTri(vision),
        reasoning: selectToTri(reasoning),
        toolUse: selectToTri(toolUse),
      },
    };

    // Keep the structured metadata associated with the original line position
    // when the text is edited. New lines are explicitly display aliases.
    if (mode === "create" || aliasesTouched || aliasesText !== initialAliasesText) {
      payload.aliases = aliasRows
        .map((row) => ({
          alias: row.alias.trim(),
          aliasType: row.aliasType ?? "display",
          accessProviderId: row.accessProviderId ?? null,
        }))
        .filter((row) => row.alias.length > 0);
    }

    const res = await fetch(
      mode === "create" ? "/api/v1/models" : `/api/v1/models/${initial?.id}`,
      {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setServerError(body?.error?.message ?? "Save failed");
      // Failed save invalidates prior canonical-ID confirmation.
      setPendingCanonicalConfirm(null);
      setCanonicalWarning(null);
      return;
    }

    const model = (await res.json()) as { id: string };
    router.push(`/models/${model.id}`);
    router.refresh();
  }

  async function onSubmit(values: FormValues) {
    const nextCanonical = (values.canonicalId ?? "").trim();
    if (
      mode === "edit" &&
      initial?.canonicalId &&
      nextCanonical !== initial.canonicalId &&
      pendingCanonicalConfirm !== nextCanonical
    ) {
      setCanonicalWarning(
        `You are changing the canonical ID from “${initial.canonicalId}” to “${nextCanonical}”. External references may break.`,
      );
      setPendingCanonicalConfirm(null);
      return;
    }
    await save(values);
  }

  function confirmCanonicalChange() {
    const current = (getValues("canonicalId") ?? "").trim();
    if (!initial?.canonicalId || current === initial.canonicalId) {
      setCanonicalWarning(null);
      setPendingCanonicalConfirm(null);
      return;
    }
    // Bind confirmation to the immutable value displayed at confirm time.
    setPendingCanonicalConfirm(current);
    setCanonicalWarning(null);
    void handleSubmit(async (values) => {
      if ((values.canonicalId ?? "").trim() !== current) {
        setPendingCanonicalConfirm(null);
        setCanonicalWarning(
          `Canonical ID changed while confirmation was open. Confirm the new value “${(values.canonicalId ?? "").trim()}” again.`,
        );
        return;
      }
      await save(values);
    })();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="mx-auto max-w-3xl space-y-6"
      data-testid="model-form"
      noValidate
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name" error={errors.name?.message} htmlFor="field-name">
          <input
            id="field-name"
            {...register("name")}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "field-name-error" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="field-name"
          />
        </Field>
        <Field
          label="Canonical ID"
          error={errors.canonicalId?.message}
          htmlFor="field-canonical-id"
          hint={mode === "edit" ? "Changing this ID requires confirmation." : undefined}
        >
          <input
            id="field-canonical-id"
            {...register("canonicalId", {
              onChange: () => {
                setPendingCanonicalConfirm(null);
                if (canonicalWarning) setCanonicalWarning(null);
              },
            })}
            aria-invalid={errors.canonicalId ? true : undefined}
            aria-describedby={
              errors.canonicalId
                ? "field-canonical-id-error"
                : mode === "edit"
                  ? "field-canonical-id-hint"
                  : undefined
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
            data-testid="field-canonical-id"
          />
        </Field>
        <Field label="Developer" error={errors.developerId?.message} htmlFor="field-developer">
          <select
            id="field-developer"
            {...register("developerId")}
            aria-invalid={errors.developerId ? true : undefined}
            aria-describedby={errors.developerId ? "field-developer-error" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="field-developer"
          >
            {developers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lifecycle" error={errors.lifecycle?.message} htmlFor="field-lifecycle">
          <select
            id="field-lifecycle"
            {...register("lifecycle")}
            aria-invalid={errors.lifecycle ? true : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="field-lifecycle"
          >
            {[
              "current",
              "ga",
              "preview",
              "beta",
              "legacy",
              "deprecated",
              "retired",
              "unavailable",
              "unknown",
            ].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Family" htmlFor="field-family">
          <input
            id="field-family"
            {...register("family")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="field-family"
          />
        </Field>
        <Field label="Generation" htmlFor="field-generation">
          <input
            id="field-generation"
            {...register("generation")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field
          label="Context tokens"
          htmlFor="field-context-tokens"
          error={errors.contextTokens?.message}
        >
          <input
            id="field-context-tokens"
            type="number"
            {...register("contextTokens", {
              setValueAs: (v: string) => (v === "" ? null : Number(v)),
            })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="field-context-tokens"
            aria-invalid={errors.contextTokens ? true : undefined}
            aria-describedby={errors.contextTokens ? "field-context-tokens-error" : undefined}
          />
        </Field>
        <Field
          label="Max output tokens"
          htmlFor="field-max-output-tokens"
          error={errors.maxOutputTokens?.message}
        >
          <input
            id="field-max-output-tokens"
            type="number"
            {...register("maxOutputTokens", {
              setValueAs: (v: string) => (v === "" ? null : Number(v)),
            })}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="field-max-output-tokens"
            aria-invalid={errors.maxOutputTokens ? true : undefined}
            aria-describedby={errors.maxOutputTokens ? "field-max-output-tokens-error" : undefined}
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TriSelect label="Vision" value={vision} onChange={setVision} testId="field-vision" />
        <TriSelect
          label="Reasoning"
          value={reasoning}
          onChange={setReasoning}
          testId="field-reasoning"
        />
        <TriSelect label="Tool use" value={toolUse} onChange={setToolUse} testId="field-tool-use" />
      </div>

      <Field label="Best use" htmlFor="field-best-use">
        <textarea
          id="field-best-use"
          {...register("bestUse")}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Avoid for" htmlFor="field-avoid-for">
        <textarea
          id="field-avoid-for"
          {...register("avoidFor")}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Description" htmlFor="field-description">
        <textarea
          id="field-description"
          {...register("description")}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </Field>
      <div className="space-y-2" data-testid="structured-aliases">
        <p className="text-xs text-muted-foreground">Aliases</p>
        {aliasRows.map((row, index) => (
          <div key={row.id ?? `alias-${index}`} className="grid gap-2 md:grid-cols-[1fr_9rem_1fr_auto]">
            <input
              aria-label={`Alias ${index + 1}`}
              value={row.alias}
              onChange={(e) => {
                setAliasesTouched(true);
                setAliasRows((rows) => rows.map((r, i) => (i === index ? { ...r, alias: e.target.value } : r)));
                setAliasesText((text) => text);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid={index === 0 ? "field-aliases" : `field-alias-${index}`}
            />
            <select
              aria-label={`Alias ${index + 1} type`}
              value={row.aliasType ?? "display"}
              onChange={(e) => {
                setAliasesTouched(true);
                setAliasRows((rows) => rows.map((r, i) => (i === index ? { ...r, aliasType: e.target.value as AliasInitial["aliasType"] } : r)));
              }}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
            >
              <option value="display">display</option>
              <option value="short">short</option>
              <option value="provider">provider</option>
              <option value="legacy">legacy</option>
              <option value="other">other</option>
            </select>
            <input
              aria-label={`Alias ${index + 1} provider ID`}
              value={row.accessProviderId ?? ""}
              placeholder="Provider ID (optional)"
              onChange={(e) => {
                setAliasesTouched(true);
                setAliasRows((rows) => rows.map((r, i) => (i === index ? { ...r, accessProviderId: e.target.value || null } : r)));
              }}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
            />
            <button type="button" className="rounded-md border border-border px-2" onClick={() => { setAliasesTouched(true); setAliasRows((rows) => rows.filter((_, i) => i !== index)); }} aria-label={`Delete alias ${index + 1}`}>
              Delete
            </button>
          </div>
        ))}
        <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={() => { setAliasesTouched(true); setAliasRows((rows) => [...rows, { id: crypto.randomUUID(), alias: "", aliasType: "display", accessProviderId: null }]); }}>
          Add display alias
        </button>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("needsRecheck")} data-testid="field-needs-recheck" />
        Needs recheck
      </label>

      {serverError ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          data-testid="form-error"
          role="alert"
          aria-live="assertive"
        >
          {serverError}
        </p>
      ) : null}

      {canonicalWarning ? (
        <div
          className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm"
          role="alert"
          aria-live="assertive"
          data-testid="canonical-id-warning"
        >
          <p id="canonical-warning-title" className="font-medium">
            Confirm canonical ID change
          </p>
          <p id="canonical-warning-body">{canonicalWarning}</p>
          <p className="text-xs text-muted-foreground">
            Pending value to confirm:{" "}
            <code data-testid="canonical-id-pending-value">{(getValues("canonicalId") ?? "").trim()}</code>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              data-testid="canonical-id-confirm"
              onClick={confirmCanonicalChange}
            >
              Yes, change canonical ID
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1.5 text-sm"
              data-testid="canonical-id-cancel"
              onClick={() => {
                setCanonicalWarning(null);
                setPendingCanonicalConfirm(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          data-testid="model-form-submit"
        >
          {isSubmitting ? "Saving…" : mode === "create" ? "Create model" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
  htmlFor,
  hint,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  return (
    <div className="block space-y-1 text-xs">
      <label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? (
        <span id={hintId} className="block text-muted-foreground">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="block text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function TriSelect({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  const id = testId;
  return (
    <div className="block space-y-1 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        data-testid={testId}
      >
        <option value="unknown">Unknown</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </div>
  );
}
