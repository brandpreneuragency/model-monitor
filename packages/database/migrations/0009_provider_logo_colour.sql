-- Additive provider presentation fields for Providers & Plans UI.
-- logo_url + colour are nullable; old app ignores them.

ALTER TABLE access_providers
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS colour text;
