> **Phase 7D current provider and scope:** Geoapify is the selected autocomplete, forward/reverse geocoding and map-tile provider; MapLibre renders support/detail maps. No Mapbox token or dependency is required. Use the [current provider setup](../docs/implementation/phase-7d-provider-setup.md), [data-source/import guide](../docs/implementation/phase-7d-data-sources.md) and [pilot-readiness gates](../docs/implementation/phase-7d-pilot-readiness.md). The older OAuth/direct-editor examples below are historical; current PKCE uses the exact `/auth/callback` route and staff updates require reviewed revisions. Do not use the historical `/account` redirect example to configure a new project. Production remains unchanged and no staging deployment is authorized here.

> **Phase 7B account setup:** Follow [organization accounts](../docs/implementation/phase-7b-organization-accounts.md) for email-code sign-in, migration 005, reviewed access, and administrator bootstrap. The Google-first and direct-editor instructions below describe the earlier milestone.

> Phase 7C: follow the [owner readiness guide](../docs/implementation/phase-7c-owner-readiness.md) and [security report](../docs/implementation/phase-7c-security-hardening.md) before using historical setup examples below. Use reviewed migrations 006/007 in the explicitly selected development target only. Production has not changed; real service and operational privacy gates remain BLOCKED.

# Connect the intended development project

**Hosted setup status:** real Supabase/database/Google verification remains unconfigured or unverified. Existing separate Geoapify server/browser keys are present locally. The isolated hosted-Redis algorithm check passed; the actual deployed trusted-header boundary and hosted Auth/database remain separate blockers. No remote database was changed. These steps are for your team's intended **development** project. No deployment is required.

## 1. Supply development configuration locally

Use an existing team-owned Supabase development project. An account owner must select/create that project if it does not exist. This work has not created any project or paid resource.

Merge [.env.example](../.env.example) into `.env.local` without replacing existing values. `.env.local` is ignored by Git. Keep passwords and tokens out of chat, screenshots and committed files.

| Variable | Exact value to obtain | Used by |
| --- | --- | --- |
| `SUPABASE_DEV_PROJECT_REF` | Project reference from Supabase project settings | Explicit development target for migration/test tools |
| `SUPABASE_URL` | Project URL, `https://<project-ref>.supabase.co` | Server Auth validation |
| `SUPABASE_PUBLISHABLE_KEY` | Project's publishable key; a legacy anon key is also supported | Server Auth requests |
| `VITE_SUPABASE_URL` | Same project URL | Browser sign-in |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same publishable/anon key | Browser sign-in |
| `MIGRATION_DATABASE_URL` | Owner connection from **Connect → Direct connection** or **Session pooler** | Local migrations and schema checks only |
| `DATABASE_URL` | Restricted `our_ground_api` connection; set after step 2 | Runtime API SQL |
| `BACKEND_DATA_MODE` | `postgres` | Require the real database; no in-memory fallback |
| `ALLOW_DEMO_DATA` | `true` for the fictional development fixtures; `false` to exclude them | Public data boundary |

Copy the database host from Supabase; do not guess its region/cluster. For a shared pooler, the owner's username is typically `postgres.<project-ref>`, and the runtime username will be `our_ground_api.<project-ref>`. URL-encode the password. The migration owner uses direct/session mode; runtime uses transaction mode with TLS and prepared statements disabled. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres), [custom role pooler usernames](https://supabase.com/kb/troubleshooting/tenant-or-user-not-found).

No Supabase service-role key is required. Never place `DATABASE_URL`, the migration URL, Google client secret or a service-role key under a `VITE_` name. `npm run check:env` rejects known private values/names in browser variables; `npm run check:setup` lists missing values without printing credentials.

## 2. Review and apply migrations

Review the SQL in [migrations](migrations/):

