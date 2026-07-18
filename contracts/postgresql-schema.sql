-- Model Monitor PostgreSQL schema contract
-- Source of truth for entity boundaries. Implement with Drizzle migrations.
--
-- Contract v1.1 (2026-07-18) — architecture review patch set.
-- Changes vs v1.0 (see docs/17_CONTRACT_DISCREPANCIES.md):
--   CD-01  model_scores: added UNIQUE(model_id, methodology_id, score_type, calculated_at)  [ADR-0006]
--   CD-02  import_jobs.idempotency_key: NOT NULL DEFAULT ''                                   [ADR-0005]
--   CD-03  model_aliases: uniqueness scoped to (model_id, normalized_alias) + lookup index    [ADR-0007]
--   CD-04  added router_snapshots table (historical snapshot only, product decision 12)
--   CD-12  benchmarks: UNIQUE NULLS NOT DISTINCT (name, version, comparable_group)
--   CD-17  added list/filter/history indexes required by AGENTS.md
--   CD-24  added saved_views table (FR-03 saved table views)
--   ADR-0002: app_settings hosts the catalog_revision counter

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE record_status AS ENUM ('active','archived');
CREATE TYPE subscription_status AS ENUM ('active','paused','cancelled','expired','trial','archived');
CREATE TYPE lifecycle_status AS ENUM ('current','ga','preview','beta','legacy','deprecated','retired','unavailable','unknown');
CREATE TYPE availability_status AS ENUM ('confirmed','unconfirmed','unavailable','removed');
CREATE TYPE access_method AS ENUM ('oauth','provider_api','direct_api','cli','consumer_app','web','self_hosted','other');
CREATE TYPE authentication_type AS ENUM ('oauth_subscription','api_key','consumer_subscription','cli_session','none','other');
CREATE TYPE api_access_type AS ENUM ('included','separate_billing','restricted_provider_api','none_included','none','unknown');
CREATE TYPE usage_tracking_mode AS ENUM ('manual','mock','estimated','provider_reported','hybrid');
CREATE TYPE source_type AS ENUM ('official_docs','official_model_card','official_pricing','benchmark_report','vendor_blog','third_party','workbook','manual','other');
CREATE TYPE audit_action AS ENUM ('create','update','archive','restore','merge','import','export','token_create','token_revoke','settings_change','delete');
CREATE TYPE import_status AS ENUM ('uploaded','parsing','preview_ready','needs_resolution','committing','committed','failed','cancelled');
CREATE TYPE usage_source AS ENUM ('mock','manual','estimated','provider_reported');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE developers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  website_url text,
  notes text,
  status record_status NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE access_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  provider_type text,
  website_url text,
  notes text,
  status record_status NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_provider_id uuid NOT NULL REFERENCES access_providers(id),
  name text NOT NULL,
  slug text NOT NULL,
  plan_type text,
  regular_price numeric(12,4),
  introductory_price numeric(12,4),
  currency char(3),
  billing_interval text,
  api_access_type api_access_type NOT NULL DEFAULT 'unknown',
  authentication_type authentication_type NOT NULL DEFAULT 'other',
  usage_measurement_type text,
  terms_summary text,
  status record_status NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(access_provider_id, slug)
);

CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  external_seed_id text UNIQUE,
  account_label text NOT NULL,
  status subscription_status NOT NULL DEFAULT 'active',
  started_at date,
  next_billing_date date,
  cancelled_at date,
  auto_renews boolean,
  actual_price numeric(12,4),
  currency char(3),
  billing_interval text,
  usage_tracking_mode usage_tracking_mode NOT NULL DEFAULT 'manual',
  usage_check_url text,
  usage_check_instructions text,
  importance smallint CHECK (importance BETWEEN 1 AND 5),
  notes text,
  private_notes text,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscriptions_owner_idx ON subscriptions(owner_user_id);

