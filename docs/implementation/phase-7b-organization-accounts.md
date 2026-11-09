# Phase 7B — Organization accounts and reviewed listing management

November 5, 2026. **Implemented and verified locally. No deployment or production configuration change.**

Canonical checkout: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/Documents/Projects/our-ground`. The real path, Git root, existing dirty working tree, and `.vercel/project.json` were checked before implementation. The project remains `ourground`, `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`, team `penuels-projects-aa802b06`. Existing uncommitted work was preserved. Production remains on Phase 7A deployment `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4` at [Our Ground](https://ourground.vercel.app).

## Review the local implementation

- [Normal production-build preview](http://127.0.0.1:18418/account) uses the preserved local configuration and correctly explains that live organization sign-in is unconfigured.
- [Synthetic workflow preview](http://127.0.0.1:18419/account) exercises the actual application API and PostgreSQL authorization with a loopback-only authentication fixture. Its banner identifies synthetic accounts and fictional listings. No real email is sent.
- Synthetic representative: `alice@organization.invalid`; reviewer: `reviewer@ourground.invalid`; unrelated user: `bob@organization.invalid`. Request a code, then enter **246810**. These are test-only identities, not real credentials. Alice currently has approved access to the fictional pantry and an approved revision. The other fictional location remains outside Alice's access.
- Administration is at [the local review queue](http://127.0.0.1:18419/account/administration). It requires the reviewer session. Test login requests retain the same three-per-email/hour and ten-per-client/hour limits.

The previews and disposable database are running locally. Temporary preview services must be restarted after a machine restart. They do not establish a live Supabase connection.

## Authentication and authorization

Email OTP is the default. Supabase's existing SDK stores and refreshes the browser session. The callback route is `/auth/callback`; codes are entered in the form and are not placed in URLs. Authentication errors use generic recovery messages. Sign-out clears local private forms/cards and revokes both the provider session and the hashed session ID in PostgreSQL. A provider logout failure still leaves that session denied by the application. Revoked session hashes remain denied beyond the initial access-token expiry, preventing refresh from restoring that session.

The server uses supported Supabase `getUser(token)` verification, requires confirmed email, a matching subject, finite unexpired expiry and a valid session ID, then reads current application permissions from PostgreSQL. Decoded JWT claims and browser roles never grant authority. Authenticated mutations use explicit bearer headers rather than ambient authentication cookies. The email request endpoint checks an exact allowed origin and shared, HMAC-hashed client/email rate buckets; client IPv6 addresses use the existing network normalization. Claims, revisions and administrator mutations have separate shared database limits. No service-role key is required.

## Claims, listing updates and administration

A signed-in applicant submits an organization name, location, role, organization-related contact, optional website and explanation. The form advises against identity documents and unnecessary sensitive information. Duplicate pending requests are rejected. The request grants no access. Names, matching email domains and multiple locations never merge automatically.

An administrator reviews the evidence, selects the exact existing sourced service record, and records a supporting URL and note. Approval creates a stable user/organization membership plus a binding to that listing. Another listing at the same organization remains inaccessible until separately approved. Rejection creates no binding. Revocation removes the membership and its listing bindings immediately. Self-review is denied for claims and revisions, including when the applicant is an administrator.

The workspace shows the current organization/location, service and contact fields, categories, source/date, and review history. Changes become pending revisions. Administrator approval locks and rechecks service, organization and location versions and the applicant's current access before applying all approved fields atomically. Rejection preserves the current published data. Stale revisions conflict rather than overwrite newer records. Publication status, source evidence, organization ownership and donation destinations are not applicant-editable. The old direct-publishing PATCH route now returns `REVIEW_REQUIRED`; legacy authenticated reads use the scoped authorization path.

Migration 005 reuses the original private schema and adds six RLS-enabled private tables, version columns, an immutable audit trail and narrow server-only command/rate functions. Browser database roles receive no grants or command execution. The server SQL role cannot directly modify listing publication fields. No original migration was rewritten. Migration SHA-256: `b97aafc06faf408c72da0f93767682aa1b3f35d21dd302edd32ba5692d65e7e9`.

## Validation

| Check | Actual result |
| --- | --- |
| `npm test` | **111 passed**, zero failed or skipped |
| `npm run build` | **Passed** Node 24.22.1, both TypeScript checks, public-environment check and Vite production build; existing bundle-size warning remains |
| `npm run test:organizations` with the isolated local database | **27 passed**, zero failed or skipped: 14 database checks and 13 API/SDK/PostgreSQL checks; fixture mutations rolled back |
| Browser flow | Email-code sign-in → pending claim → reviewer approval → assigned listing → pending revision → reviewer approval → changed listing; actual HTTP API and PostgreSQL, no replayed account responses |
| Browser denials and session | Unrelated listing returned 404; non-admin queue returned 403; hidden workspaces were not visible; logout cleared private fields; persistent reviewer session survived final-build reload |
| Layouts | 1440 × 900 and 390 × 844, no horizontal overflow or JavaScript exceptions/console errors in the captured flow |
| Preserved files | All **36 public assets** retain baseline SHA-256 hashes; 50 protected files including photographs, favicon, search/maps, giving evidence, homepage and About/disclosure were unchanged |
| Normal local preview | Eight routes returned 200; 32 client JS/CSS bundles passed server-key/Redis-value exclusion; account configuration state was truthful |
| External usage | **Zero live Geoapify or real Supabase/email requests** for Phase 7B; no Redis limit/counter changes |

The twelve requested authorization cases are covered by the unit and physical PostgreSQL/API matrices: public unauthenticated discovery, signed-out denial, no rights on new sign-in, pending claims, own-listing access, self-review denial, non-admin denial, cross-organization and same-organization-other-location denial, donation-field rejection, rejection/revocation, review-before-publication, expiry and logout. Additional coverage includes unsafe URLs, malicious roles/ownership, malformed bodies, stale revisions, duplicate claims, shared rate limits, RLS/ACLs, immutable audit and safe error handling.

Validation ran sequentially with `GOMEMLIMIT=64MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=192`. iCloud placeholders in installed dependencies were restored using lockfile-exact `npm ci --ignore-scripts --no-audit --no-fund`; the lockfile and dependency versions did not change. Local PostgreSQL 18.6/PostGIS 3.7 tooling was installed for a disposable loopback database. No Homebrew database service was enabled. The synthetic authentication server verifies signed test JWTs and session state; it never sends email or supplies production authentication.

The source manifest has 159 files and SHA-256 `a1add7642493f69cb57ca58b799f8a81d0556749cded33de7e5ac6421805642f`. Its digest is SHA-256 over the sorted compact JSON mapping of paths to SHA-256 file digests; it covers application/server/shared/test/public/script files and selected root configuration, excluding credentials and validation output. [Identity and exact file hashes](../../output/phase-7b/final-identity.json) · [Tests](../../output/phase-7b/tests.log) · [Build](../../output/phase-7b/build.log) · [Database/API matrices](../../output/phase-7b/integration.log) · [Browser HTTP evidence](../../output/phase-7b/browser-results.json) · [Normal preview](../../output/phase-7b/normal-preview.json).

| Screenshot | Desktop | Mobile |
| --- | --- | --- |
| Account | [Account](../../output/phase-7b/account-desktop.jpg) | [Account](../../output/phase-7b/account-mobile.jpg) |
| Pending claim | [Pending](../../output/phase-7b/pending-claim-desktop.jpg) | [Pending](../../output/phase-7b/pending-claim-mobile.jpg) |
| Organization dashboard | [Dashboard](../../output/phase-7b/dashboard-desktop.jpg) | [Dashboard](../../output/phase-7b/dashboard-mobile.jpg) |
| Administrator claim review | [Access review](../../output/phase-7b/administration-claim-desktop.jpg) | [Access review](../../output/phase-7b/administration-claim-mobile.jpg) |
| Administrator revision review | [Listing review](../../output/phase-7b/administration-revision-desktop.jpg) | [Listing review](../../output/phase-7b/administration-revision-mobile.jpg) |

## Exact files changed

- `.env.example`
- `backend/SETUP.md`
- `backend/app.ts`
- `backend/db-checks.mjs`
- `backend/env-boundary.mjs`
- `backend/manage-db.mjs`
- `backend/migrations/005_organization_accounts.sql`
- `backend/organization-api.ts`
- `backend/organization-auth.ts`
- `backend/organization-store.ts`
- `backend/runtime.ts`
- `package.json`
- `shared/organization-accounts.ts`
- `src/account.css`
- `src/account.ts`
- `src/backend-client.ts`
- `src/main.ts`
- `src/organization-admin.ts`
- `src/organization-ui.ts`
- `src/participate.ts`
- `src/staff.ts`
- `tests/backend.test.mjs`
- `tests/live.integration.mjs`
- `tests/organization-api.integration.mjs`
- `tests/organization-api.test.mjs`
- `tests/organization-auth-fixture.test.mjs`
- `tests/organization-auth-server.mjs`
- `tests/organization-auth.test.mjs`
- `tests/organization-database.integration.mjs`
- `docs/implementation/phase-7b-organization-accounts.md`

Screenshots, logs and manifests are ignored validation artifacts under `output/phase-7b/`; no auth profiles, tokens, cookies or real configuration values are included.

## Owner configuration required for live accounts

No Supabase URL/key, database connection, migration-owner connection, or development project reference was configured in the canonical checkout when Phase 7B began. No team-owned Supabase project was created or selected, no real authentication email was sent, and no remote database migration was run. The completed local verification uses an isolated PostgreSQL database and an explicitly synthetic authentication fixture. It does not establish a live Supabase integration.

Select an existing team-owned **development** Supabase project, or have its owner create the intended free development project after reviewing the service's current limits. This implementation does not require a paid plan, Google OAuth, or a Supabase service-role/secret key. Keep real secrets in ignored `.env.local` or the approved server environment, never in chat, documentation, screenshots, or `VITE_` variables.

Merge only the required values into `.env.local`, preserving the existing Geoapify and Redis configuration:

| Variable | Required configuration |
| --- | --- |
| `SUPABASE_DEV_PROJECT_REF` | Exact reference of the owner-selected development project. Migration/bootstrap tools validate this reference. |
| `SUPABASE_URL` | That project's `https://<project-ref>.supabase.co` URL. |
| `SUPABASE_PUBLISHABLE_KEY` | That project's public publishable key, or supported legacy anon key. |
| `VITE_SUPABASE_URL` | Same project URL as the server. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same public publishable/anon key as the server. Never a service-role key. |
| `MIGRATION_DATABASE_URL` | Server/local-tool-only owner connection from Supabase's **Connect** panel, using a direct or session-pooler connection. |
| `DATABASE_URL` | Server-only connection for the restricted `our_ground_api` role after reviewed migrations create it. Copy the actual host/port from the project; URL-encode the generated role password. |
| `BACKEND_DATA_MODE` | `postgres` for actual organization accounts. Disabled/demo modes do not enable organization authentication. |
| `ALLOW_DEMO_DATA` | `false` for ordinary resource search. Optional development fixtures are separately and explicitly enabled. |
| `ACCOUNT_ALLOWED_ORIGINS` | `http://127.0.0.1:18418` for the authorized normal local preview. Exact origins only; no path, trailing slash, wildcard, or broad Vercel allowance. |

