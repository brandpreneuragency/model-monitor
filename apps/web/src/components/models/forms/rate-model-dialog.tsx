"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { personalConfidenceSchema } from "@model-monitor/schemas";
import { Button, Dialog, Input, Select, Textarea } from "@model-monitor/ui";
import {
  FormField,
  formGridStyle,
  formStackStyle,
  numOrNull,
  readApiError,
  emptyToNull,
} from "./form-field";
import type { OptionItem } from "./add-model-dialog";

/**
 * Personal-only rating body. Intentionally omits every external_* field so the
 * dialog can never write, overwrite, or derive an external score.
 */
export const personalRatingFormSchema = z.object({
  skillId: z
    .string()
    .trim()
    .min(1, "Skill is required")
    .uuid({ message: "Skill is required" }),
  personalScore: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    },
    z.number().min(1).max(10).nullable(),
  ),
  personalConfidence: personalConfidenceSchema.nullable().optional(),
  testedAt: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.string().date().nullable().optional(),
  ),
  notes: z.preprocess(emptyToNull, z.string().max(8000).nullable().optional()),
  rankOverride: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    },
    z.number().int().nullable().optional(),
  ),
  tested: z.boolean().optional(),
});

export type PersonalRatingFormValues = z.infer<typeof personalRatingFormSchema>;

/** Strip any accidental external keys before network write. */
export function toPersonalRatingPayload(
  values: PersonalRatingFormValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    personalScore: values.personalScore,
    personalConfidence: values.personalConfidence ?? null,
    testedAt: values.testedAt ?? null,
    notes: values.notes ?? null,
    rankOverride: values.rankOverride ?? null,
    tested:
      values.tested ??
      (values.personalScore != null || values.testedAt != null),
  };
  // Hard guarantee — never emit external fields
  delete payload.externalScore;
  delete payload.external_score;
  delete payload.externalRank;
  delete payload.externalConfidence;
  return payload;
}

export interface RateModelDialogProps {
  open: boolean;
  onClose: () => void;
  modelId: string;
  modelName?: string;
  skills?: OptionItem[];
  initial?: Partial<PersonalRatingFormValues> & {
    externalScore?: number | null;
  };
  onSaved?: (rating: unknown) => void;
  fetchImpl?: typeof fetch;
}

const CONFIDENCE_OPTIONS = [
  { value: "", label: "— unset —" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function RateModelDialog({
  open,
  onClose,
  modelId,
  modelName,
  skills = [],
  initial,
  onSaved,
  fetchImpl = fetch,
}: RateModelDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const defaults = useMemo<PersonalRatingFormValues>(
    () => ({
      skillId: initial?.skillId ?? "",
      personalScore: initial?.personalScore ?? null,
      personalConfidence: initial?.personalConfidence ?? null,
      testedAt: initial?.testedAt ?? null,
      notes: initial?.notes ?? null,
      rankOverride: initial?.rankOverride ?? null,
      tested: initial?.tested ?? false,
    }),
    [initial],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PersonalRatingFormValues>({
    resolver: zodResolver(personalRatingFormSchema),
    defaultValues: defaults,
  });

  function handleClose() {
    setServerError(null);
    reset(defaults);
    onClose();
  }

  async function onSave(values: PersonalRatingFormValues) {
    setServerError(null);
    const payload = toPersonalRatingPayload(values);

    // Absolute guard: reject if anything external slipped in
    for (const key of Object.keys(payload)) {
      if (key.toLowerCase().startsWith("external")) {
        setServerError("Refusing to write external score fields");
        return;
      }
    }

    try {
      const res = await fetchImpl(
        `/api/v1/models/${modelId}/ratings/${values.skillId}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(await readApiError(res));
      const rating: unknown = await res.json();
      onSaved?.(rating);
      handleClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={modelName ? `Rate · ${modelName}` : "Rate model"}
      data-testid="rate-model-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting}
            data-testid="rate-model-save"
            onClick={() => void handleSubmit(onSave)()}
          >
            {isSubmitting ? "Saving…" : "Save rating"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit(onSave)();
        }}
        noValidate
        data-testid="rate-model-form"
        style={formStackStyle}
      >
        {serverError ? (
          <p role="alert" data-testid="rate-model-error" style={{ color: "var(--danger)", margin: 0 }}>
            {serverError}
          </p>
        ) : null}

        {initial?.externalScore != null ? (
          <p
            data-testid="rate-model-external-readonly"
            style={{
              margin: 0,
              color: "var(--text-muted)",
              fontSize: "var(--text-meta-size)",
            }}
          >
            External score (read-only): {initial.externalScore}. This form never
            changes external scores.
          </p>
        ) : null}

        <div style={formGridStyle}>
          <FormField
            label="Skill"
            htmlFor="rate-skill"
            error={errors.skillId?.message}
          >
            <Select
              id="rate-skill"
              data-testid="rate-skill"
              options={[
                { value: "", label: "— select —" },
                ...skills.map((s) => ({ value: s.id, label: s.name })),
              ]}
              value={watch("skillId") ?? ""}
              onChange={(v) =>
                setValue("skillId", v, {
                  shouldValidate: true,
                })
              }
            />
          </FormField>
          <FormField
            label="Score (1–10)"
            htmlFor="rate-score"
            error={errors.personalScore?.message}
            optional
          >
            <Input
              id="rate-score"
              data-testid="rate-score"
              type="number"
              min={1}
              max={10}
              step={0.5}
              {...register("personalScore")}
            />
          </FormField>
          <FormField label="Confidence" htmlFor="rate-confidence" optional>
            <Select
              id="rate-confidence"
              data-testid="rate-confidence"
              options={CONFIDENCE_OPTIONS}
              value={watch("personalConfidence") ?? ""}
              onChange={(v) =>
                setValue(
                  "personalConfidence",
                  v
                    ? (v as z.infer<typeof personalConfidenceSchema>)
                    : null,
                )
              }
            />
          </FormField>
          <FormField label="Test date" htmlFor="rate-tested-at" optional>
            <Input
              id="rate-tested-at"
              data-testid="rate-tested-at"
              type="date"
              {...register("testedAt")}
            />
          </FormField>
          <FormField label="Rank override" htmlFor="rate-rank-override" optional>
            <Input
              id="rate-rank-override"
              data-testid="rate-rank-override"
              type="number"
              {...register("rankOverride", {
                setValueAs: (v: string) => {
                  if (v === "" || v == null) return null;
                  const n = numOrNull(v);
                  return n == null ? null : Math.trunc(n);
                },
              })}
            />
          </FormField>
        </div>
        <FormField label="Notes" htmlFor="rate-notes" optional>
          <Textarea
            id="rate-notes"
            data-testid="rate-notes"
            rows={3}
            {...register("notes")}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
