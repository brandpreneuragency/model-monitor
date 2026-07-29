# Model Monitor

Private, single-user workspace for choosing which AI model to use for a task. Model Monitor is a manually maintained model directory; it does not require provider credentials, live provider integrations, usage monitoring, or background synchronization.

## Primary application

The application has exactly four primary destinations:

- **Overview** (`/`) — inventory summaries, plan access, skill leaders, provider distribution, quota summaries, and recently updated models.
- **Models** (`/models`) — searchable table/card/compact views, saved filters, comparison, model details, access routes, specifications, and research evidence.
- **Rankings** (`/rankings`) — personal and external ratings, ranking profiles, leaderboards, score matrices, radar comparisons, and scatter charts. Personal and external scores remain separate.
- **Providers & Plans** (`/providers`) — providers, plans, quotas, and renewal information.

Import/export, tags, skills, backup/restore, appearance, and general settings are secondary tools under `/settings`.

## Stack

- Next.js 15, React 19, and TypeScript
- PostgreSQL 16
- Drizzle ORM with hand-written SQL migrations
- Zod contracts
- Tailwind CSS and the shared token-based UI package
- Auth.js credentials authentication for one allowed account
- pnpm workspace with Turbo

## Quick start

```bash
PATH="$HOME/.local/bin:$PATH" pnpm install

docker compose -f docker/compose.yaml up -d

# Load DATABASE_URL without printing credentials, then migrate and seed.
PATH="$HOME/.local/bin:$PATH" pnpm --filter @model-monitor/database db:migrate
PATH="$HOME/.local/bin:$PATH" pnpm --filter @model-monitor/database db:seed
PATH="$HOME/.local/bin:$PATH" pnpm --filter @model-monitor/database exec tsx src/seed-integrity.test.ts

PATH="$HOME/.local/bin:$PATH" pnpm --filter @model-monitor/web dev
```

Never commit or print database/authentication secrets. The production `.env` is runtime-only.

## Production seed expectations

After the model-directory seed and migration:

- 51 canonical models
- 10 access providers
- 18 plans
- 74 active model-access routes, with every model having access
- 4 plan quota rows
- 16 skills and 816 model-skill ratings (51 × 16)
- 10 ranking profiles
- 15 saved views
- 16 tags
- personal scores remain null until the owner rates a model

The source fixture is `data/source/LLM_MASTER_v1.csv`. CSV attributes are authoritative while database identity (creator, canonical ID, and slug) is preserved.

## Data model notes

Commercial terms, renewal information, and quotas live on `plans` and `plan_quotas`. The legacy subscription, API-token, old score, and mock-usage tables were removed by `packages/database/migrations/0009_drop_legacy.sql`. Benchmark evidence and audit events remain, but neither is a primary destination.

## Verification

```bash
PATH="$HOME/.local/bin:$PATH" pnpm lint
PATH="$HOME/.local/bin:$PATH" pnpm typecheck
PATH="$HOME/.local/bin:$PATH" pnpm test:unit
PATH="$HOME/.local/bin:$PATH" pnpm test:integration
```

E2E and integration suites are guarded to use `modelmonitor_test`, never the production database.

## Documentation

- Repository rules: `AGENTS.md`
- Visual contract: `docs/design/`
- Architecture decisions: `docs/adrs/`
- Implementation history and deferred work: `progress.md`
