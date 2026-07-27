-- Rankings, skill ratings, tags, and saved views (additive).
-- Spec §4.1 — empty tables only; seed data arrives in a later phase.

CREATE TYPE personal_confidence AS ENUM ('low', 'medium', 'high');
CREATE TYPE tag_category AS ENUM ('status', 'capability', 'access', 'usage', 'cost', 'preference');
CREATE TYPE view_mode AS ENUM ('table', 'cards', 'compact');
CREATE TYPE view_density AS ENUM ('comfortable', 'standard', 'compact');

CREATE TABLE skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_skill_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  personal_score numeric(4,2),
  personal_confidence personal_confidence,
  external_score numeric(6,2),
  external_rank integer,
  external_confidence numeric,
  rank_override integer,
  tested boolean NOT NULL DEFAULT false,
  tested_at date,
  notes text,
  hidden boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (model_id, skill_id)
);

CREATE INDEX model_skill_ratings_skill_external_score_idx
  ON model_skill_ratings (skill_id, external_score);

CREATE INDEX model_skill_ratings_skill_personal_score_idx
  ON model_skill_ratings (skill_id, personal_score);

CREATE TABLE ranking_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ranking_profile_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES ranking_profiles(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, skill_id)
);

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  color text,
  category tag_category NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_tags (
  model_id uuid NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (model_id, tag_id)
);

CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort jsonb NOT NULL DEFAULT '{}'::jsonb,
  visible_columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  view_mode view_mode NOT NULL DEFAULT 'table',
  density view_density NOT NULL DEFAULT 'standard',
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
