"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  modelWriteSchema,
  workflowStatusValueSchema,
  slugifyModelName,
} from "@model-monitor/schemas";
import {
  Button,
  Dialog,
  Input,
  Select,
  Textarea,
} from "@model-monitor/ui";
import {
  FormField,
  formGridStyle,
  formStackStyle,
  numOrNull,
  readApiError,
  selectToTri,
  emptyToNull,
} from "./form-field";

/** UI form: only `name` is required; everything else optional including access link. */
const addModelFormSchema = modelWriteSchema
  .omit({
    capabilities: true,
    aliases: true,
    needsRecheck: true,
  })
  .extend({
    // Stage-1 access (optional — creates model_access after model if both set)
    accessProviderId: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.string().uuid().optional(),
    ),
    planId: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.string().uuid().optional(),
    ),
    // Stage-2 free-text extras that are not model columns
    tagsText: z.string().optional(),
    priceNote: z.string().optional(),
    quotaNote: z.string().optional(),
    // Capabilities as select strings
    vision: z.string().optional(),
    reasoning: z.string().optional(),
    agentSupport: z.string().optional(),
    // Research (collapsed)
    family: z.string().nullable().optional(),
    generation: z.string().nullable().optional(),
    releaseDate: z.string().nullable().optional(),
    knowledgeCutoff: z.string().nullable().optional(),
    modelType: z.string().nullable().optional(),
    maxOutputTokens: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
      z.number().int().nonnegative().nullable().optional(),
    ),
  });

export type AddModelFormValues = z.infer<typeof addModelFormSchema>;

export interface OptionItem {
  id: string;
  name: string;
  accessProviderId?: string;
}

export interface AddModelDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (model: { id: string; name: string }) => void;
  developers?: OptionItem[];
  providers?: OptionItem[];
  plans?: OptionItem[];
  /** Injected fetch for tests */
  fetchImpl?: typeof fetch;
}

const WORKFLOW_OPTIONS = [
  { value: "", label: "— unset —" },
  { value: "active", label: "Active" },
  { value: "preferred", label: "Preferred" },
  { value: "testing", label: "Testing" },
  { value: "preview", label: "Preview" },
  { value: "legacy", label: "Legacy" },
  { value: "deprecated", label: "Deprecated" },
  { value: "archived", label: "Archived" },
];