In Supabase Auth, enable email sign-in and allow new email users for the intended public claim workflow. A newly registered user remains an ordinary user with no listing access. Configure the template used by `signInWithOtp` to display **`{{ .Token }}`** as the verification code. Review the project's Magic Link and, where applicable, Confirm Signup template so both new and existing users receive a code. Avoid `{{ .ConfirmationURL }}` and credentials in callback query strings. The app accepts a six- to eight-digit email code and verifies it with `verifyOtp({ email, token, type: 'email' })`. Sign-in verifies email ownership; it never grants organization access by itself. Retain Supabase's OTP expiry, resend, verification and anti-abuse limits. Hosted email-delivery/SMTP restrictions must be checked by the owner with an authorized test address before declaring live mail delivery verified.

Use these exact local URL settings for that development project:

- Site URL: `http://127.0.0.1:18418`
- Additional application redirect: `http://127.0.0.1:18418/auth/callback`

The callback route accepts no credential-bearing URL flow. Its account screen returns users to code-based sign-in. Use the same hostname and browser throughout a sign-in attempt. Port **18419** belongs to the isolated synthetic verification preview; it does not need to be added to a real Supabase allowlist. Production authentication origins and redirects should be added only as part of a separately approved release. This local implementation does not change production configuration.

## Migrations, database permissions and bootstrap