| File | Effect |
| --- | --- |
| `001_init.sql` | Private schema, PostGIS, tables, constraints, indexes and two categories |
| `002_demo_seed.sql` | Optional fictional Harrisburg/Philadelphia fixtures; excluded by default |
| `003_api_role.sql` | Restricted server SQL role; initially has no password |
| `004_private_schema_access.sql` | Explicitly removes browser-role access to application tables |
| `005_organization_accounts.sql` | Organization claims, reviewed revisions and scoped account operations |
| `006_security_boundary.sql` | Restricted projections/operations, suspension and correlated auditing |
| `007_privacy_retention.sql` | Owner-only privacy retention/redaction |
| `008_nationwide_resources.sql` | Nationwide resource geography, bounded PostGIS search and source/import provenance |
| `009_resource_privacy_withdrawals.sql` | Durable source privacy holds and owner-reviewed release; no suppressed address reconstruction or automatic republication |
| `010_location_privacy_boundary.sql` | Whole-location suppression so another service at a held site cannot disclose its address or coordinates |

The existing first three files were preserved. Migration tools validate the project reference against both Auth and database connection, acquire a database lock, record checksums, and apply pending files in one transaction. They contain no table resets or replacement of existing rows. If a file was applied manually, the original `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` statements are rerun and checked before a journal entry is recorded. If existing structure differs, inspect the failure rather than deleting data.

```sh
# If the schema is not installed yet, status reports that fact.
npm run db:status
# Schema and access roles only:
npm run db:migrate -- --apply
# Include fictional fixtures in the DEVELOPMENT database when desired:
npm run db:migrate -- --apply --include-demo
```

Demo seeding refuses collisions between reserved fixture UUIDs and non-demo records. Existing fixture rows are preserved. PostGIS must be installed in the `extensions` schema. If it is already installed elsewhere, the tool stops; it does not relocate an existing extension. Review that project's schema before adapting SQL references. [Supabase PostGIS guide](https://supabase.com/docs/guides/database/extensions/postgis).

After the API role exists, set its password privately in Supabase's SQL editor:

```sql
ALTER ROLE our_ground_api WITH PASSWORD '<your-generated-password>';
```

Do not save the real statement in this repository. Use that password in `DATABASE_URL`, with username `our_ground_api.<project-ref>` for the shared transaction pooler. Then run:

```sh
npm run check:setup
npm run db:verify
```

Verification checks required tables, foreign keys, the geographic index, API-role privileges, denial of browser-schema access, and a connection using the actual runtime role. It does not test Google. Keep `app_private` and `our_ground_meta` out of **Data API → Exposed schemas**. No browser is given database-owner credentials.

## 3. Configure Google OAuth

Use Google Cloud Console's Google Auth Platform for the team's OAuth application:

1. Configure app name/support contact and audience. If the OAuth app is in testing, add the team's test Google accounts to its allowed test users.
2. Configure basic identity scopes: `openid`, email and profile. No Drive/Gmail scopes are needed.
3. Create an OAuth client with type **Web application**.
4. Add JavaScript origins `http://localhost:5173` and `http://127.0.0.1:5173` for local testing.
5. Add the exact Supabase callback copied from **Authentication → Sign-in providers → Google**, normally `https://<project-ref>.supabase.co/auth/v1/callback`, as the **Authorized redirect URI**. This hosted Supabase callback is different from the app's `/account` URL.
6. Save the client ID and secret in Supabase's Google provider settings and enable that provider. The Google secret remains in Supabase; the app never needs it.

