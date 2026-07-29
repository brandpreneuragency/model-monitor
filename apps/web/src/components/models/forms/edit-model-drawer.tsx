"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  workflowStatusValueSchema,
} from "@model-monitor/schemas";
import {
  Button,
  Drawer,
  Input,
  Select,
  Textarea,
} from "@model-monitor/ui";
import {
  FormField,
  formGridStyle,
  formStackStyle,
  groupBoxStyle,
  groupTitleStyle,
  numOrNull,
  readApiError,
  selectToTri,
  triToSelect,
  emptyToNull,
} from "./form-field";
import type { OptionItem } from "./add-model-dialog";

const identitySchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  canonicalId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().trim().min(1).optional(),
  ),
  developerId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().uuid().optional(),
  ),
  workflowStatus: workflowStatusValueSchema.nullable().optional(),
  family: z.preprocess(emptyToNull, z.string().nullable().optional()),
  generation: z.preprocess(emptyToNull, z.string().nullable().optional()),
  modelType: z.preprocess(emptyToNull, z.string().nullable().optional()),
  lifecycle: z
    .enum([
      "current",
      "ga",
      "preview",
      "beta",
      "legacy",
      "deprecated",
      "retired",
      "unavailable",
      "unknown",
    ])
    .optional(),
});

const capabilitiesSchema = z.object({
  vision: z.string().optional(),
  reasoning: z.string().optional(),
  toolUse: z.string().optional(),
  agentSupport: z.string().optional(),
  contextTokens: z.number().int().nonnegative().nullable().optional(),
  maxOutputTokens: z.number().int().nonnegative().nullable().optional(),
  speedRating: z.string().nullable().optional(),
});

const assessmentSchema = z.object({
  bestUse: z.string().nullable().optional(),
  avoidFor: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isFavourite: z.boolean().optional(),
  needsReview: z.boolean().optional(),
});

const researchSchema = z.object({
  releaseDate: z.string().nullable().optional(),
  knowledgeCutoff: z.string().nullable().optional(),
  codingSpecialization: z.string().nullable().optional(),
});

const accessLinkSchema = z.object({
  planId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.string().uuid().optional(),
  ),
  accessMethod: z.string().optional(),
  providerModelId: z.string().nullable().optional(),
});

const costSchema = z.object({
  priceNote: z.string().optional(),
  quotaNote: z.string().optional(),
});

export type EditModelInitial = {
  id: string;
  name: string;
  canonicalId?: string | null;
  developerId?: string | null;
  workflowStatus?: string | null;
  family?: string | null;
  generation?: string | null;
  modelType?: string | null;
  lifecycle?: string | null;
  contextTokens?: number | null;
  maxOutputTokens?: number | null;
  speedRating?: string | null;
  bestUse?: string | null;
  avoidFor?: string | null;
  description?: string | null;
  isFavourite?: boolean;
  needsReview?: boolean;
  releaseDate?: string | null;
  knowledgeCutoff?: string | null;
  codingSpecialization?: string | null;
  capabilities?: {
    vision?: boolean | null;
    reasoning?: boolean | null;
    toolUse?: boolean | null;
    parallelAgents?: boolean | null;
  } | null;
};

