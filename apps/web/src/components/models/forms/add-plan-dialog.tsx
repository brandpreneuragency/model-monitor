"use client";

import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  planWriteSchema,
  accessTypeSchema,
  createPlanQuotaBodySchema,
  quotaUnitSchema,
  quotaPeriodSchema,
  slugifyModelName,
} from "@model-monitor/schemas";
import { Button, Dialog, Input, Select, Textarea } from "@model-monitor/ui";
import {
  FormField,
  formGridStyle,
  formStackStyle,
  groupBoxStyle,
  groupTitleStyle,
  numOrNull,
  readApiError,
  emptyToNull,
} from "./form-field";
import type { OptionItem } from "./add-model-dialog";

const quotaRowSchema = createPlanQuotaBodySchema.partial().extend({
  name: z.string().trim().min(1).max(200).optional().or(z.literal("")),
  unit: quotaUnitSchema.optional(),
  period: quotaPeriodSchema.optional(),
});

const addPlanFormSchema = planWriteSchema
  .omit({ slug: true, accessProviderId: true })
  .extend({
    accessProviderId: z.preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.string().uuid({ message: "Provider is required" }),
    ),
    slug: z.string().trim().min(1).max(120).optional(),
    modelIdsText: z.string().optional(),
    quotas: z.array(quotaRowSchema).optional(),
  });

type FormValues = z.infer<typeof addPlanFormSchema>;

const ACCESS_TYPE_OPTIONS = [
  { value: "", label: "— unset —" },
  ...accessTypeSchema.options.map((v) => ({
    value: v,
    label: v.replace(/_/g, " "),
  })),
];

const UNIT_OPTIONS = quotaUnitSchema.options.map((v) => ({
  value: v,
  label: v.replace(/_/g, " "),
}));

const PERIOD_OPTIONS = quotaPeriodSchema.options.map((v) => ({
  value: v,
  label: v.replace(/_/g, " "),
}));

export interface AddPlanDialogProps {
  open: boolean;
  onClose: () => void;
  providers?: OptionItem[];
  onCreated?: (plan: { id: string; name: string }) => void;
  fetchImpl?: typeof fetch;
}

