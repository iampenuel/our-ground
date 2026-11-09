# Vercel readiness — Phase 6A

28 October 2026. **Deployment is not authorized and was not performed.** No push, project linking, cloud creation, billing changes, production secrets, migrations or production writes occurred.

## Decision and status

The repository already has the appropriate minimal architecture for a **single Vercel project containing Vite static output and a Node API function**. There is no demonstrated need for a separate API host or a framework migration. Uploading `dist/` alone would omit the API; a future deployment must build from the repository root with `api/` included.

- **IMPLEMENTED:** `package.json` now selects Node `24.x`; `.nvmrc` and runtime guards align local commands. Existing `vercel.json` and `api/index.ts` were preserved.
- **TESTED:** build/type checks, existing function exports under Node 24 with fictional dependencies, and all required SPA routes in local Vite preview.
- **PROPOSED:** use the existing configuration for an explicitly approved Vercel preview, then perform hosted routing/auth/database checks before presenting it as live.
- **BLOCKED:** no deployed function or Vercel routing execution has been tested. Owner must select hosted data mode and approve deployment/configuration. Real-data credentials and end-to-end Supabase verification are absent locally.

The local [reliability report](../audits/phase-6a-reliability.md) contains exact commands, current PIDs, tests and active URLs. Local HTTP 200 is not proof of Vercel runtime behavior.

## Frontend settings and routing

| Setting | Value / evidence |
|---|---|
| Root | Repository root containing `package.json`, `api/`, `backend/`, `vercel.json` |
| Framework preset | Vite, already `framework: "vite"` |
| Build | `npm run build` |
| Output | `dist` |
| Node | `24.x` in package engines; local validation used 24.19.0. Vercel chooses the supported patch. |
| Install | Existing npm lockfile; no dependency additions required. For a later clean build use the locked dependency installation. No install was performed here. |
| Git deployment | Existing `git.deploymentEnabled: false` retained; no automatic Git deployment enabled. |

The current ordered rewrites are:

```json
[
  { "source": "/api/v1/:path*", "destination": "/api/index?path=:path*" },
  { "source": "/(.*)", "destination": "/index.html" }
]
```

Keep the API rule before the SPA fallback. `backend/app.ts` accepts the rewritten `path` parameter and the original local `/api/v1/...` pathname. Local adapter tests preserve other query parameters while exercising the rewritten resource path. Unknown API paths return a JSON 404 from that handler, not the application shell. These tests exercise the handler after a rewrite; they do **not** execute Vercel's routing engine. Requests outside the documented `/api/v1/*` namespace are not a new supported API surface.