export interface EditModelDrawerProps {
  open: boolean;
  onClose: () => void;
  model: EditModelInitial;
  developers?: OptionItem[];
  plans?: OptionItem[];
  onSaved?: () => void;
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

const LIFECYCLE_OPTIONS = [
  "unknown",
  "current",
  "ga",
  "preview",
  "beta",
  "legacy",
  "deprecated",
  "retired",
  "unavailable",
].map((v) => ({ value: v, label: v }));

type GroupKey =
  | "identity"
  | "capabilities"
  | "access"
  | "cost"
  | "assessment"
  | "research";

export function EditModelDrawer({
  open,
  onClose,
  model,
  developers = [],
  plans = [],
  onSaved,
  fetchImpl = fetch,
}: EditModelDrawerProps) {
  const [groupError, setGroupError] = useState<Partial<Record<GroupKey, string>>>({});
  const [groupOk, setGroupOk] = useState<Partial<Record<GroupKey, string>>>({});
  const [saving, setSaving] = useState<GroupKey | null>(null);

  type IdentityValues = z.infer<typeof identitySchema>;

  const identityForm = useForm<IdentityValues>({
    resolver: zodResolver(identitySchema),
    defaultValues: {
      name: model.name,
      canonicalId: model.canonicalId ?? undefined,
      developerId: model.developerId ?? undefined,
      workflowStatus:
        (model.workflowStatus as IdentityValues["workflowStatus"]) ?? null,
      family: model.family ?? null,
      generation: model.generation ?? null,
      modelType: model.modelType ?? null,
      lifecycle: (model.lifecycle as IdentityValues["lifecycle"]) ?? "unknown",
    },
  });

  const capsForm = useForm({
    resolver: zodResolver(capabilitiesSchema),
    defaultValues: {
      vision: triToSelect(model.capabilities?.vision),
      reasoning: triToSelect(model.capabilities?.reasoning),
      toolUse: triToSelect(model.capabilities?.toolUse),
      agentSupport: triToSelect(model.capabilities?.parallelAgents),
      contextTokens: model.contextTokens ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      speedRating: model.speedRating ?? null,
    },
  });

  const accessForm = useForm({
    resolver: zodResolver(accessLinkSchema),
    defaultValues: {
      planId: undefined as string | undefined,
      accessMethod: "other",
      providerModelId: null as string | null,
    },
  });

  const costForm = useForm({
    resolver: zodResolver(costSchema),
    defaultValues: { priceNote: "", quotaNote: "" },
  });

  const assessmentForm = useForm({
    resolver: zodResolver(assessmentSchema),
    defaultValues: {
      bestUse: model.bestUse ?? null,
      avoidFor: model.avoidFor ?? null,
      description: model.description ?? null,
      isFavourite: model.isFavourite ?? false,
      needsReview: model.needsReview ?? false,
    },
  });

  const researchForm = useForm({
    resolver: zodResolver(researchSchema),
    defaultValues: {
      releaseDate: model.releaseDate ?? null,
      knowledgeCutoff: model.knowledgeCutoff ?? null,
      codingSpecialization: model.codingSpecialization ?? null,
    },
  });

  const modelId = model.id;

  async function patchModel(body: Record<string, unknown>, group: GroupKey) {
    setSaving(group);
    setGroupError((e) => ({ ...e, [group]: undefined }));
    setGroupOk((o) => ({ ...o, [group]: undefined }));
    try {
      const res = await fetchImpl(`/api/v1/models/${modelId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setGroupOk((o) => ({ ...o, [group]: "Saved" }));
      onSaved?.();
    } catch (err) {
      setGroupError((e) => ({
        ...e,
        [group]: err instanceof Error ? err.message : "Save failed",
      }));
    } finally {
      setSaving(null);
    }
  }

  async function saveIdentity(values: z.infer<typeof identitySchema>) {
    const body: Record<string, unknown> = {
      name: values.name,
    };
    if (values.canonicalId) body.canonicalId = values.canonicalId;
    if (values.developerId) body.developerId = values.developerId;
    if (values.workflowStatus !== undefined) body.workflowStatus = values.workflowStatus;
    if (values.family !== undefined) body.family = values.family;
    if (values.generation !== undefined) body.generation = values.generation;
    if (values.modelType !== undefined) body.modelType = values.modelType;
    if (values.lifecycle !== undefined) body.lifecycle = values.lifecycle;
    await patchModel(body, "identity");
  }

  async function saveCapabilities(values: z.infer<typeof capabilitiesSchema>) {
    await patchModel(
      {
        contextTokens: values.contextTokens ?? null,
        maxOutputTokens: values.maxOutputTokens ?? null,
        speedRating: values.speedRating ?? null,
        capabilities: {
          vision: selectToTri(values.vision ?? ""),
          reasoning: selectToTri(values.reasoning ?? ""),
          toolUse: selectToTri(values.toolUse ?? ""),
          parallelAgents: selectToTri(values.agentSupport ?? ""),
        },
      },
      "capabilities",
    );
  }

  async function saveAccess(values: z.infer<typeof accessLinkSchema>) {
    setSaving("access");
    setGroupError((e) => ({ ...e, access: undefined }));
    setGroupOk((o) => ({ ...o, access: undefined }));
    try {
      if (!values.planId) {
        setGroupOk((o) => ({ ...o, access: "No plan selected — nothing to link" }));
        return;
      }
      const res = await fetchImpl("/api/v1/model-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modelId,
          planId: values.planId,
          accessMethod: values.accessMethod || "other",
          providerModelId: values.providerModelId ?? null,
          availability: "unconfirmed",
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      setGroupOk((o) => ({ ...o, access: "Access route added" }));
      onSaved?.();
    } catch (err) {
      setGroupError((e) => ({
        ...e,
        access: err instanceof Error ? err.message : "Save failed",
      }));
    } finally {
      setSaving(null);
    }
  }

  async function saveCost(values: z.infer<typeof costSchema>) {
    // Cost lives on plan; store as notes on the model description appendix via assessment path
    const notes = [
      values.priceNote?.trim() ? `Price note: ${values.priceNote.trim()}` : "",
      values.quotaNote?.trim() ? `Quota note: ${values.quotaNote.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (!notes) {
      setGroupOk((o) => ({ ...o, cost: "Nothing to save" }));
      return;
    }
    const existing = assessmentForm.getValues("description") ?? "";
    const next = [existing, notes].filter(Boolean).join("\n\n");
    await patchModel({ description: next }, "cost");
    assessmentForm.setValue("description", next);
  }

  async function saveAssessment(values: z.infer<typeof assessmentSchema>) {
    await patchModel(
      {
        bestUse: values.bestUse ?? null,
        avoidFor: values.avoidFor ?? null,
        description: values.description ?? null,
        isFavourite: values.isFavourite ?? false,
        needsReview: values.needsReview ?? false,
      },
      "assessment",
    );
  }

  async function saveResearch(values: z.infer<typeof researchSchema>) {
    await patchModel(
      {
        releaseDate: values.releaseDate || null,
        knowledgeCutoff: values.knowledgeCutoff ?? null,
        codingSpecialization: values.codingSpecialization ?? null,
      },
      "research",
    );
  }

  const groups = useMemo(
    () =>
      [
        "Identity",
        "Capabilities",
        "Access",
        "Cost and quota",
        "Personal assessment",
        "External research",
      ] as const,
    [],
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Edit · ${model.name}`}
      size="lg"
      style={{ width: "min(720px, 100vw)" }}
      data-testid="edit-model-drawer"
    >
      <div style={formStackStyle} data-groups={groups.join("|")}>
        {/* Identity */}
        <section style={groupBoxStyle} data-testid="edit-group-identity">
          <h3 style={groupTitleStyle}>Identity</h3>
          <div style={formGridStyle}>
            <FormField label="Name" htmlFor="edit-name" error={identityForm.formState.errors.name?.message}>
              <Input id="edit-name" data-testid="edit-name" {...identityForm.register("name")} />
            </FormField>
            <FormField label="Model ID" htmlFor="edit-canonical" optional>
              <Input id="edit-canonical" data-testid="edit-canonical" {...identityForm.register("canonicalId")} />
            </FormField>
            <FormField label="Creator" htmlFor="edit-creator" optional>
              <Select
                id="edit-creator"
                data-testid="edit-creator"
                options={[
                  { value: "", label: "— unset —" },
                  ...developers.map((d) => ({ value: d.id, label: d.name })),
                ]}
                value={identityForm.watch("developerId") ?? ""}
                onChange={(v) =>
                  identityForm.setValue("developerId", v || undefined)
                }
              />
            </FormField>
            <FormField label="Status" htmlFor="edit-status" optional>
              <Select
                id="edit-status"
                data-testid="edit-status"
                options={WORKFLOW_OPTIONS}
                value={identityForm.watch("workflowStatus") ?? ""}
                onChange={(v) => {
                  const parsed = workflowStatusValueSchema.safeParse(v);
                  identityForm.setValue(
                    "workflowStatus",
                    parsed.success ? parsed.data : null,
                    { shouldValidate: false },
                  );
                }}
              />
            </FormField>
            <FormField label="Family" htmlFor="edit-family" optional>
              <Input id="edit-family" {...identityForm.register("family", { setValueAs: emptyToNull })} />
            </FormField>
            <FormField label="Lifecycle" htmlFor="edit-lifecycle" optional>
              <Select
                id="edit-lifecycle"
                options={LIFECYCLE_OPTIONS}
                value={String(identityForm.watch("lifecycle") ?? "unknown")}
                onChange={(v) =>
                  identityForm.setValue(
                    "lifecycle",
                    (v || "unknown") as NonNullable<IdentityValues["lifecycle"]>,
                    { shouldValidate: false },
                  )
                }
              />
            </FormField>
          </div>
          <GroupFooter
            group="identity"
            saving={saving}
            error={groupError.identity}
            ok={groupOk.identity}
            onSave={() => void identityForm.handleSubmit(saveIdentity)()}
          />
        </section>

        {/* Capabilities */}
        <section style={groupBoxStyle} data-testid="edit-group-capabilities">
          <h3 style={groupTitleStyle}>Capabilities</h3>
          <div style={formGridStyle}>
            <FormField label="Vision" htmlFor="edit-vision" optional>
              <Select
                id="edit-vision"
                data-testid="edit-vision"
                options={TRI_OPTIONS}
                value={capsForm.watch("vision") ?? ""}
                onChange={(v) => capsForm.setValue("vision", v)}
              />
            </FormField>
            <FormField label="Reasoning" htmlFor="edit-reasoning" optional>
              <Select
                id="edit-reasoning"
                options={TRI_OPTIONS}
                value={capsForm.watch("reasoning") ?? ""}
                onChange={(v) => capsForm.setValue("reasoning", v)}
              />
            </FormField>
            <FormField label="Tool use" htmlFor="edit-tool" optional>
              <Select
                id="edit-tool"
                options={TRI_OPTIONS}
                value={capsForm.watch("toolUse") ?? ""}
                onChange={(v) => capsForm.setValue("toolUse", v)}
              />
            </FormField>
            <FormField label="Agent support" htmlFor="edit-agent" optional>
              <Select
                id="edit-agent"
                options={TRI_OPTIONS}
                value={capsForm.watch("agentSupport") ?? ""}
                onChange={(v) => capsForm.setValue("agentSupport", v)}
              />
            </FormField>
            <FormField label="Context tokens" htmlFor="edit-context" optional>
              <Input
                id="edit-context"
                type="number"
                data-testid="edit-context"
                {...capsForm.register("contextTokens", {
                  setValueAs: (v: string) => numOrNull(v),
                })}
              />
            </FormField>
            <FormField label="Speed" htmlFor="edit-speed" optional>
              <Input id="edit-speed" {...capsForm.register("speedRating", { setValueAs: emptyToNull })} />
            </FormField>
          </div>
          <GroupFooter
            group="capabilities"
            saving={saving}
            error={groupError.capabilities}
            ok={groupOk.capabilities}
            onSave={() => void capsForm.handleSubmit(saveCapabilities)()}
          />
        </section>

        {/* Access */}
        <section style={groupBoxStyle} data-testid="edit-group-access">
          <h3 style={groupTitleStyle}>Access</h3>
          <div style={formGridStyle}>
            <FormField label="Link plan" htmlFor="edit-plan" optional>
              <Select
                id="edit-plan"
                data-testid="edit-plan"
                options={[
                  { value: "", label: "— unset —" },
                  ...plans.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={accessForm.watch("planId") ?? ""}
                onChange={(v) => accessForm.setValue("planId", v || undefined)}
              />
            </FormField>
            <FormField label="Provider model ID" htmlFor="edit-provider-model-id" optional>
              <Input
                id="edit-provider-model-id"
                {...accessForm.register("providerModelId", { setValueAs: emptyToNull })}
              />
            </FormField>
          </div>
          <GroupFooter
            group="access"
            saving={saving}
            error={groupError.access}
            ok={groupOk.access}
            onSave={() => void accessForm.handleSubmit(saveAccess)()}
          />
        </section>

        {/* Cost */}
        <section style={groupBoxStyle} data-testid="edit-group-cost">
          <h3 style={groupTitleStyle}>Cost and quota</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
            Plan owns pricing and quotas. Notes here are personal reminders only.
          </p>
          <div style={formGridStyle}>
            <FormField label="Price note" htmlFor="edit-price-note" optional>
              <Input id="edit-price-note" data-testid="edit-price-note" {...costForm.register("priceNote")} />
            </FormField>
            <FormField label="Quota note" htmlFor="edit-quota-note" optional>
              <Input id="edit-quota-note" data-testid="edit-quota-note" {...costForm.register("quotaNote")} />
            </FormField>
          </div>
          <GroupFooter
            group="cost"
            saving={saving}
            error={groupError.cost}
            ok={groupOk.cost}
            onSave={() => void costForm.handleSubmit(saveCost)()}
          />
        </section>

        {/* Assessment */}
        <section style={groupBoxStyle} data-testid="edit-group-assessment">
          <h3 style={groupTitleStyle}>Personal assessment</h3>
          <FormField label="Best use" htmlFor="edit-best-use" optional>
            <Textarea id="edit-best-use" data-testid="edit-best-use" rows={2} {...assessmentForm.register("bestUse", { setValueAs: emptyToNull })} />
          </FormField>
          <FormField label="Avoid for" htmlFor="edit-avoid" optional>
            <Textarea id="edit-avoid" rows={2} {...assessmentForm.register("avoidFor", { setValueAs: emptyToNull })} />
          </FormField>
          <FormField label="Notes" htmlFor="edit-notes" optional>
            <Textarea id="edit-notes" rows={3} {...assessmentForm.register("description", { setValueAs: emptyToNull })} />
          </FormField>
          <GroupFooter
            group="assessment"
            saving={saving}
            error={groupError.assessment}
            ok={groupOk.assessment}
            onSave={() => void assessmentForm.handleSubmit(saveAssessment)()}
          />
        </section>

        {/* Research */}
        <section style={groupBoxStyle} data-testid="edit-group-research">
          <h3 style={groupTitleStyle}>External research</h3>
          <div style={formGridStyle}>
            <FormField label="Release date" htmlFor="edit-release" optional>
              <Input id="edit-release" type="date" data-testid="edit-release" {...researchForm.register("releaseDate", { setValueAs: emptyToNull })} />
            </FormField>
            <FormField label="Knowledge cutoff" htmlFor="edit-cutoff" optional>
              <Input id="edit-cutoff" {...researchForm.register("knowledgeCutoff", { setValueAs: emptyToNull })} />
            </FormField>
            <FormField label="Coding specialization" htmlFor="edit-coding" optional>
              <Input id="edit-coding" {...researchForm.register("codingSpecialization", { setValueAs: emptyToNull })} />
            </FormField>
          </div>
          <GroupFooter
            group="research"
            saving={saving}
            error={groupError.research}
            ok={groupOk.research}
            onSave={() => void researchForm.handleSubmit(saveResearch)()}
          />
        </section>
      </div>
    </Drawer>
  );
}

function GroupFooter({
  group,
  saving,
  error,
  ok,
  onSave,
}: {
  group: GroupKey;
  saving: GroupKey | null;
  error?: string;
  ok?: string;
  onSave: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: "var(--space-2)",
        marginTop: "var(--space-2)",
      }}
    >
      {error ? (
        <span role="alert" data-testid={`edit-${group}-error`} style={{ color: "var(--danger)", marginRight: "auto" }}>
          {error}
        </span>
      ) : null}
      {ok ? (
        <span data-testid={`edit-${group}-ok`} style={{ color: "var(--success, var(--text-muted))", marginRight: "auto" }}>
          {ok}
        </span>
      ) : null}
      <Button
        variant="primary"
        size="sm"
        disabled={saving === group}
        data-testid={`edit-save-${group}`}
        onClick={onSave}
      >
        {saving === group ? "Saving…" : "Save group"}
      </Button>
    </div>
  );
}
