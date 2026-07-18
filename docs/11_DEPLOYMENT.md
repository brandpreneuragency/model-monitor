# Deployment Specification

## Target

Private VPS deployment using Docker Compose. Use PostgreSQL 16 or newer.

## Services

```text
web
postgres
backup
```

A separate worker is postponed until live provider integrations exist.

## Suggested repository layout

```text
model-monitor/
├── apps/
│   └── web/
├── packages/
│   ├── database/
│   ├── schemas/
│   ├── ui/
│   ├── api-client/
│   ├── excel-import/
│   └── hermes-contract/
├── docs/
├── docker/
├── scripts/
├── compose.yaml
├── .env.example
├── AGENTS.md
├── PLAN.md
└── PROGRESS.md
```

## Environments

### Local

- Docker PostgreSQL
- Next.js development server
- mock usage seed
- Google OAuth local callback or development auth bypass restricted to local environment

### Production

- Docker Compose
- reverse proxy with HTTPS
- persistent PostgreSQL volume
- persistent encrypted backup volume
- production Google OAuth callback
- domain supplied later

## Required scripts

```text
dev
build
start
lint
typecheck
test
test:unit
test:integration
test:e2e
db:generate
db:migrate
db:seed
db:studio
import:fixture
backup:create
backup:restore
verify
```

## Migration policy

- Schema changes use committed Drizzle migrations.
- Never run destructive schema generation directly against production.
- Back up before production migration.
- Migration and application versions are logged.
- Roll-forward is preferred; rollback instructions are required for risky migrations.

## Backup

Daily job:

1. `pg_dump` in custom format.
2. compress if needed.
3. encrypt.
4. write checksum.
5. prune by retention policy.
6. report failure through logs.

Restore test:

1. create clean database
2. restore latest backup
3. run migrations
4. run seed integrity checks
5. call health and Hermes catalog endpoints

## Domain configuration later

When a domain is selected:

- configure DNS
- issue TLS certificate
- update `APP_BASE_URL`
- update Google OAuth redirect URI
- update reverse proxy host
- verify secure cookies
- verify CSP and allowed origins

## Observability

MVP:

- structured application logs
- request ID
- database health
- import job logs
- backup logs
- `/api/v1/health`

Do not log request bodies for authentication, API token creation, or future provider credentials.