Follow the [Supabase Google provider guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Google OAuth configuration guidance](https://developers.google.com/identity/protocols/oauth2/web-server).

In **Supabase Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173` and allow these exact app redirects:

```text
http://localhost:5173/account
http://127.0.0.1:5173/account
```

Use the same hostname throughout a login attempt because PKCE state is stored in that browser origin. If you change the port, update Google origins and Supabase redirects. Add any future hosted origin only when it is actually needed; no deployment is part of these instructions. [Supabase redirect allow list](https://supabase.com/docs/guides/auth/redirect-urls).

`/account` explicitly exchanges the returned PKCE code, clears the code/error URL, reads the session and calls `/api/v1/me`. The API independently validates the access token with [Supabase `getUser`](https://supabase.com/docs/reference/javascript/auth-getuser). First sign-in creates an ordinary application user. It creates no organization or staff membership.

## 4. Run the real database mode

Restart processes after environment changes:

```sh
npm run dev:api
# In a second terminal; stable port matches the OAuth settings:
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://127.0.0.1:5173/support`. With fictional seeds enabled, try `17101` + Food, then `19102` + Healthcare. The frontend calls the real API; errors never fall back to the old static listings. In this mode reports persist in PostgreSQL.

Nationwide live suggestions and forward/reverse geocoding use server-only `GEOAPIFY_SERVER_API_KEY` with explicit `GEOAPIFY_LOCATION_ENABLED=true` and `GEOAPIFY_LOCATION_LIVE_APPROVED=true`. The existing separate public `VITE_GEOAPIFY_BROWSER_KEY` supplies Geoapify tiles to MapLibre; restrict it to approved browser referrers/origins. Optional mapped Places discovery retains its separate enable/approval flags, while sharing the server provider budget. All Geoapify services and browser tiles consume one free account allowance of 3,000 credits/day; the server's conservative 200-request/day admission is not a complete browser-tile/account credit cap. Do not raise limits, enable retries or activate a paid plan to make a check pass. Maps are lazy, retain attribution and fall back to the list. No Mapbox value is required. Follow the [provider guide](../docs/implementation/phase-7d-provider-setup.md) for exact restrictions, CSP/referrer compatibility and bounded live verification.

After the reviewed additive migration is applied, a local HRSA CSV can be validated without database access:

```sh
node --experimental-strip-types scripts/import-hrsa.mjs --file /absolute/path/to/reviewed.csv
```

A deliberate nonproduction apply uses the owner-only `HRSA_IMPORT_DATABASE_URL` in ignored configuration and an explicitly selected development project:

```sh
node --env-file=.env.local --experimental-strip-types scripts/import-hrsa.mjs \
  --file /absolute/path/to/reviewed.csv --development-target --apply
```

This command refuses production runtime and the application role. Use `--full-snapshot` only for a reviewed complete source snapshot and cautious stale-record reconciliation. `--local-test-target` is reserved for a disposable loopback `ourground_7d*` database, not a way to bypass hosted targeting. Downloading with `--download` is a separate explicit official HRSA request; reuse a reviewed file for repeated checks. Importing does not independently verify an organization, patient availability, free care or hours. No production import or schedule is installed; see [data sources](../docs/implementation/phase-7d-data-sources.md).

## 5. Assign one staff account deliberately

Sign in with Google at `/account`. Confirm the new account has no editing rights. Copy its Auth user UUID from Supabase **Authentication → Users**, then deliberately grant one organization's editor membership with the owner tool:

```sh
npm run db:grant-editor -- --user <auth-user-uuid> --organization 22222222-2222-4222-8222-222222222222
```

That organization UUID is the fictional Harrisburg organization. Use another ID only when intentionally assigning that organization. Refresh `/account`, open the service record and save an edit. This command neither promotes the user to admin nor grants access to other organizations. Never use an email-domain check or Google profile metadata to assign permissions.

For a conflict check, load the same record in two tabs, save in the first, then save in the second. The second must show a conflict and keep its unsaved text. It must not silently overwrite the first save.

## 6. Complete the outstanding real-service checks

Run `npm run db:verify`, then walk through search → details → report in the browser. Confirm the report exists in `app_private.correction_reports` through the owner SQL editor, and that the updated service appears publicly.

For automated real SQL/Auth tests, obtain fresh Supabase access tokens from **two Google-signed-in, ordinary test accounts** and set `INTEGRATION_STAFF_ACCESS_TOKEN` and `INTEGRATION_OUTSIDER_ACCESS_TOKEN` privately in `.env.local`. They are the Supabase session tokens, not Google provider tokens. For example, use your own browser's developer tools to inspect the Authorization header on `/api/v1/me`; never share or commit it.

```sh
npm run test:integration
```

The suite validates those real sessions, creates a new fictional organization/location/service, verifies no automatic membership, explicitly assigns the selected test editor to that disposable organization, checks discovery/report persistence, rejects unauthorized edits and stale writes, then removes only its own fixture rows. It leaves existing records and existing user memberships alone. Missing values produce an explicit **SKIP / BLOCKED**, never a live verification claim. This API suite validates existing Google sessions; the actual Google consent/redirect browser flow must also be exercised manually.
