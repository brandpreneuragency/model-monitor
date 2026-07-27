-- Plans billing absorption, plan_quotas, model workflow fields, preferred access.
-- Spec §4.1 / §4.2 — additive only. Does not drop or modify subscriptions.

-- ── New enums ──────────────────────────────────────────────────

CREATE TYPE access_type AS ENUM (
  'subscription',
  'api',
  'free_tier',
  'trial',
  'open_weights',
  'local',
  'included'
);

CREATE TYPE workflow_status AS ENUM (
  'active',
  'preferred',
  'testing',
  'preview',
  'legacy',
  'deprecated',
  'archived'
);

CREATE TYPE quota_unit AS ENUM (
  'requests',
  'tokens',
  'credits',
  'dollars',
  'images',
  'videos',
  'compute_hours',
  'unlimited',
  'custom'
);

CREATE TYPE quota_period AS ENUM (
  'hourly',
  'five_hour_window',
  'daily',
  'weekly',
  'monthly',
  'billing_cycle',
  'one_time',
  'sliding_window',
  'custom'
);

-- ── plans: absorb subscription billing fields (nullable) ───────

ALTER TABLE plans
  ADD COLUMN renewal_date date,
  ADD COLUMN billing_period text,
  ADD COLUMN auto_renews boolean,
  ADD COLUMN actual_price numeric(12,4),
  ADD COLUMN notes text,
  ADD COLUMN started_at date,
  ADD COLUMN cancelled_at date,
  ADD COLUMN intro_price_expires_at date,
  ADD COLUMN access_type access_type;

-- ── plan_quotas (SPEC §4.1) ────────────────────────────────────

CREATE TABLE plan_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric,
  amount_min numeric,
  amount_max numeric,
  unit quota_unit NOT NULL,
  custom_unit text,
  period quota_period NOT NULL,
  reset_behaviour text,
  remaining_amount numeric,
  remaining_updated_at timestamptz,
  resets_at date,
  is_unlimited boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plan_quotas_plan_id_idx ON plan_quotas (plan_id);

-- ── models: favourite / review / workflow_status ───────────────

ALTER TABLE models
  ADD COLUMN is_favourite boolean NOT NULL DEFAULT false,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN workflow_status workflow_status;

-- ── model_access: preferred route (at most one per model) ──────

ALTER TABLE model_access
  ADD COLUMN is_preferred boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX model_access_preferred_uidx
  ON model_access (model_id)
  WHERE is_preferred;

-- ── Backfill models.workflow_status from lifecycle + status ────
-- Safe: new column; old app does not read it.

UPDATE models
SET workflow_status = CASE
  WHEN status = 'archived' THEN 'archived'::workflow_status
  WHEN lifecycle IN ('current', 'ga') THEN 'active'::workflow_status
  WHEN lifecycle IN ('preview', 'beta') THEN 'preview'::workflow_status
  WHEN lifecycle = 'legacy' THEN 'legacy'::workflow_status
  WHEN lifecycle IN ('deprecated', 'retired', 'unavailable') THEN 'deprecated'::workflow_status
  WHEN lifecycle = 'unknown' THEN 'active'::workflow_status
  ELSE 'active'::workflow_status
END
WHERE workflow_status IS NULL;

-- ── Fold real subscriptions onto plans (copy only) ─────────────
-- Do not delete or modify subscriptions. Exclude mme2e: test labels.

UPDATE plans AS p
SET
  renewal_date = s.next_billing_date,
  auto_renews = s.auto_renews,
  actual_price = s.actual_price,
  billing_period = s.billing_interval,
  notes = s.notes,
  started_at = s.started_at,
  cancelled_at = s.cancelled_at,
  updated_at = now()
FROM subscriptions AS s
WHERE s.plan_id = p.id
  AND s.account_label NOT LIKE 'mme2e:%';
