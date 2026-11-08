# Phase 7E — owner’s free staging setup guide

Reviewed November 5, 2026 against the current repository and primary provider documentation. This is a preparation guide. **No Supabase, Google or Upstash resource has been created/configured; no hosted migration, import or deployment has been authorized or performed.** Each later hosted action needs approval naming its exact isolated target and scope. Do not buy a plan, enter a payment card, connect GitHub, move a production domain or change production credentials.

## 1. Confirm the target and free capacity

The separately approved empty Vercel project already exists:

| Item | Recorded value/status |
| --- | --- |
| Team | `team_7zBDrVIlwYth2sXkAbBPcbYw` / `penuels-projects-aa802b06` |
| Project | `ourground-staging` / `prj_eU9xRSetSQYTbkAce2cYIR5zx8c2` |
| Current contents | Zero deployments, zero environment variables, no Git connection; SSO protection enabled |
| Node setting | Currently default 26.x; future approved configuration must select 24.x |
| Reserved domain | `ourground-staging.vercel.app`; this is not a live staged application |
| Protected production project | `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`; do not target it |

Evidence: `/private/tmp/our-ground-7e/staging-project-created.json`. The canonical checkout remains linked to production. Do not run Vercel linking, env pulls or deployment commands there. An automatic project domain is not proof that a Preview deployment will receive that alias; choose and review the exact stable HTTPS staging origin before configuring Auth.

Check actual account capacity in each dashboard before requesting creation:

