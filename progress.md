# progress — model-monitor

## preflight (2026-07-27T21:52Z) — RESULT=PASS

### Prior failure cause (fixed)
- Attempts 1–2 failed check 2: root public curl returned **307** while an older
  assertion required **200**.
- Live behavior: `GET /` → 307 `Location: /login?callbackUrl=%2F`; `GET /login` → 200.
- Current plan accepts root 200 **or** 307 when Location points to `/login`
  (optional `callbackUrl`). Re-run under that rule → PASS.
- No live-app auth change and no PLAN_DIR edit performed.

### Built
- Branch `redesign/model-directory` created from clean `master`.
- `data/source/LLM_MASTER_v1.csv` copied from plan (53119 bytes,
  sha256 `b37b96531f332ac3940868609d659a17798b8ca30123be720cf96a888641e4e1`,
  byte-identical to plan source).
- `data/source/.gitattributes` with `*.csv -text` (preserve CSV bytes / no CRLF rewrite).
- DB dump (gain, retained on rollback):
  `/home/admin/01_atlas/05_backups/model-monitor-preredesign-20260727T215229Z.sql.gz`
  (118688 bytes, gzip ok). `scripts/backup-create.sh` not used: needs `DATABASE_URL`
  and writes custom-format `*.dump` with a different name; docker `pg_dump|gzip`
  fallback matched the required path.

### Verified
- 7 containers up; `model-monitor-web` + `model-monitor-postgres` healthy.
- Public: root 307 → `/login?callbackUrl=%2F`; `/login` 200.
- git was clean on `master` before branch creation.
- Gate shell: `PATH="$HOME/.local/bin:$PATH"` → pnpm **11.11.0**, lint 0 err / 2 warn,
  typecheck clean.
- Telegram send works (start msg 251, test msg 253).
- Row counts: models 51, developers 14, access_providers 4, plans 77,
  subscriptions 12, model_access 19, model_benchmark_results 276, audit_events 992.
- `/home` free ~228 GB.
- CSV content: UTF-8; non-ASCII only U+2013/U+2014; header line 4 `Provider` / 76 cols;
  51 non-empty Model rows; `GPT-5.6 Sol` Reasoning Support `Yes: low–ultra` (U+2013).

### Deferred / baseline notes
- Did **not** run `pnpm test:unit` (forbidden here). Known master baseline:
  2 failed / 11 passed — `import-pipeline.test.ts` and `openapi-contract.test.ts`
  reference deleted `docs/implementation-package/` (commit `16eafdd`).
  `legacy-removal` deletes the affected files; no gate needs unit until then.
- Lint warnings only (unused imports in `apps/web/e2e/subscriptions.spec.ts`).

### Unsure / cosmetic
- git reports `master...origin/main [gone]`; trunk remains `master` as required.
  Cosmetic upstream mismatch; not blocking.
- `backup-create.sh` path/format differs from plan’s `preredesign-*.sql.gz` naming;
  fallback used deliberately.

### Rollback (preflight mutations only)
```
git -C "$REPO_DIR" checkout master && git -C "$REPO_DIR" branch -D redesign/model-directory
# remove data/source/ and this progress.md if reverting the whole preflight tree state
# dump stays
```