export function AddPlanDialog({
  open,
  onClose,
  providers = [],
  onCreated,
  fetchImpl = fetch,
}: AddPlanDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults = useMemo<FormValues>(
    () => ({
      accessProviderId: undefined as unknown as string,
      name: "",
      slug: undefined,
      accessType: null,
      regularPrice: null,
      actualPrice: null,
      currency: "USD",
      billingPeriod: null,
      billingInterval: null,
      renewalDate: null,
      autoRenews: null,
      notes: null,
      apiAccessType: "unknown",
      authenticationType: "other",
      modelIdsText: "",
      quotas: [],
    }),
    [],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(addPlanFormSchema),
    defaultValues: defaults,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "quotas",
  });

  function handleClose() {
    setServerError(null);
    reset(defaults);
    onClose();
  }

  async function onSave(values: FormValues) {
    setServerError(null);
    const slug =
      (values.slug && values.slug.trim()) ||
      slugifyModelName(values.name) ||
      "plan";

    const payload: Record<string, unknown> = {
      accessProviderId: values.accessProviderId,
      name: values.name.trim(),
      slug,
      accessType: values.accessType ?? null,
      regularPrice: values.regularPrice ?? null,
      actualPrice: values.actualPrice ?? null,
      currency: values.currency ?? null,
      billingPeriod: values.billingPeriod ?? null,
      billingInterval: values.billingInterval ?? null,
      renewalDate: values.renewalDate || null,
      autoRenews: values.autoRenews ?? null,
      notes: values.notes ?? null,
      apiAccessType: values.apiAccessType ?? "unknown",
      authenticationType: values.authenticationType ?? "other",
    };

    try {
      const res = await fetchImpl("/api/v1/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const plan = (await res.json()) as { id: string; name: string };

      // Attach quotas (optional, multiple)
      for (const q of values.quotas ?? []) {
        if (!q.name?.trim()) continue;
        const qBody = {
          name: q.name.trim(),
          unit: q.unit ?? "requests",
          period: q.period ?? "monthly",
          amount: q.amount ?? null,
          amountMin: q.amountMin ?? null,
          amountMax: q.amountMax ?? null,
          customUnit: q.customUnit ?? null,
          isUnlimited: q.isUnlimited ?? false,
          notes: q.notes ?? null,
        };
        const qRes = await fetchImpl(`/api/v1/plans/${plan.id}/quotas`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(qBody),
        });
        if (!qRes.ok) {
          throw new Error(`Plan created; quota failed: ${await readApiError(qRes)}`);
        }
      }

      // modelIdsText is informational on create (link via model-access elsewhere)
      void values.modelIdsText;

      onCreated?.(plan);
      handleClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Add plan"
      data-testid="add-plan-dialog"
      style={{ maxWidth: "640px" }}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting}
            data-testid="add-plan-save"
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
        data-testid="add-plan-form"
        style={formStackStyle}
      >
        {serverError ? (
          <p role="alert" data-testid="add-plan-error" style={{ color: "var(--danger)", margin: 0 }}>
            {serverError}
          </p>
        ) : null}
        <div style={formGridStyle}>
          <FormField
            label="Provider"
            htmlFor="add-plan-provider"
            error={errors.accessProviderId?.message}
          >
            <Select
              id="add-plan-provider"
              data-testid="add-plan-provider"
              options={[
                { value: "", label: "— select —" },
                ...providers.map((p) => ({ value: p.id, label: p.name })),
              ]}
              value={watch("accessProviderId") ?? ""}
              onChange={(v) =>
                setValue("accessProviderId", v, {
                  shouldValidate: true,
                })
              }
            />
          </FormField>
          <FormField label="Plan name" htmlFor="add-plan-name" error={errors.name?.message}>
            <Input
              id="add-plan-name"
              data-testid="add-plan-name"
              autoFocus
              {...register("name")}
            />
          </FormField>
          <FormField label="Access type" htmlFor="add-plan-access-type" optional>
            <Select
              id="add-plan-access-type"
              data-testid="add-plan-access-type"
              options={ACCESS_TYPE_OPTIONS}
              value={watch("accessType") ?? ""}
              onChange={(v) =>
                setValue(
                  "accessType",
                  v ? (v as z.infer<typeof accessTypeSchema>) : null,
                )
              }
            />
          </FormField>
          <FormField label="Price" htmlFor="add-plan-price" optional>
            <Input
              id="add-plan-price"
              data-testid="add-plan-price"
              type="number"
              step="0.01"
              {...register("regularPrice", {
                setValueAs: (v: string) => numOrNull(v),
              })}
            />
          </FormField>
          <FormField label="Billing period" htmlFor="add-plan-billing" optional>
            <Input
              id="add-plan-billing"
              data-testid="add-plan-billing"
              placeholder="monthly"
              {...register("billingPeriod", { setValueAs: emptyToNull })}
            />
          </FormField>
          <FormField label="Renewal date" htmlFor="add-plan-renewal" optional>
            <Input
              id="add-plan-renewal"
              data-testid="add-plan-renewal"
              type="date"
              {...register("renewalDate", { setValueAs: emptyToNull })}
            />
          </FormField>
        </div>
        <FormField
          label="Models"
          htmlFor="add-plan-models"
          optional
          hint="Names or IDs for reference — link models via access routes after create"
        >
          <Input
            id="add-plan-models"
            data-testid="add-plan-models"
            {...register("modelIdsText")}
          />
        </FormField>

        <section style={groupBoxStyle} data-testid="add-plan-quotas">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3 style={groupTitleStyle}>Quotas</h3>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="add-plan-add-quota"
              onClick={() =>
                append({
                  name: "",
                  unit: "requests",
                  period: "monthly",
                  amount: null,
                  amountMin: null,
                  amountMax: null,
                  customUnit: null,
                  isUnlimited: false,
                  notes: null,
                })
              }
            >
              Add quota
            </Button>
          </div>
          {fields.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--text-meta-size)" }}>
              No quotas yet — optional.
            </p>
          ) : null}
          {fields.map((field, index) => (
            <div
              key={field.id}
              style={{ ...formGridStyle, alignItems: "end" }}
              data-testid={`add-plan-quota-row-${index}`}
            >
              <FormField label="Quota name" htmlFor={`quota-name-${index}`} optional>
                <Input
                  id={`quota-name-${index}`}
                  data-testid={`quota-name-${index}`}
                  {...register(`quotas.${index}.name`)}
                />
              </FormField>
              <FormField label="Unit" htmlFor={`quota-unit-${index}`} optional>
                <Select
                  id={`quota-unit-${index}`}
                  options={UNIT_OPTIONS}
                  value={watch(`quotas.${index}.unit`) ?? "requests"}
                  onChange={(v) =>
                    setValue(
                      `quotas.${index}.unit`,
                      v as z.infer<typeof quotaUnitSchema>,
                    )
                  }
                />
              </FormField>
              <FormField label="Period" htmlFor={`quota-period-${index}`} optional>
                <Select
                  id={`quota-period-${index}`}
                  options={PERIOD_OPTIONS}
                  value={watch(`quotas.${index}.period`) ?? "monthly"}
                  onChange={(v) =>
                    setValue(
                      `quotas.${index}.period`,
                      v as z.infer<typeof quotaPeriodSchema>,
                    )
                  }
                />
              </FormField>
              <FormField label="Amount" htmlFor={`quota-amount-${index}`} optional>
                <Input
                  id={`quota-amount-${index}`}
                  type="number"
                  {...register(`quotas.${index}.amount`, {
                    setValueAs: (v: string) => numOrNull(v),
                  })}
                />
              </FormField>
              <FormField label="Min" htmlFor={`quota-min-${index}`} optional>
                <Input
                  id={`quota-min-${index}`}
                  type="number"
                  {...register(`quotas.${index}.amountMin`, {
                    setValueAs: (v: string) => numOrNull(v),
                  })}
                />
              </FormField>
              <FormField label="Max" htmlFor={`quota-max-${index}`} optional>
                <Input
                  id={`quota-max-${index}`}
                  type="number"
                  {...register(`quotas.${index}.amountMax`, {
                    setValueAs: (v: string) => numOrNull(v),
                  })}
                />
              </FormField>
              <FormField label="Custom unit" htmlFor={`quota-custom-unit-${index}`} optional>
                <Input
                  id={`quota-custom-unit-${index}`}
                  {...register(`quotas.${index}.customUnit`, {
                    setValueAs: emptyToNull,
                  })}
                />
              </FormField>
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  data-testid={`quota-remove-${index}`}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </section>

        <FormField label="Notes" htmlFor="add-plan-notes" optional>
          <Textarea
            id="add-plan-notes"
            data-testid="add-plan-notes"
            rows={3}
            {...register("notes", { setValueAs: emptyToNull })}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
