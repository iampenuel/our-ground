# Verification record — 27 October 2026

> Latest verification: [Phase 7C security report](../docs/implementation/phase-7c-security-hardening.md) and [30-case matrix](../docs/implementation/phase-7c-verification-matrix.md). Earlier results below remain historical evidence. Phase 7C uses physical local PostgreSQL/Redis and explicitly synthetic authentication; it does not establish real Google/Supabase or hosted production verification.

**The frontend is connected to the API. Real Supabase database and Google sign-in verification remain blocked by missing credentials/account access.** No remote database changes or deployment were performed.

## Passed

| Check | Evidence and scope |
| --- | --- |
| Automated tests | `npm test`: **23 passed**, 0 failed. Includes API ownership/anonymous denial, stale edits, hidden/demo visibility, keyword/radius filters, safe links/return URLs, development-target validation, public-secret rejection, and the earlier illustrative-resource tests. Authentication in API unit tests is injected, not a real Google session. |
| Frontend TypeScript | `npm run typecheck`: passed. |
| Backend TypeScript | `npm run typecheck:backend`: passed. |
| Production build | `npm run build`: passed, including public environment checks. |
| Optional map build | Mapbox branch compiled to a separate temporary output using an explicitly fake public token. This checks bundling only; no map requests or account verification occurred. |
| Browser discovery | Entered `17101`, chose Food and a 10-mile radius, opened the API-returned fictional pantry, and confirmed the details and disabled contact actions. Returning preserved the filters. |
| Browser correction report | Submitted the detail-page form anonymously; the running demo API returned success and the page displayed “Thank you. Your report was received.” This report was in memory, not PostgreSQL. |
| Empty/invalid locations | Harrisburg + Healthcare returned no matches; Philadelphia + Healthcare returned the fictional health record; New York produced a Pennsylvania-location error. |
| Missing configuration | With real database mode selected and credentials absent, a direct resource query returned HTTP 503 `DATABASE_NOT_CONFIGURED`; the search screen displayed a provider/setup error and did not substitute static listings. |
| Anonymous edit over HTTP | The running API rejected an anonymous PATCH with HTTP 401. |
| Unconfigured account page | Browser showed the setup/unavailable state without claiming a successful login. |

Browser checks used the local demo API on port 8787 and the Vite proxy. Final visual evidence was captured on temporary port 5187 after a browser cache from a different local project affected port 5173. The documented Google setup uses stable port 5173; Google was not exercised on either port. The existing dark layouts, cards, filters and detail structure were retained. Local screenshots are under `output/backend-verification/` and excluded from Git.

The build emits the existing large globe-demo chunk warning. When enabled, the optional Mapbox library also forms a large lazy chunk. Neither warning prevents the build.

## Blocked — not passed

| Check | Exact blocker |
| --- | --- |
| Apply migrations to development Supabase | `npm run db:migrate -- --apply --include-demo` stopped before connection: `MIGRATION_DATABASE_URL` missing. No transaction committed. `db:status` also reports the missing value. |
| Real schema, relationships and ACL inspection | Requires owner access and an explicitly identified development project. SQL migration files were read; they were not executed remotely. |
| Persistent search/details/reports through PostgreSQL/PostGIS | `DATABASE_URL`, migration URL, project reference and Supabase project values are absent. The SQL adapter is implemented but has no live execution claim. |
| Real Google consent, callback and session | Supabase dashboard redirects to sign-in; Google/Supabase provider configuration and public app keys are unavailable. |
| Real staff browser editing and concurrent SQL writes | Requires the real database plus manually assigned Google accounts. Unit tests prove the in-memory/API permission and conflict behavior only. |
| Live Mapbox geocoding/tiles | No server geocoding token or browser public map token. List discovery works with the documented demo city centers. |
| Existing Vercel environment discovery | Connected account received 403 for this project's team scope. Local setup can be supplied directly; no credentials were copied from Vercel. |

`npm run test:integration` reported **0 passed, 1 skipped**, explicitly listing the missing database/project settings and two fresh Supabase Google-session tokens. That suite is ready to exercise the SQL adapter and real session validation after setup; it is not a substitute for the Google browser consent/redirect check.

## Next actions

Follow [SETUP.md](SETUP.md): select the development project, fill `.env.local`, run migrations, set the restricted SQL role password, configure Google origins/callback/app redirects, sign in with two test accounts, and deliberately grant one editor membership. Then rerun `db:verify` and `test:integration`, and repeat the browser journey against PostgreSQL.

No application user receives organization/staff access merely by signing in. No records were presented as verified or currently available. No paid resources were created. Automatic Vercel Git deployment is disabled for this source handoff.
