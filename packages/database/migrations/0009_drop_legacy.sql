-- Final deploy-only removal of the exact legacy objects recorded in progress.md.
-- The redesign application no longer references these tables or settings rows.

DELETE FROM app_settings
WHERE key = 'admin.savedViews'
   OR key LIKE 'admin.savedViews.%';

-- Drop child tables before subscriptions so no unrelated object is cascaded.
DROP TABLE subscription_limit_rules;
DROP TABLE usage_snapshots;
DROP TABLE subscriptions;

DROP TABLE model_scores;

-- audit_events survives; only its optional FK to the retired token table is removed.
ALTER TABLE audit_events
  DROP CONSTRAINT audit_events_actor_token_id_fkey;
DROP TABLE api_tokens;