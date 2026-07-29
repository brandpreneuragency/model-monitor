"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  accessProviderWriteSchema,
  accessProviderTypeSchema,
  slugifyModelName,
} from "@model-monitor/schemas";
import { Button, Dialog, Input, Select, Textarea } from "@model-monitor/ui";
import {
  FormField,
  formGridStyle,
  formStackStyle,
  readApiError,
  emptyToNull,
} from "./form-field";

/** Form schema: name required; slug auto-filled from name when blank. */
const addProviderFormSchema = accessProviderWriteSchema
  .omit({ slug: true })
  .extend({
    slug: z.string().trim().min(1).max(120).optional(),
  });

type FormValues = z.infer<typeof addProviderFormSchema>;

const TYPE_OPTIONS = [
  { value: "", label: "— unset —" },
  ...accessProviderTypeSchema.options.map((v) => ({
    value: v,
    label: v.replace(/_/g, " "),
  })),
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export interface AddProviderDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (provider: { id: string; name: string; slug: string }) => void;
  fetchImpl?: typeof fetch;
}

export function AddProviderDialog({
  open,
  onClose,
  onCreated,
  fetchImpl = fetch,
}: AddProviderDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults = useMemo<FormValues>(
    () => ({
      name: "",
      slug: undefined,
      providerType: null,
      websiteUrl: null,
      logoUrl: null,
      colour: null,
      notes: null,
      status: "active",
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
    resolver: zodResolver(addProviderFormSchema),
    defaultValues: defaults,
  });

  const name = watch("name");
  useEffect(() => {
    if (!watch("slug")) {
      // keep slug empty so submit derives it; preview only
    }
  }, [name, watch]);

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
      "provider";
    const payload = {
      name: values.name.trim(),
      slug,
      providerType: values.providerType ?? null,
      websiteUrl: values.websiteUrl ?? null,
      logoUrl: values.logoUrl ?? null,
      colour: values.colour ?? null,
      notes: values.notes ?? null,
      status: values.status ?? "active",
    };

    try {
      const res = await fetchImpl("/api/v1/access-providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readApiError(res));
      const provider = (await res.json()) as {
        id: string;
        name: string;
        slug: string;
      };
      onCreated?.(provider);
      handleClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Add provider"
      data-testid="add-provider-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isSubmitting}
            data-testid="add-provider-save"
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
        data-testid="add-provider-form"
        style={formStackStyle}
      >
        {serverError ? (
          <p role="alert" data-testid="add-provider-error" style={{ color: "var(--danger)", margin: 0 }}>
            {serverError}
          </p>
        ) : null}
        <div style={formGridStyle}>
          <FormField label="Name" htmlFor="add-provider-name" error={errors.name?.message}>
            <Input
              id="add-provider-name"
              data-testid="add-provider-name"
              autoFocus
              {...register("name")}
            />
          </FormField>
          <FormField label="Type" htmlFor="add-provider-type" optional>
            <Select
              id="add-provider-type"
              data-testid="add-provider-type"
              options={TYPE_OPTIONS}
              value={(watch("providerType") as string) ?? ""}
              onChange={(v) =>
                setValue(
                  "providerType",
                  v
                    ? (v as z.infer<typeof accessProviderTypeSchema>)
                    : null,
                )
              }
            />
          </FormField>
          <FormField label="Website" htmlFor="add-provider-website" optional>
            <Input
              id="add-provider-website"
              data-testid="add-provider-website"
              type="url"
              placeholder="https://"
              {...register("websiteUrl", { setValueAs: emptyToNull })}
            />
          </FormField>
          <FormField label="Logo URL" htmlFor="add-provider-logo" optional>
            <Input
              id="add-provider-logo"
              data-testid="add-provider-logo"
              type="url"
              {...register("logoUrl", { setValueAs: emptyToNull })}
            />
          </FormField>
          <FormField
            label="Colour"
            htmlFor="add-provider-colour"
            optional
            hint="Token name or CSS variable, e.g. var(--accent)"
          >
            <Input
              id="add-provider-colour"
              data-testid="add-provider-colour"
              placeholder="var(--accent)"
              {...register("colour", { setValueAs: emptyToNull })}
            />
          </FormField>
          <FormField label="Status" htmlFor="add-provider-status" optional>
            <Select
              id="add-provider-status"
              data-testid="add-provider-status"
              options={STATUS_OPTIONS}
              value={watch("status") ?? "active"}
              onChange={(v) =>
                setValue("status", v as "active" | "archived")
              }
            />
          </FormField>
        </div>
        <FormField label="Notes" htmlFor="add-provider-notes" optional>
          <Textarea
            id="add-provider-notes"
            data-testid="add-provider-notes"
            rows={3}
            {...register("notes", { setValueAs: emptyToNull })}
          />
        </FormField>
      </form>
    </Dialog>
  );
}