Review `backend/migrations/005_organization_accounts.sql` with the existing migrations before applying it to the selected development project. Migration 005 adds versions to organizations/locations and creates private claim, listing-access, revision, audit, revoked-session, and rate-limit tables. It does not replace existing records, expand the Pennsylvania directory boundary, ingest providers, or alter reviewed giving evidence.

The new tables enable RLS with no browser policies. `anon`, `authenticated`, and `PUBLIC` receive no schema/table access or command execution. `app_private` and `our_ground_meta` must remain outside Supabase's exposed Data API schemas. The runtime role can execute only the narrow account command and rate-gate entry points. It cannot directly write claims, membership bindings, revisions or audit records, change administrator roles, or update service publication fields. The command checks the database's current administrator role and assigned listing association on each operation. Approval locks and rechecks the revision, listing versions and active applicant access; revocation blocks later approval of an outstanding revision. Audit decisions are append-only.

Run with Node 24.22.1 from the canonical checkout:

```sh
npm run check:setup
npm run db:status
# After reviewing and approving the DEVELOPMENT migration:
npm run db:migrate -- --apply
```

`db:status` reports an uninstalled schema rather than inventing one. `db:migrate` applies pending 001/003/004/005 migrations in a transaction with an advisory lock. Optional fictional seeds require the additional explicit `--include-demo` flag and reject reserved-ID collisions. The migration journal records each file's SHA-256 and refuses a changed previously applied file. PostGIS must use the existing `extensions` schema; the tool does not relocate an existing extension. The configured Auth URL and database host/username must match `SUPABASE_DEV_PROJECT_REF` before these tools perform database work. Do not point these development commands at production.