const TRI_OPTIONS = [
  { value: "", label: "Unknown" },
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export function AddModelDialog({
  open,
  onClose,
  onCreated,
  developers = [],
  providers = [],
  plans = [],
  fetchImpl = fetch,
}: AddModelDialogProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [serverError, setServerError] = useState<string | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);

  const defaults = useMemo<AddModelFormValues>(
    () => ({
      name: "",
      canonicalId: undefined,
      developerId: undefined,
      workflowStatus: null,
      accessProviderId: undefined,
      planId: undefined,
      contextTokens: null,
      speedRating: null,
      vision: "",
      reasoning: "",
      agentSupport: "",
      tagsText: "",
      priceNote: "",
      quotaNote: "",
      bestUse: null,
      avoidFor: null,
      description: null,
      family: null,
      generation: null,
      releaseDate: null,
      knowledgeCutoff: null,
      modelType: null,
      maxOutputTokens: null,
      lifecycle: "unknown",
    }),
    [],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddModelFormValues>({
    resolver: zodResolver(addModelFormSchema),
    defaultValues: defaults,
    mode: "onSubmit",
  });

  const providerId = watch("accessProviderId");
  const filteredPlans = providerId
    ? plans.filter((p) => !p.accessProviderId || p.accessProviderId === providerId)
    : plans;

  function handleClose() {
    setStage(1);
    setServerError(null);
    setResearchOpen(false);
    reset(defaults);
    onClose();
  }

  async function createRecord(values: AddModelFormValues) {
    setServerError(null);

    const payload: Record<string, unknown> = {
      name: values.name.trim(),
    };

    if (values.canonicalId && String(values.canonicalId).trim()) {
      payload.canonicalId = String(values.canonicalId).trim();
    }
    if (values.developerId) payload.developerId = values.developerId;
    if (values.workflowStatus) payload.workflowStatus = values.workflowStatus;

    if (values.contextTokens != null && !Number.isNaN(values.contextTokens)) {
      payload.contextTokens = values.contextTokens;
    }
    if (values.speedRating) payload.speedRating = values.speedRating;
    if (values.bestUse) payload.bestUse = values.bestUse;
    if (values.avoidFor) payload.avoidFor = values.avoidFor;
    if (values.description) payload.description = values.description;
    if (values.family) payload.family = values.family;
    if (values.generation) payload.generation = values.generation;
    if (values.releaseDate) payload.releaseDate = values.releaseDate;
    if (values.knowledgeCutoff) payload.knowledgeCutoff = values.knowledgeCutoff;
    if (values.modelType) payload.modelType = values.modelType;
    if (values.maxOutputTokens != null && !Number.isNaN(values.maxOutputTokens)) {
      payload.maxOutputTokens = values.maxOutputTokens;
    }

    const caps: Record<string, boolean | null> = {};
    const vision = selectToTri(values.vision ?? "");
    const reasoning = selectToTri(values.reasoning ?? "");
    const agent = selectToTri(values.agentSupport ?? "");
    if (values.vision) caps.vision = vision;
    if (values.reasoning) caps.reasoning = reasoning;
    if (values.agentSupport) caps.parallelAgents = agent;
    if (Object.keys(caps).length > 0) payload.capabilities = caps;

    // Optional notes that don't map to columns — fold into description
    const extras: string[] = [];
    if (values.priceNote?.trim()) extras.push(`Price: ${values.priceNote.trim()}`);
    if (values.quotaNote?.trim()) extras.push(`Quota: ${values.quotaNote.trim()}`);
    if (extras.length > 0) {
      const base = typeof payload.description === "string" ? payload.description : "";
      payload.description = [base, extras.join("\n")].filter(Boolean).join("\n\n");
    }

    const res = await fetchImpl("/api/v1/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(await readApiError(res));
    }

    const model = (await res.json()) as { id: string; name: string };

    // Optional access route when both provider plan chosen
    if (values.planId) {
      const accessRes = await fetchImpl("/api/v1/model-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          planId: values.planId,
          accessMethod: "other",
          availability: "unconfirmed",
        }),
      });
      if (!accessRes.ok) {
        // Model exists; surface soft warning but still succeed create
        setServerError(
          `Model created, but access link failed: ${await readApiError(accessRes)}`,
        );
      }
    }

    // Tags: free-text names ignored for write unless we had IDs — keep optional text only
    void values.tagsText;

    onCreated?.(model);
    return model;
  }

  async function onSave(values: AddModelFormValues) {
    try {
      await createRecord(values);
      handleClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={stage === 1 ? "Add model" : "Add model — details"}
      data-testid="add-model-dialog"
      style={{ maxWidth: "560px" }}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} data-testid="add-model-cancel">
            Cancel
          </Button>
          {stage === 2 ? (
            <Button
              variant="secondary"
              onClick={() => setStage(1)}
              data-testid="add-model-back"
            >
              Back
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setStage(2)}
              data-testid="add-model-next"
            >
              Details
            </Button>
          )}
          <Button
            variant="primary"
            disabled={isSubmitting}
            data-testid="add-model-save"
            onClick={() => void handleSubmit(onSave)()}
          >
            {isSubmitting ? "Saving…" : "Save"}
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
        data-testid="add-model-form"
        data-stage={stage}
        style={formStackStyle}
      >
        {serverError ? (
          <p role="alert" data-testid="add-model-error" style={{ color: "var(--danger)", margin: 0 }}>
            {serverError}
          </p>
        ) : null}

        {stage === 1 ? (
          <div style={formGridStyle}>
            <FormField label="Name" htmlFor="add-model-name" error={errors.name?.message}>
              <Input
                id="add-model-name"
                data-testid="add-model-name"
                invalid={Boolean(errors.name)}
                autoFocus
                {...register("name")}
              />
            </FormField>
            <FormField label="Creator" htmlFor="add-model-creator" optional>
              <Select
                id="add-model-creator"
                data-testid="add-model-creator"
                options={[
                  { value: "", label: "— unset —" },
                  ...developers.map((d) => ({ value: d.id, label: d.name })),
                ]}
                value={watch("developerId") ?? ""}
                onChange={(v) =>
                  setValue("developerId", v ? v : undefined, { shouldValidate: false })
                }
              />
            </FormField>
            <FormField
              label="Model ID"
              htmlFor="add-model-canonical"
              optional
              hint="Leave blank to auto-generate"
            >
              <Input
                id="add-model-canonical"
                data-testid="add-model-canonical"
                placeholder={
                  watch("name")
                    ? `local:${slugifyModelName(watch("name") || "model")}`
                    : "auto"
                }
                {...register("canonicalId")}
              />
            </FormField>
            <FormField label="Status" htmlFor="add-model-status" optional>
              <Select
                id="add-model-status"
                data-testid="add-model-status"
                options={WORKFLOW_OPTIONS}
                value={watch("workflowStatus") ?? ""}
                onChange={(v) => {
                  const parsed = workflowStatusValueSchema.safeParse(v);
                  setValue("workflowStatus", parsed.success ? parsed.data : null, {
                    shouldValidate: false,
                  });
                }}
              />
            </FormField>
            <FormField label="Access provider" htmlFor="add-model-provider" optional>
              <Select
                id="add-model-provider"
                data-testid="add-model-provider"
                options={[
                  { value: "", label: "— unset —" },
                  ...providers.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={watch("accessProviderId") ?? ""}
                onChange={(v) => {
                  setValue("accessProviderId", v || undefined, { shouldValidate: false });
                  setValue("planId", undefined, { shouldValidate: false });
                }}
              />
            </FormField>
            <FormField label="Plan" htmlFor="add-model-plan" optional>
              <Select
                id="add-model-plan"
                data-testid="add-model-plan"
                options={[
                  { value: "", label: "— unset —" },
                  ...filteredPlans.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={watch("planId") ?? ""}
                onChange={(v) => setValue("planId", v || undefined, { shouldValidate: false })}
              />
            </FormField>
          </div>
        ) : (
          <div style={formStackStyle}>
            <div style={formGridStyle}>
              <FormField label="Context tokens" htmlFor="add-model-context" optional>
                <Input
                  id="add-model-context"
                  data-testid="add-model-context"
                  type="number"
                  {...register("contextTokens", {
                    setValueAs: (v: string) => numOrNull(v),
                  })}
                />
              </FormField>
              <FormField label="Speed" htmlFor="add-model-speed" optional>
                <Input
                  id="add-model-speed"
                  data-testid="add-model-speed"
                  placeholder="e.g. fast"
                  {...register("speedRating", { setValueAs: emptyToNull })}
                />
              </FormField>
              <FormField label="Vision" htmlFor="add-model-vision" optional>
                <Select
                  id="add-model-vision"
                  data-testid="add-model-vision"
                  options={TRI_OPTIONS}
                  value={watch("vision") ?? ""}
                  onChange={(v) => setValue("vision", v)}
                />
              </FormField>
              <FormField label="Reasoning" htmlFor="add-model-reasoning" optional>
                <Select
                  id="add-model-reasoning"
                  data-testid="add-model-reasoning"
                  options={TRI_OPTIONS}
                  value={watch("reasoning") ?? ""}
                  onChange={(v) => setValue("reasoning", v)}
                />
              </FormField>
              <FormField label="Agent support" htmlFor="add-model-agent" optional>
                <Select
                  id="add-model-agent"
                  data-testid="add-model-agent"
                  options={TRI_OPTIONS}
                  value={watch("agentSupport") ?? ""}
                  onChange={(v) => setValue("agentSupport", v)}
                />
              </FormField>
              <FormField label="Tags" htmlFor="add-model-tags" optional hint="Comma-separated labels (reference only on create)">
                <Input
                  id="add-model-tags"
                  data-testid="add-model-tags"
                  {...register("tagsText")}
                />
              </FormField>
              <FormField label="Price" htmlFor="add-model-price" optional hint="Stored as a note; plan owns pricing">
                <Input
                  id="add-model-price"
                  data-testid="add-model-price"
                  {...register("priceNote")}
                />
              </FormField>
              <FormField label="Quota" htmlFor="add-model-quota" optional hint="Stored as a note; plan owns quotas">
                <Input
                  id="add-model-quota"
                  data-testid="add-model-quota"
                  {...register("quotaNote")}
                />
              </FormField>
            </div>
            <FormField label="Best use" htmlFor="add-model-best-use" optional>
              <Textarea id="add-model-best-use" data-testid="add-model-best-use" rows={2} {...register("bestUse", { setValueAs: emptyToNull })} />
            </FormField>
            <FormField label="Avoid for" htmlFor="add-model-avoid" optional>
              <Textarea id="add-model-avoid" data-testid="add-model-avoid" rows={2} {...register("avoidFor", { setValueAs: emptyToNull })} />
            </FormField>
            <FormField
              label="Overall score"
              htmlFor="add-model-overall"
              optional
              hint="Computed from skill ratings — not stored on create"
            >
              <Input
                id="add-model-overall"
                data-testid="add-model-overall"
                disabled
                readOnly
                placeholder="Untested — rate skills after create"
              />
            </FormField>
            <FormField label="Notes" htmlFor="add-model-notes" optional>
              <Textarea id="add-model-notes" data-testid="add-model-notes" rows={3} {...register("description", { setValueAs: emptyToNull })} />
            </FormField>

            <details
              open={researchOpen}
              onToggle={(e) => setResearchOpen((e.target as HTMLDetailsElement).open)}
              data-testid="add-model-research"
            >
              <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>
                Advanced research fields
              </summary>
              <div style={{ ...formGridStyle, marginTop: "var(--space-3)" }}>
                <FormField label="Family" htmlFor="add-model-family" optional>
                  <Input id="add-model-family" data-testid="add-model-family" {...register("family", { setValueAs: emptyToNull })} />
                </FormField>
                <FormField label="Generation" htmlFor="add-model-generation" optional>
                  <Input id="add-model-generation" {...register("generation", { setValueAs: emptyToNull })} />
                </FormField>
                <FormField label="Release date" htmlFor="add-model-release" optional>
                  <Input id="add-model-release" type="date" {...register("releaseDate", { setValueAs: emptyToNull })} />
                </FormField>
                <FormField label="Knowledge cutoff" htmlFor="add-model-cutoff" optional>
                  <Input id="add-model-cutoff" {...register("knowledgeCutoff", { setValueAs: emptyToNull })} />
                </FormField>
                <FormField label="Model type" htmlFor="add-model-type" optional>
                  <Input id="add-model-type" {...register("modelType", { setValueAs: emptyToNull })} />
                </FormField>
                <FormField label="Max output tokens" htmlFor="add-model-max-out" optional>
                  <Input
                    id="add-model-max-out"
                    type="number"
                    {...register("maxOutputTokens", {
                      setValueAs: (v: string) => numOrNull(v),
                    })}
                  />
                </FormField>
              </div>
            </details>
          </div>
        )}
      </form>
    </Dialog>
  );
}
