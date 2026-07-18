# Security and Authentication

## Threat model

The application contains commercial subscription information and operational model-routing data. It does not need to store provider API keys during the MVP.

Primary risks:

- unauthorized access
- leaked Hermes token
- destructive import
- spreadsheet injection
- insecure file upload
- accidental public deployment
- database backup exposure
- XSS through imported notes
- CSRF in authenticated mutations

## Authentication

- Auth.js Google provider.
- `ALLOWED_EMAILS` environment variable.
- Deny all accounts not in the allow-list.
- Secure, HTTP-only, SameSite cookies.
- Rotate application secret before production.
- Reauthentication is required for permanent deletion and API token creation.

## Authorization

Roles:

- `owner`
- `service`

The owner has UI access. Service tokens are limited by scopes.

Initial service scope:

- `catalog:read`

## Secrets

Environment variables:

```text
DATABASE_URL
AUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
ALLOWED_EMAILS
APP_BASE_URL
BACKUP_ENCRYPTION_KEY
```

Do not store provider credentials in database fields, seed files, logs, or audit payloads.

## API token storage

- Generate at least 32 random bytes.
- Format: `mm_<prefix>_<secret>`.
- Store prefix and Argon2id or SHA-256/HMAC hash.
- Show full token once.
- Support revocation and expiry.
- Audit creation and revocation.
- Redact authorization headers from logs.

## Upload security

- Accept only XLSX/XLSM MIME types plus signature validation.
- Configurable maximum size.
- Store outside public directories.
- Randomize server filename.
- Never execute workbook macros.
- Do not evaluate formulas.
- Scan archive structure for zip bombs.
- Limit row and cell counts.
- Sanitize exported values against formula injection.

## Application security

- Zod validation for all inputs.
- Parameterized database queries through Drizzle.
- Escape imported HTML.
- Content Security Policy.
- CSRF protection through framework-authenticated mutation conventions.
- Rate limit login callbacks, API token access, imports, and exports.
- Prevent open redirects.
- Disable verbose errors in production.

## Audit privacy

Audit events may contain before and after values but must exclude:

- passwords
- OAuth tokens
- API tokens
- authorization headers
- encryption keys
- raw session cookies

## Backups

- Daily encrypted PostgreSQL dump.
- Retain at least seven daily and four weekly backups.
- Store outside the application container.
- Restrict file permissions.
- Perform a restore test before MVP release and periodically afterward.

## Deployment checklist

- HTTPS only
- private DNS or strong authentication
- no database port exposed publicly
- no default credentials
- production secrets distinct from development
- container runs as non-root where practical
- dependency audit
- backup path mounted
- health checks enabled
