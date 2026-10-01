# PR #20 production cutover

This runbook prevents the Staff Portal from losing access while the browser-to-database flow is replaced by the server-side APIs.

## Before merge

- Require TypeScript, ESLint, unit tests, production build, dependency audit, and Vercel Preview to pass.
- Verify `/`, `/report`, `/status`, `/dashboard`, `/radar`, `/privacy`, and `/admin` on Preview.
- Confirm the Preview and Production environments have their own `REPORT_STATUS_AUDIT_PEPPER` values.
- Confirm the Staff Portal server credentials exist in Production and are not exposed with a `NEXT_PUBLIC_` prefix.
- Do not apply `20260928090000_staff_portal_enforce_private_access` yet.

## Deploy application code

1. Merge PR #20 only after an authorized maintainer approves it.
2. Wait until the Production deployment reports `Ready`.
3. Verify the public report form, public status lookup, and authenticated Staff Portal through the Production domain.
4. Confirm unauthenticated requests to `/api/staff/session` return `401`.

## Enforce private database access

1. Target only the Supabase project `boluang-platform` (`uvtjjhvvtaswzhwhowlj`).
2. Apply `supabase/migrations/20260928090000_staff_portal_enforce_private_access.sql`.
3. Confirm `anon` and `authenticated` no longer have direct read/update access to staff data.
4. Confirm report images are served only through short-lived signed URLs.
5. Repeat the Production smoke test for `/report`, `/status`, and `/admin`.

## Stop conditions

Do not continue the cutover if the Production deployment is not `Ready`, a required environment variable is missing, the migration target is not `boluang-platform`, or any smoke test fails. Keep the migration unapplied until the application deployment is healthy.