- **Supabase:** select a Free organization with room for a separate project. Current Free allowances include two active projects, 500 MB database storage, 50,000 monthly active users and 5 GB egress; inactive projects can pause after one week. Existing account availability is unknown. A project in a paid organization can incur charges. Stop if the dashboard proposes billing or has no free slot. [Supabase pricing](https://supabase.com/pricing).
- **Upstash:** verify that a genuinely separate Free Redis database is available. The current normal Free plan lists one database, 250 MB storage, 500,000 commands/month and 10 GB bandwidth. Do not repurpose production Redis, use a temporary three-day database, add payment details, or create another account to bypass limits. Stop if a dedicated free instance is unavailable. [Upstash pricing](https://upstash.com/pricing/redis), [payment-method effects](https://upstash.com/docs/redis/howto/upgrade-database).
- **Vercel:** the inspected team is Hobby. Hobby is restricted to personal, noncommercial use; owner eligibility and remaining quotas still need review. Do not select paid custom environments, add-ons or upgrades. Initial staging target is the separate project’s **Preview** environment. [Hobby plan](https://vercel.com/docs/plans/hobby).

The disposable local database currently occupies 169,637,567 bytes, including imported public HRSA/Census data and test-schema history. This is only a local measurement, not a hosted size estimate or capacity guarantee. Check hosted database size and index growth before/after each approved import and retain headroom below the free limit.

## 2. Prepare isolated files and an approval record

Use a separate, owner-reviewed copy of the current source; include its uncommitted implementation, not an old Git HEAD. Exclude `.vercel`, all `.env*` except `.env.example`, `node_modules`, `dist`, logs and local fixtures. Keep the canonical checkout and its `.env.local` unchanged. Verify approved asset/source hashes against the handoff before installing dependencies.

Copy [staging-target.example.json](staging-target.example.json) into a new local target manifest. Enter only nonsecret IDs: exact team/project above, `deployment_target: "preview"`, selected HTTPS origin, separate Supabase project reference, production Auth baseline evidence and dedicated Redis hostname. Record a real owner approval reference for the specific next action; project-creation approval is insufficient for configuration or SQL. Current production has no Auth/DB env names in the recorded inventory; confirm that baseline before declaring `production_auth_confirmed_unused`.

Use [staging-environment.example](staging-environment.example) as a checklist, **never as a bulk Vercel import**. Create separate ignored files with permission `0600`:

| File purpose | Values allowed |
| --- | --- |
| Owner tooling/preflight | Matching staging project IDs, separate owner/runtime DB URLs, importer owner URLs when approved, public Auth configuration, required CA, staging credential comparisons |
| Application runtime | Restricted runtime DB URL, matching public Auth values, dedicated Redis/server-provider credentials, exact origins and reviewed feature flags; no migration/import/maintenance owner URL |
| Browser build | Only approved `VITE_` public values and matching public `SUPABASE_URL` if supplied for CSP validation; no owner connection, Redis token, server-provider key or Google secret |

Use a password manager/private editor. Never paste passwords, full connection URLs, Redis tokens, access tokens or Google client secrets into chat, screenshots, tickets, command arguments or shell history. Do not `cat`, log or bulk export populated environment files. Public Supabase publishable keys and browser-referrer-restricted map keys are intentionally browser-visible; this does not make server keys public.

## 3. Create and verify the separate Supabase project — after exact approval

1. In the Supabase dashboard, choose the reviewed Free organization, **New project**, and a clear name such as `ourground-staging`. Select an appropriate region, save a new strong database-owner password privately and confirm the final screen remains $0. Stop on paid capacity/add-on prompts.
2. Record the new project reference from Project Settings and its exact `https://<staging-ref>.supabase.co` URL. Confirm it differs from every protected production reference. In API Keys, copy only the project’s publishable key into the matching server/browser public-key fields. This app does not require a Supabase secret/service-role key.
3. In **Connect**, copy actual host/port/user values; do not construct a pooler hostname from a guessed region. For owner migrations use direct IPv6 if available, otherwise the shared **Session pooler, port 5432**. Free direct connections are IPv6; the shared session pooler supports IPv4 and custom usernames of the form `our_ground_api.<staging-ref>`. [Connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres).
4. For this repository’s Postgres.js driver, start with direct/session connections for staging runtime too. Current Supabase guidance identifies query-pipelining incompatibility with the shared transaction pooler; disabling prepared statements alone does not resolve it. Do not blindly copy a `:6543` example. The existing clients each cap their pool at one, but several clients/instances still consume multiple connections; test bounded concurrency and watch pool limits before any pilot. [Postgres.js guidance](https://supabase.com/docs/guides/database/postgres-js).
5. Open **Database → Settings → SSL Configuration**, download the project’s public CA certificate where offered and enable SSL enforcement if available without payment. The app always verifies remote certificates **and hostnames**. Use the trusted CA as `DATABASE_SSL_CA` only if needed; this is a public trust certificate, never a private key. Do not set `DB_SSL=disable`, `rejectUnauthorized:false`, or a no-verify URL option. Test the actual selected endpoint; local TLS tests do not establish hosted TLS success. [Supabase SSL](https://supabase.com/docs/guides/platform/ssl-enforcement).
6. Review installed extensions and their schemas before SQL. The migrations expect `postgis`, `pg_trgm`, `unaccent` and `fuzzystrmatch` in `extensions`. If an existing extension lives elsewhere or cannot be installed by the owner, stop for review; do not relocate it or weaken the checks. Keep `app_private` and `our_ground_meta` outside the Data API’s exposed schemas.

Privately set `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_URL`, `VITE_SUPABASE_URL`, matching publishable keys, owner `MIGRATION_DATABASE_URL` and the trusted CA in the selected owner file. The target guard requires the URL and direct/pooler username to match the exact staging reference. Percent-encode password characters within stored URLs without exposing the result.

### Review/apply the schema, then create the restricted runtime credential

These commands are **future owner-run steps only after approval of this exact staging reference and migrations 001–013**. Run from the isolated reviewed source with Node 24.22.1. Replace private file paths; do not put credentials into the command text.

```sh
node --version
node --env-file=/private/path/staging-owner.env backend/manage-db.mjs migrate --apply
```

Do not add `--include-demo`, copy local Auth/private account fixtures, edit applied migration files or reset a database. The runner checks journal SHA-256 values, applies the chain in one transaction and inspects privileges before commit. Migration 003 creates `our_ground_api` without a password; later migrations remove broad private-table grants. Judge the complete final schema, not intermediate migration 003 alone.

Set that role’s separate strong password privately. One option is interactive `psql` to the copied owner/session endpoint using `sslmode=verify-full`, the downloaded CA and `-W`; run `\password our_ground_api` so the new password is entered at hidden prompts rather than embedded in SQL history. Never grant this role ownership, admin membership, superuser, CREATEDB, CREATEROLE or BYPASSRLS. [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles).

Construct `DATABASE_URL` with that role and its password, keeping `MIGRATION_DATABASE_URL` separate and owner-only. Use the session-pooler username suffix when applicable. Then:

```sh
node --env-file=/private/path/staging-owner.env backend/manage-db.mjs verify
```

Expected: all final schema/RLS/function ACL checks pass; an actual second connection reports runtime user `our_ground_api` and can read only the narrow public projection. Also prove raw private-table reads, owner functions, missing/forged actor/session context and cross-tenant writes fail under the actual runtime role. The command does not test real Google login or all hosted tenant workflows. If owner credentials are required to make runtime work, stop; never substitute them into `DATABASE_URL`.

### Import only reviewed public source data — separate exact approval

Use reviewed official downloads and hashes from [HRSA evidence](phase-7d-data-sources.md) and [Census evidence](phase-7d1-geographic-reference.md). First run the source-only dry-runs; these perform no database connection:

```sh
NODE_OPTIONS=--max-old-space-size=192 node --experimental-strip-types scripts/import-hrsa.mjs \
  --file /private/path/reviewed-hrsa-sites.csv
NODE_OPTIONS=--max-old-space-size=192 node --experimental-strip-types scripts/import-gazetteer.mjs \
  --places /private/path/2026_Gaz_place_national.zip \
  --states /private/path/2026_Gaz_state_national.zip
```

Review dates, checksum, accepted/excluded counts, all states/territory coverage and confidentiality exclusions. Prefer the already reviewed files; `--download` makes one bounded HRSA request or two bounded Census requests, without retries. Do not fetch per-result websites or ingest unlicensed food feeds.

After separate approval of the exact project, source files and reconciliation scope, privately set `HRSA_IMPORT_DATABASE_URL` and `GEOGRAPHIC_IMPORT_DATABASE_URL` to its owner connection. Run the corresponding commands with the same file arguments plus `--development-target --apply`; add `--full-snapshot` to HRSA only for the reviewed complete national snapshot. Never use local-target bypass flags remotely. The existing guard validates the project reference and verified TLS; each import is transactional/idempotent. Do not run imports inside a Vercel runtime or create a refresh scheduler.

Expected **only for the retained reviewed snapshots**: 17,418 HRSA sites/1,584 organizations, 17 durable confidentiality holds, one HRSA run/17,418 versions; 32,415 Census records and two Census import runs. A genuinely newer source can have different legitimate counts and needs review. Verify imported listings remain unverified, fictional rows absent, suppressed sites excluded from detail/search/map, source bindings retained and repeat import does not duplicate records. Enable `GEOGRAPHIC_REFERENCE_ENABLED=true` only after the real reference migration/import and restricted lookup pass.

## 4. Configure a separate Google Web client through Supabase PKCE

Do this only after the exact staging Supabase project, Google project/client and HTTPS app origin are reviewed and configuration is approved.

1. In Google Cloud Console, choose the separate staging project. Open **Google Auth Platform → Branding/Audience/Data Access**. Use an honest staging name, owner-maintained contact and testing audience; add only the owner’s selected test users. Request only `openid`, email and profile. Do not enable Maps/Places billing, request offline Google API access or add unrelated scopes.
2. In **Clients**, create an OAuth client of type **Web application**. Set Authorized JavaScript origin to the exact approved staging HTTPS origin. Set Authorized redirect URI to the callback copied from the **staging Supabase Google provider page**, normally `https://<staging-ref>.supabase.co/auth/v1/callback`.
3. In **staging Supabase → Authentication → Sign In / Providers → Google**, enter that client ID/secret privately and enable the provider. The secret stays there, not in this app, a `VITE_` value or a Vercel variable. [Official Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
4. In **Authentication → URL Configuration**, set Site URL to the approved staging origin and Redirect URLs to its exact `/auth/callback`. Do not use `*.vercel.app`, production origins or arbitrary `next` URLs. Match `ACCOUNT_ALLOWED_ORIGINS` and `VITE_ACCOUNT_ALLOWED_ORIGINS` to that single exact origin. Local callbacks, if separately approved, are separate explicit entries; never assume the remote staging allowlist covers localhost.
5. Only under approved private verification scope, set `VITE_GOOGLE_AUTH_ENABLED=true` and rebuild for that exact configuration. Keep `ACCOUNT_EMAIL_AUTH_ENABLED=false` until sender/templates/real OTP delivery are separately configured and verified.

The existing SDK uses PKCE with an S256 challenge. The app callback is **`/auth/callback`**, while Google returns first to **Supabase `/auth/v1/callback`**; they are different steps. Test in the same initiating browser/tab, complete within five minutes, verify the code is exchanged once and scrubbed to `/account`, and verify cancel/replay/wrong-origin behavior. Never share callback URLs containing codes. Google sign-in establishes identity only; organization access still requires the separate reviewed claim/membership workflow. [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

Before opening onboarding, verify two independently authenticated users, outsider denial, tenant A/B isolation, administrator review, revocation with an already issued token, logout and Back/refresh cache behavior on the real isolated services. These hosted checks are currently **BLOCKED**, not satisfied by local SDK fixtures.

## 5. Create dedicated free Redis and review the aggregate provider budget

After dedicated-resource approval, open Upstash Console → Redis → Create Database. Select the available **Free** plan, a clear staging name and suitable region. Inspect the final $0 plan before creation. If an existing production database occupies the normal free slot, **stop** and report that limitation; do not delete/switch it or add billing. Avoid Marketplace auto-provisioning into a paid account. [Console setup](https://upstash.com/docs/redis/overall/getstarted).

In the new database’s Connect/REST section, copy its `UPSTASH_REDIS_REST_URL` and write-capable `UPSTASH_REDIS_REST_TOKEN` privately. The limiter requires atomic EVAL writes; a read-only token cannot provide admission. Record only hostname/database ID in the nonsecret manifest. Endpoint and token must differ from production; a prefix or label on production Redis is insufficient because current runtime keys are fixed. [REST credentials](https://upstash.com/docs/redis/features/restapi).

Keep Geoapify live flags false initially. Separate keys/projects do **not** necessarily provide separate account free credits. Before live staging, owner must review aggregate production-plus-staging server admission **and browser map credits**, preserving production’s 200/day cap and the account’s existing free allowance. Dedicated Redis has a separate counter, so it cannot by itself coordinate that shared ceiling. An approved lower staging budget and a proven aggregate admission/credit plan are required; never create accounts to evade quotas. Retain zero automatic retries and the existing warning threshold, and monitor account usage. [Existing provider setup](phase-7d-provider-setup.md).

Retain the anonymous/API and organization abuse safeguards. After exact verification approval, prove the dedicated Redis atomic limit across two instances, reject with 429 and `Retry-After`, preserve counters on rejected admission and fail closed during Redis outage. Use a bounded synthetic namespace only; never reset production keys, raise budgets or run provider stress tests. Record actual command/provider counts separately.

## 6. Configure the separate Vercel Preview target — future approval only

In the exact `ourground-staging` project, open **Settings → Build and Deployment → Node.js Version** and select **24.x** after configuration approval. Keep `package.json`’s `24.x` requirement; Vercel manages minor/patch versions, so hosted exact 24.22.1 is not promised. Use Vite, `npm run build`, output `dist`, no Git connection and protected owner access. [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Under **Settings → Environment Variables**, add only reviewed staging values to **Preview**, not All Environments and not the protected production project. Use Secret/sensitive storage for runtime database URL, Redis token and server-provider key. Add matching public build values deliberately. Never upload owner/import URLs, integration access tokens, Google client secret, fixture flags or demo editor assignment. Keep provider live/auth feature flags false until their specific checks are approved. `VITE_*` changes require a new matching build. [Environment scopes](https://vercel.com/docs/environment-variables).

If linking is approved, link **only the isolated source copy** to the exact project/team and inspect its `.vercel/project.json` IDs before any env command. Do not run `vercel env pull` into the canonical checkout or overwrite populated private files; Preview/Production secrets may not be returned by env pull. This guide intentionally provides no deploy/promotion command. Review the exact Preview deployment/alias plan separately; the reserved project domain alone does not supply a working OAuth origin.

Prepare a new CSP candidate locally from the reviewed manifest; the renderer refuses to overwrite canonical `vercel.json` or an existing output. Keep the candidate outside `dist`:

```sh
node --env-file=/private/path/staging-owner.env scripts/render-staging-csp.mjs \
  --target /private/path/reviewed-staging-target.json \
  --output /private/path/new-staging-vercel.json
```

Use that candidate as `vercel.json` **only in the separately approved staging copy**, preserving the canonical template. Build that copy with its public build file and Node 24.22.1:

```sh
NODE_OPTIONS=--max-old-space-size=192 GOMEMLIMIT=64MiB GOMAXPROCS=1 GOGC=20 \
  node --env-file=/private/path/staging-build.env --run build
npm run check:secrets:build
```

Then run the zero-network preflight from the protected canonical source, with the dedicated owner/preflight env file and explicit staging paths. This preserves its `.env.local` as the protected comparison baseline:

```sh
node --env-file=/private/path/staging-owner.env scripts/staging-readiness.mjs \
  --target /private/path/reviewed-staging-target.json \
  --project-link /private/path/staging-copy/.vercel/project.json \
  --vercel-config /private/path/new-staging-vercel.json \
  --build-dir /private/path/staging-copy/dist
```

The preflight’s env must contain the **same complete `VITE_` configuration** as the actual build. Vite stamps public configuration/asset fingerprints; stale, altered, differently configured or fixture artifacts fail. Owner DB credentials are used only for local comparisons, not placed in the browser build or Vercel runtime. A local PASS still reports `hosted_isolation: BLOCKED` and `deployment_authorized_by_check: false`; it neither contacts providers nor proves ownership, real TLS/ACLs, hosted login or permission to deploy.

## 7. Owner handoff before any deployment or pilot

Return only nonsecret project IDs/origin, chosen free plans, source/checksum evidence, completed checks and explicit blockers. Keep actual credentials private. Obtain separate approval for the exact staging deployment only after the source, generated config and matching build are reviewable. No main production promotion follows.

After any future approved staging deployment, verify deployed HTTPS/private no-store/CSP/referrer/CORS headers, both map workflows, nationwide search, giving, actual Auth/tenant/revocation workflows and dedicated Redis failures/limits. Confirm ordinary residents still search without accounts. Preserve real provider budgets and record every outbound verification request.

The owner is interim privacy/deletion/incident operator, but there is still no operational public privacy channel. Pilot onboarding remains closed until that channel, incident/recovery handling and hosted isolation/Auth checks work. Retention is **manual dry-run/log verification only**: use the owner CLI on reviewed schema013, no `--apply`, destructive jobs or scheduler. See [owner actions](phase-7e-owner-actions.md), [security verification](phase-7e-security-verification.md) and [staging readiness](phase-7e-staging-readiness.md).
