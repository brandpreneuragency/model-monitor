import { pgEnum } from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────

export const recordStatus = pgEnum("record_status", [
  "active",
  "archived",
]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "paused",
  "cancelled",
  "expired",
  "trial",
  "archived",
]);

export const lifecycleStatus = pgEnum("lifecycle_status", [
  "current",
  "ga",
  "preview",
  "beta",
  "legacy",
  "deprecated",
  "retired",
  "unavailable",
  "unknown",
]);

export const availabilityStatus = pgEnum("availability_status", [
  "confirmed",
  "unconfirmed",
  "unavailable",
  "removed",
]);

export const accessMethod = pgEnum("access_method", [
  "oauth",
  "provider_api",
  "direct_api",
  "cli",
  "consumer_app",
  "web",
  "self_hosted",
  "other",
]);

export const authenticationType = pgEnum("authentication_type", [
  "oauth_subscription",
  "api_key",
  "consumer_subscription",
  "cli_session",
  "none",
  "other",
]);

export const apiAccessType = pgEnum("api_access_type", [
  "included",
  "separate_billing",
  "restricted_provider_api",
  "none_included",
  "none",
  "unknown",
]);

export const usageTrackingMode = pgEnum("usage_tracking_mode", [
  "manual",
  "mock",
  "estimated",
  "provider_reported",
  "hybrid",
]);

export const sourceType = pgEnum("source_type", [
  "official_docs",
  "official_model_card",
  "official_pricing",
  "benchmark_report",
  "vendor_blog",
  "third_party",
  "workbook",
  "manual",
  "other",
]);

export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "archive",
  "restore",
  "merge",
  "import",
  "export",
  "token_create",
  "token_revoke",
  "settings_change",
  "delete",
]);

export const importStatus = pgEnum("import_status", [
  "uploaded",
  "parsing",
  "preview_ready",
  "needs_resolution",
  "committing",
  "committed",
  "failed",
  "cancelled",
]);

export const usageSource = pgEnum("usage_source", [
  "mock",
  "manual",
  "estimated",
  "provider_reported",
]);

export const personalConfidence = pgEnum("personal_confidence", [
  "low",
  "medium",
  "high",
]);

export const tagCategory = pgEnum("tag_category", [
  "status",
  "capability",
  "access",
  "usage",
  "cost",
  "preference",
]);

export const viewMode = pgEnum("view_mode", ["table", "cards", "compact"]);

export const viewDensity = pgEnum("view_density", [
  "comfortable",
  "standard",
  "compact",
]);