CREATE TABLE models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL REFERENCES developers(id),
  canonical_id text NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  family text,
  generation text,
  lifecycle lifecycle_status NOT NULL DEFAULT 'unknown',
  lifecycle_raw text,
  release_date date,
  knowledge_cutoff text,
  model_type text,
  description text,
  coding_specialization text,
  best_use text,
  avoid_for text,
  context_tokens bigint,
  max_output_tokens bigint,
  speed_rating text,
  verified_tps numeric(12,3),
  verification_status text,
  verified_at timestamptz,
  needs_recheck boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status record_status NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  merged_into_model_id uuid REFERENCES models(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX models_status_idx ON models(status);
CREATE INDEX models_developer_idx ON models(developer_id);

CREATE TABLE model_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  alias_type text NOT NULL,
  access_provider_id uuid REFERENCES access_providers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- ADR-0007: uniqueness is per model; cross-model claims are import conflicts.
  UNIQUE(model_id, normalized_alias)
);
CREATE INDEX model_aliases_normalized_idx ON model_aliases(normalized_alias);

CREATE TABLE model_capabilities (
  model_id uuid PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  vision boolean,
  reasoning boolean,
  tool_use boolean,
  parallel_agents boolean,
  computer_use boolean,
  audio_input boolean,
  video_input boolean,
  image_input boolean,
  structured_output boolean,
  function_calling boolean,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id),
  plan_id uuid NOT NULL REFERENCES plans(id),
  provider_model_id text,
  availability availability_status NOT NULL DEFAULT 'unconfirmed',
  access_method access_method NOT NULL,
  authentication_type authentication_type NOT NULL DEFAULT 'other',
  included_in_plan boolean,
  api_compatible boolean,
  cli_only boolean NOT NULL DEFAULT false,
  web_only boolean NOT NULL DEFAULT false,
  oauth_supported boolean,
  priority integer,
  limitations text,
  verified_at timestamptz,
  available_from date,
  available_until date,
  notes text,
  status record_status NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (model_id, plan_id, provider_model_id)
);
CREATE INDEX model_access_model_idx ON model_access(model_id);
CREATE INDEX model_access_plan_idx ON model_access(plan_id);

CREATE TABLE model_access_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_access_id uuid NOT NULL REFERENCES model_access(id) ON DELETE CASCADE,
  currency char(3) NOT NULL,
  input_per_million numeric(14,6),
  cached_read_per_million numeric(14,6),
  cache_write_per_million numeric(14,6),
  output_per_million numeric(14,6),
  long_input_per_million numeric(14,6),
  long_cached_per_million numeric(14,6),
  long_cache_write_per_million numeric(14,6),
  long_output_per_million numeric(14,6),
  effective_from date,
  effective_to date,
  source_url text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_access_pricing_access_idx ON model_access_pricing(model_access_id);

CREATE TABLE subscription_limit_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  name text NOT NULL,
  limit_type text NOT NULL,
  amount_min numeric(16,4),
  amount_max numeric(16,4),
  unit text,
  period_minutes integer,
  reset_strategy text,
  applies_to text,
  included_credit boolean,
  notes text,
  raw_text text,
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_limit_rules_subscription_idx ON subscription_limit_rules(subscription_id);

CREATE TABLE score_methodologies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  description text,
  factors jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name, version)
);

CREATE TABLE model_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  methodology_id uuid NOT NULL REFERENCES score_methodologies(id),
  score_type text NOT NULL,
  score_value numeric(8,4),
  rank_value integer,
  eligible_count integer,
  confidence numeric(5,2),
  is_manual_override boolean NOT NULL DEFAULT false,
  override_reason text,
  calculated_at timestamptz NOT NULL,
  source_import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- ADR-0006: one row per model/methodology/type per calculation event.
  UNIQUE(model_id, methodology_id, score_type, calculated_at)
);
CREATE INDEX model_scores_lookup_idx ON model_scores(model_id, score_type, calculated_at DESC);