The SPA rule supports direct navigation to `/support`, `/give`, `/about`, `/organizations`, `/account` and `/resources/:id`. These routes rendered locally after the current build. Existing `/staff/services/:id` remains subject to application/auth guards. `/demo` remains a separate illustrative route. The Vite SPA fallback pattern is documented by [Vercel's Vite guide](https://vercel.com/docs/frameworks/frontend/vite); ordered route mapping should be verified on the eventual host against [rewrite behavior](https://vercel.com/docs/routing/rewrites).

`public/images/our-ground/*` and `public/assets/*` are copied into `dist` with root-relative URLs. Generated `/assets/*` JS/CSS names are content-hashed. No approved image was replaced or resized. Hosted smoke tests must check actual image/JS/CSS MIME types and content, not just a 200 status that could conceal an HTML fallback. Missing-image behavior and deep-link refreshes must be checked after upload. No custom CDN/cache/header policy was added.

Vercel supports Node 24; `engines.node` controls the major used by the project. [Node version documentation](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Backend adapter and lifecycle

Existing `api/index.ts` creates dependencies once at module scope and exports `GET`, `POST` and `PATCH`, each passing the Web `Request` to `handleApi` and returning its `Response`. Vercel documents TypeScript functions in root `api/` and named HTTP-method exports using these Web APIs. No adapter replacement is needed based on that contract. [Node function runtime](https://vercel.com/docs/functions/runtimes/node-js), [Functions overview](https://vercel.com/docs/functions).

`backend/dev.ts` owns `createServer(...).listen(...)` only for local development. The deployed entry does not open a listening port or require a permanent HTTP daemon. `API_PORT` and Vite's local proxy are not production backend hosting mechanisms. The backend TypeScript check includes both `backend/**/*.ts` and `api/**/*.ts`; the Vite build only bundles the frontend. Vercel must separately discover and compile the function.

**TESTED:** the actual existing exports returned a rewritten demo search, safe fictional detail, JSON 404 for an unknown endpoint, and 401 for an anonymous PATCH. The test process explicitly set demo mode before importing the adapter. No network/database authentication was simulated as verified. It performed no live writes. Test source: `tests/vercel-adapter.test.mjs`.

Existing safeguards remain: bounded body size and field validation, Pennsylvania coordinate/category/radius constraints, parameterized queries, session verification, assigned membership checks, optimistic version conflicts and `Cache-Control: no-store` on API JSON. Authenticated staff data must not be placed in a shared response cache.

### Database behavior

`backend/postgres.ts` lazily reuses a module-level Postgres.js client with `max: 1`, `prepare: false`, SSL required by default, 10-second connection timeout and 20-second idle timeout. Queries are serialized for the documented Supavisor transaction-pooler compatibility; search count and result queries are sequential. Keep the restricted runtime `our_ground_api` role, not a migration owner or service-role credential.

This is **one connection per warm function instance**, not one for the whole deployment. Instance scaling and queued concurrent requests can increase pressure and latency. Before real-data launch, verify the actual transaction-pooler URL, role privileges, network connectivity, region proximity and permitted connection budget. Observe queue/query latency under a small authorized read-only load. No pool settings were changed without that evidence.

There is no explicit application-level SQL statement timeout in this client configuration. Existing geocoding and auth fetches have 10-second deadlines; the function also has a platform duration limit. Choose/verify the project's runtime and duration settings before deployment; a platform timeout can terminate a slow request. A later measured need for query deadlines or concurrency changes should be addressed explicitly, not by arbitrarily extending function duration here. [Function duration documentation](https://vercel.com/docs/functions/configuring-functions/duration).

The demo repository is in-memory. On Vercel, state would differ across instances and disappear with recycling; correction reports/staff changes in that mode are **not durable**. A public fictional demonstration must state that limitation and must not be presented as real service coordination. Production-like persistence requires the existing PostgreSQL path and authorized validation.

## Exact environment checklist

Presence-only local inspection found the seven browser/provider/database configuration values below missing in both development and production modes. No remote environment was inspected or configured. Vercel separates Development, Preview and Production environment scopes; future values must be assigned deliberately to the approved scope. Browser values are baked into the Vite build and require rebuilding to change. [Environment variable documentation](https://vercel.com/docs/environment-variables).

| Existing exact name | Boundary | Requirement / current state |
|---|---|---|
| `VITE_SUPABASE_URL` | Public browser build value | Missing; required for login. Must match server project. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser build value | Missing; publishable key only, never service-role/secret key. |
| `VITE_MAPBOX_PUBLIC_TOKEN` | Public browser build value | Missing; optional `pk...` token for current map renderer. List/fallback works without it. |
| `DATABASE_URL` | Private server secret | Missing; restricted runtime connection required for PostgreSQL mode. |
| `SUPABASE_URL` | Server configuration | Missing; same project as browser, required for token verification. |
| `SUPABASE_PUBLISHABLE_KEY` | Server configuration; publishable credential | Missing; used server-side for `auth.getUser`, must match browser configuration. Not a service-role secret. |
| `MAPBOX_ACCESS_TOKEN` | Server-only credential | Missing; current real city/ZIP geocoding. Do not prefix `VITE_`. |
| `BACKEND_DATA_MODE` | Server configuration | Default `postgres`; explicit `demo` only for an approved fictional environment. Local launcher sets `demo`. |
| `ALLOW_DEMO_DATA` | Server configuration | Default false; local demo launcher sets `true`. Set false for a real-only directory. |
| `DB_SSL` | Server configuration | Omit to retain required SSL. Existing `disable` option is for appropriate local DB setups, not the hosted database. |
| `DEMO_EDITOR_USER_ID` | Server demo configuration | Optional; still requires a genuinely validated Supabase session. Do not invent identity to bypass auth. |
| `API_PORT` | Local only | New workflow fixes 18787. Not needed for Vercel functions. |

These existing names are **local administration/test inputs**, not required Vercel runtime secrets: `MIGRATION_DATABASE_URL`, `SUPABASE_DEV_PROJECT_REF`, `INTEGRATION_STAFF_ACCESS_TOKEN`, `INTEGRATION_OUTSIDER_ACCESS_TOKEN`. Keep migration-owner connections and fresh test bearer tokens out of the public build and routine deployment runtime.

`.gitignore` excludes `.env*` except `.env.example`; `.vercelignore` excludes `.env*`, `output/`, local `dist/`, dependencies and logs. The checked Git file list contained only the example environment file, not real environment files. Ignoring files does not protect already tracked files; inspect staged/uploaded files before the eventual deployment. Existing boundary checks reject known secret names/formats under `VITE_` and mismatched configured Supabase pairs. They are not a universal secret detector. In particular, future Google/Gemini private names need explicit boundary regression coverage before those integrations are implemented. No credentials were printed or added in this phase.

## Authentication and organization permissions

Existing frontend Supabase auth uses Google PKCE and redirects to `window.location.origin + '/account'`. For local use the exact application callback is `http://127.0.0.1:18417/account`; the built preview uses `http://127.0.0.1:18418/account`. A future Vercel callback must use the actual approved HTTPS origin plus `/account`, not an invented deployment URL.

The Google OAuth provider callback is a **different URL**: the selected Supabase project's `/auth/v1/callback`, copied from its provider settings. Google client ID/secret belong in those Supabase settings, not in this frontend. Supabase Site URL/redirect allowlist must cover only the intended local and hosted application origins. Avoid broad arbitrary preview-domain allowlists. The app and API public Supabase configuration must identify the same project.

Google sign-in alone grants no organization-edit rights. Backend session verification determines the user; database app roles/memberships determine access. Assigned staff, outsider, anonymous and stale-version cases remain covered by unit tests. A real hosted sign-in/refresh/callback and assigned-versus-unassigned user walkthrough is **BLOCKED** until approved configuration and test accounts exist. Do not call those integrations working based on the fictional search demo.

## Approval and hosted acceptance gates — PROPOSED

1. Owner approves deployment destination and selects either a clearly labeled fictional read-only demonstration or the configured real directory. Confirm that non-durable demo reports/edits are not represented as live persistence.
2. Owner provides/configures the existing scoped runtime values, approved OAuth origins and any required provider restrictions. No Google Maps migration or Gemini key is needed to deploy the current list-capable product.
3. Build the repository with Node 24 and its existing lockfile; keep API function discovery and API-first rewrites. Do not deploy `dist/` in isolation.
4. On the approved hosted preview, verify root and direct refresh of every named route; actual JS/CSS/WebP responses; `/api/v1/health` JSON; expected search and resource JSON; unknown `/api/v1/...` JSON 404; anonymous staff requests rejected. Test failure responses with no fictional fallback in PostgreSQL mode.
5. For real configuration, run read-only database/search checks and real OAuth/member-access checks with authorized test identities. Mutating live reports or staff records requires a separately approved test target; unit tests do not justify production writes.
6. Check provider failure/timeout, no-results, map-unavailable and account-unavailable behavior, mobile navigation, fictional labels and safe contact/directions. Confirm no browser database credentials/private keys and no public API error payload leakage.
7. Record actual hosted URL, runtime/function logs, data mode and owner acceptance. Only then call the deployment verified. Keep the verified local presentation preview available as a fallback.

Today: 27 tests and the local production build pass; public deployment and live service integration remain **BLOCKED**, not silently assumed complete.
