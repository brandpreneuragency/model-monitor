# Model Monitor — Implementation Package

Model Monitor is a private, single-user web application for maintaining an authoritative registry of LLMs, subscriptions, access paths, scores, benchmarks, sources, and manual usage status. It will also expose a stable read-only catalog for the Hermes orchestrator.

## Locked decisions

- New repository: `model-monitor`
- Product name: **Model Monitor**
- Domain: decided later
- Deployment: private VPS with Docker Compose
- Stack: Next.js, TypeScript, PostgreSQL, Drizzle ORM, Zod, Tailwind CSS, shadcn/ui, TanStack Table, React Hook Form, Auth.js, OpenAPI
- Authentication: Google OAuth with an email allow-list
- Timezone: `Europe/Istanbul`
- Default currency: `USD`
- Data deletion: archive first; permanent deletion only through an advanced danger flow
- Usage monitoring in MVP: manual and mock data
- Hermes in MVP: read-only API and export contract
- Routing rules and provider usage integrations: post-MVP

## Package contents

- `docs/` — product, UX, architecture, import, security, testing, and deployment specifications
- `contracts/` — PostgreSQL DDL, OpenAPI contract, Hermes JSON Schema
- `data/` — normalized 51-model roster, subscription seeds, access records, aliases, benchmarks, and workbook audit
- `source/` — the original workbook
- `AGENTS.md` — implementation rules for coding agents
- `PROMPTS.md` — copy-ready prompts for each build phase
- `PLAN.md` — ordered implementation plan
- `PROGRESS.md` — progress and evidence tracker
- `templates/` — templates for decisions, pull requests, and test evidence

## Recommended execution order

1. Give the entire package to the architecture agent and run Prompt 0 from `PROMPTS.md`.
2. Create the repository and commit the package under `/docs/implementation-package`.
3. Execute Prompts 1–7 in order.
4. After every implementation run, use the review prompt before continuing.
5. Keep `PLAN.md` and `PROGRESS.md` updated in the repository.
6. Do not enable live provider integrations or automatic routing until the MVP acceptance criteria pass.

## Workbook snapshot

The source workbook defines a locked roster of 51 canonical models and contains 276 benchmark evidence rows. Its `Master Models` sheet currently has 31 populated rows and mixes canonical models with duplicate access-provider rows. The import pipeline must therefore normalize the workbook rather than copy it directly into one database table.

See:

- `docs/07_IMPORT_AND_MIGRATION.md`
- `data/workbook-inventory.json`
- `data/import-column-mapping.csv`

## Definition of done

The MVP is complete only when:

- All 51 canonical seed models import without duplicate canonical records.
- The four current subscriptions and 19 confirmed model-access relationships appear correctly.
- Models, plans, subscriptions, access records, benchmarks, scores, and sources support create/edit/archive/restore flows.
- Every write creates an audit record.
- Workbook import provides a preview and requires explicit commit.
- The access matrix correctly represents many-to-many relationships.
- Hermes can retrieve a versioned, authenticated, read-only catalog.
- Backup and restore are proven on a clean database.
- All acceptance criteria in `docs/13_ACCEPTANCE_CRITERIA.md` pass.