CREATE TABLE benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  version text,
  comparable_group text,
  score_unit text,
  higher_is_better boolean,
  description text,
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT keeps definition dedup deterministic when version/group are null.
  UNIQUE NULLS NOT DISTINCT (name, version, comparable_group)
);

CREATE TABLE model_benchmark_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  benchmark_id uuid NOT NULL REFERENCES benchmarks(id),
  setting text,
  harness text,
  score numeric(16,6),
  score_text text,
  result_date date,
  confidence numeric(5,2),
  source_type source_type,
  source_url text,
  notes text,
  verified_at timestamptz,
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX benchmark_results_model_idx ON model_benchmark_results(model_id);
CREATE INDEX benchmark_results_benchmark_idx ON model_benchmark_results(benchmark_id);

CREATE TABLE sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  source_type source_type NOT NULL,
  url text,
  title text,
  publisher text,
  retrieved_at timestamptz,
  verified_at timestamptz,
  notes text,
  import_job_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sources_entity_idx ON sources(entity_type, entity_id);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  filename text NOT NULL,
  stored_path text NOT NULL,
  sha256 text NOT NULL,
  parser_version text NOT NULL,
  status import_status NOT NULL DEFAULT 'uploaded',
  sheet_summary jsonb,
  preview_summary jsonb,
  commit_summary jsonb,
  error_summary jsonb,
  -- ADR-0005: empty string means "no explicit key"; unique constraint rejects
  -- duplicate uploads of the same file+parser unless the user explicitly reimports.
  idempotency_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  UNIQUE(sha256, parser_version, idempotency_key)
);

CREATE TABLE import_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  source_sheet text,
  source_row integer,
  source_column text,
  entity_type text,
  candidate_entity_id uuid,
  current_value jsonb,
  imported_value jsonb,
  resolution text,
  resolution_payload jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_conflicts_job_idx ON import_conflicts(import_job_id);

CREATE TABLE import_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  source_sheet text,
  source_row integer,
  source_column text,
  raw_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_provenance_entity_idx ON import_provenance(entity_type, entity_id);

-- Historical router recommendations only. Never executable routing policy
-- (product decision 12; routing itself is post-MVP).
CREATE TABLE router_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name text NOT NULL,
  ranking_basis text,
  payload jsonb NOT NULL,
  source_sheet text,
  source_row integer,
  import_job_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE usage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  model_id uuid REFERENCES models(id),
  source usage_source NOT NULL,
  is_mock boolean NOT NULL DEFAULT false,
  period_label text,
  period_start timestamptz,
  period_end timestamptz,
  used_amount numeric(18,6),
  remaining_amount numeric(18,6),
  total_amount numeric(18,6),
  unit text,
  used_percent numeric(6,3),
  confidence numeric(5,2),
  raw_payload jsonb,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_snapshots_subscription_idx ON usage_snapshots(subscription_id, captured_at DESC);

CREATE TABLE api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  token_prefix text NOT NULL UNIQUE,
  token_hash text NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  actor_token_id uuid REFERENCES api_tokens(id),
  entity_type text NOT NULL,
  entity_id uuid,
  action audit_action NOT NULL,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  request_id text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX audit_events_created_idx ON audit_events(created_at DESC);

-- Saved personal table views (FR-03). Single-user MVP; user scoping retained.
CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  entity text NOT NULL,
  name text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id, entity, name)
);

-- Generic settings store. Hosts verification intervals and the Hermes
-- catalog_revision counter (ADR-0002).
CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add source_import_job_id FK after import_jobs exists.
ALTER TABLE model_scores
  ADD CONSTRAINT model_scores_import_job_fk
  FOREIGN KEY (source_import_job_id) REFERENCES import_jobs(id);

ALTER TABLE model_benchmark_results
  ADD CONSTRAINT model_benchmark_results_import_job_fk
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id);

ALTER TABLE sources
  ADD CONSTRAINT sources_import_job_fk
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id);

ALTER TABLE router_snapshots
  ADD CONSTRAINT router_snapshots_import_job_fk
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id);
