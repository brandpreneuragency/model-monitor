"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  createPlanQuotaBodySchema,
  quotaUnitSchema,
  quotaPeriodSchema,
} from "@model-monitor/schemas";
import { Button, Dialog, Input, Select, Textarea, Toggle } from "@model-monitor/ui";
import {
  FormField,
  formGridStyle,
  formStackStyle,
  numOrNull,
  readApiError,
  emptyToNull,
} from "./form-field";

const addQuotaFormSchema = createPlanQuotaBodySchema;

type FormValues = z.infer<typeof addQuotaFormSchema>;

const UNIT_OPTIONS = quotaUnitSchema.options.map((v) => ({
  value: v,
  label: v.replace(/_/g, " "),
}));

const PERIOD_OPTIONS = quotaPeriodSchema.options.map((v) => ({
  value: v,
  label: v.replace(/_/g, " "),
}));

export interface AddQuotaDialogProps {
  open: boolean;
  onClose: () => void;
  planId: string;
  planName?: string;
  onCreated?: (quota: { id: string; name: string }) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Single quota attach form. Mount multiple times / open repeatedly to attach
 * several quotas to one plan. Supports ranges, custom units and custom periods.
 */
export function AddQuotaDialog({
  open,
  onClose,
  planId,
  planName,
  onCreated,
  fetchImpl = fetch,
}: AddQuotaDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults = useMemo<FormValues>(
    () => ({
      name: "",
      unit: "requests",
      period: "monthly",
      amount: null,
      amountMin: null,
      amountMax: null,
      customUnit: null,
      isUnlimited: false,
      resetBehaviour: null,
      remainingAmount: null,
      notes: null,
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
  } = useForm<FormValues>({
    resolver: zodResolver(addQuotaFormSchema),
    defaultValues: defaults,
  });

  function handleClose() {
    setServerError(null);
    reset(defaults);
    onClose();
  }

  async function onSave(values: FormValues) {
    setServerError(null);
    try {
      const res = await fetchImpl(`/api/v1/plans/${planId}/quotas`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: values.name.trim(),
          unit: values.unit,
          period: values.period,
          amount: values.amount ?? null,
          amountMin: values.amountMin ?? null,
          amountMax: values.amountMax ?? null,
          customUnit: values.customUnit ?? null,
          isUnlimited: values.isUnlimited ?? false,
          resetBehaviour: values.resetBehaviour ?? null,
          remainingAmount: values.remainingAmount ?? null,
          notes: values.notes ?? null,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const quota = (await res.json()) as { id: string; name: string };
      onCreated?.(quota);
      handleClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
    }
  }

  const unit = watch("unit");
  const period = watch("period");

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={planName ? `Add quota · ${planName}` : "Add quota"}
      data-testid="add-quota-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting}
            data-testid="add-quota-save"
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
        data-testid="add-quota-form"
        style={formStackStyle}
      >
        {serverError ? (
          <p role="alert" data-testid="add-quota-error" style={{ color: "var(--danger)", margin: 0 }}>
            {serverError}
          </p>
        ) : null}
        <div style={formGridStyle}>
          <FormField label="Name" htmlFor="add-quota-name" error={errors.name?.message}>
            <Input
              id="add-quota-name"
              data-testid="add-quota-name"
              autoFocus
              {...register("name")}
            />
          </FormField>
          <FormField label="Unit" htmlFor="add-quota-unit" error={errors.unit?.message}>
            <Select
              id="add-quota-unit"
              data-testid="add-quota-unit"
              options={UNIT_OPTIONS}
              value={unit}
              onChange={(v) =>
                setValue("unit", v as z.infer<typeof quotaUnitSchema>)
              }
            />
          </FormField>
          <FormField label="Period" htmlFor="add-quota-period" error={errors.period?.message}>
            <Select
              id="add-quota-period"
              data-testid="add-quota-period"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={(v) =>
                setValue("period", v as z.infer<typeof quotaPeriodSchema>)
              }
            />
          </FormField>
          <FormField label="Amount" htmlFor="add-quota-amount" optional>
            <Input
              id="add-quota-amount"
              data-testid="add-quota-amount"
              type="number"
              {...register("amount", { setValueAs: (v: string) => numOrNull(v) })}
            />
          </FormField>
          <FormField label="Range min" htmlFor="add-quota-min" optional>
            <Input
              id="add-quota-min"
              data-testid="add-quota-min"
              type="number"
              {...register("amountMin", { setValueAs: (v: string) => numOrNull(v) })}
            />
          </FormField>
          <FormField label="Range max" htmlFor="add-quota-max" optional>
            <Input
              id="add-quota-max"
              data-testid="add-quota-max"
              type="number"
              {...register("amountMax", { setValueAs: (v: string) => numOrNull(v) })}
            />
          </FormField>
          {unit === "custom" ? (
            <FormField label="Custom unit" htmlFor="add-quota-custom-unit" optional>
              <Input
                id="add-quota-custom-unit"
                data-testid="add-quota-custom-unit"
                {...register("customUnit", { setValueAs: emptyToNull })}
              />
            </FormField>
          ) : null}
          {period === "custom" ? (
            <FormField label="Reset behaviour" htmlFor="add-quota-reset" optional>
              <Input
                id="add-quota-reset"
                data-testid="add-quota-reset"
                placeholder="Describe custom period"
                {...register("resetBehaviour", { setValueAs: emptyToNull })}
              />
            </FormField>
          ) : null}
          <FormField label="Unlimited" htmlFor="add-quota-unlimited" optional>
            <Toggle
              id="add-quota-unlimited"
              data-testid="add-quota-unlimited"
              label="Unlimited"
              showLabel={false}
              checked={Boolean(watch("isUnlimited"))}
              onChange={(checked) => setValue("isUnlimited", checked)}
            />
          </FormField>
        </div>
        <FormField label="Notes" htmlFor="add-quota-notes" optional>
          <Textarea
            id="add-quota-notes"
            data-testid="add-quota-notes"
            rows={2}
            {...register("notes", { setValueAs: emptyToNull })}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
