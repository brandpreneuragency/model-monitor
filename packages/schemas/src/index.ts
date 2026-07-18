import { z } from 'zod';

export const recordStatusSchema = z.enum(['active', 'archived']);
export const subscriptionStatusSchema = z.enum(['active', 'paused', 'cancelled', 'expired', 'trial', 'archived']);
export const lifecycleStatusSchema = z.enum(['current', 'ga', 'preview', 'beta', 'legacy', 'deprecated', 'retired', 'unavailable', 'unknown']);
export const availabilityStatusSchema = z.enum(['confirmed', 'unconfirmed', 'unavailable', 'removed']);
export const accessMethodSchema = z.enum(['oauth', 'provider_api', 'direct_api', 'cli', 'consumer_app', 'web', 'self_hosted', 'other']);
export const authenticationTypeSchema = z.enum(['oauth_subscription', 'api_key', 'consumer_subscription', 'cli_session', 'none', 'other']);
export const apiAccessTypeSchema = z.enum(['included', 'separate_billing', 'restricted_provider_api', 'none_included', 'none', 'unknown']);
export const usageTrackingModeSchema = z.enum(['manual', 'mock', 'estimated', 'provider_reported', 'hybrid']);
export const sourceTypeSchema = z.enum(['official_docs', 'official_model_card', 'official_pricing', 'benchmark_report', 'vendor_blog', 'third_party', 'workbook', 'manual', 'other']);
export const auditActionSchema = z.enum(['create', 'update', 'archive', 'restore', 'merge', 'import', 'export', 'token_create', 'token_revoke', 'settings_change', 'delete']);
export const importStatusSchema = z.enum(['uploaded', 'parsing', 'preview_ready', 'needs_resolution', 'committing', 'committed', 'failed', 'cancelled']);
export const usageSourceSchema = z.enum(['mock', 'manual', 'estimated', 'provider_reported']);

export const normalize = (value: string): string => value.trim().toLocaleLowerCase('en-US').replace(/[\s_-]+/g, '-');
export const nullIfBlank = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};
export const triStateSchema = z.preprocess((value) => {
  if (value === '' || value === undefined || value === null) return null;
  if (typeof value === 'string' && /^(not confirmed|unknown|n\/a)$/i.test(value.trim())) return null;
  if (typeof value === 'string' && /^(yes|true)$/i.test(value.trim())) return true;
  if (typeof value === 'string' && /^(no|false)$/i.test(value.trim())) return false;
  return value;
}, z.boolean().nullable());

export const modelFormSchema = z.object({
  canonicalId: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  developerId: z.string().uuid(),
  lifecycle: lifecycleStatusSchema.default('unknown'),
  vision: triStateSchema,
  reasoning: triStateSchema,
  toolUse: triStateSchema,
});
export const subscriptionFormSchema = z.object({
  planId: z.string().uuid(),
  accountLabel: z.string().trim().min(1),
  actualPrice: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  nextBillingDate: z.string().date().nullable(),
  apiAccessType: apiAccessTypeSchema,
  authenticationType: authenticationTypeSchema,
});
export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string() }) });
export type ApiError = z.infer<typeof apiErrorSchema>;