After the restricted role exists, its owner must set a generated password privately in the database console and configure `DATABASE_URL` for **`our_ground_api`**, rather than reusing the migration-owner connection. Run:

```sh
npm run db:verify
```

Verification checks tables, foreign keys, spatial index, RLS and private function/table grants, then verifies the runtime connection actually uses `our_ground_api`. Account mutations also have shared database limits. Authentication email requests use separate per-client/per-email hashed buckets; they do not consume or alter the Geoapify admission counters.

Bootstrap the initial administrator only after the intended owner has signed in and confirmed their email in the selected development project's Auth users. Read the exact user UUID and verified email from that project's trusted administration console. The owner-only procedure is:

```sh
node --env-file=.env.local backend/manage-db.mjs bootstrap-admin \
  --user '<exact Auth user UUID>' \
  --email '<that user’s confirmed email>' \
  --confirm-admin
```

The tool retains the explicit development-target guard. In one owner transaction, it requires an existing `auth.users` record matching both UUID and case-insensitive email, with `email_confirmed_at` set, before granting the administrator role and recording `admin.bootstrapped`. There is no first-user promotion, public administrator-registration action, or client role field. The former direct `grant-editor` command now directs owners to the reviewed claim workflow.

## Listing association and remaining scope

An administrator approves a claim by selecting the **existing trusted service record for the exact organization and location**, recording the supporting source and reviewer note. The grant binds that user to the selected listing; another service at the same organization or another location remains inaccessible without its own approved association. Similar names and matching email domains never produce an automatic match.

An unlisted organization can submit a pending request, but an administrator cannot approve it until an appropriate trusted directory record exists. Provider ingestion or creation of new real public records is a separate, explicitly reviewed task. This release does not import or mutate raw Geoapify records and does not expand public directory coverage beyond Pennsylvania. Revisions preserve the current publication status and independent sources. Giving destinations remain server-owned reviewed evidence; the revision API/database reject arbitrary donation fields.



## Reproduce the database checks locally

Use a disposable loopback PostgreSQL/PostGIS database whose name begins `ourground_7b`. The integration scripts reject other hosts/names and do not load `.env.local`. As its local test owner, create the usual Supabase browser roles `anon` and `authenticated`, apply migrations 001, 003, 004 and 005 in order, and run:

```sh
ORG_TEST_DATABASE_URL=postgres://ourground_test@127.0.0.1:18790/ourground_7b npm run test:organizations
```

The currently running local database also has the explicitly fictional 002 fixtures for the browser preview. Each integration matrix creates its own synthetic rows in a transaction and rolls them back. The separate real-provider integration harness remains opt-in and requires owner-supplied development credentials and confirmed sessions; it was not run without those credentials.

Current official references: [Supabase Auth](https://supabase.com/docs/guides/auth), [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [verified users](https://supabase.com/docs/reference/javascript/auth-getuser), [OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp), [RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).
