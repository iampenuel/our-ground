# EDEN-06 infrastructure readiness

Audit: **2026-11-07**, with initial local inventory timestamp **15:12:12 UTC**. **Protected real-data staging prerequisites do not pass; no deployment was attempted. Production remains NO-GO for this change.** The initial infrastructure inventory used read-only Vercel metadata, configuration-presence checks, process/socket inventory and source inspection. A subsequent, separately owner-approved Geoapify dashboard correction saved exactly two local 5199 access rules and was checked with controlled fixed-style requests, as recorded below. Vercel settings/linkage, databases, imports, resolver counters, billing and hosted AI enablement were not changed by this infrastructure work.

## Exact Vercel targets and ownership evidence

The authenticated connector can read both projects in **Penuel’s projects**, slug `penuels-projects-aa802b06`, team ID `team_7zBDrVIlwYth2sXkAbBPcbYw`. Both project `accountId` fields match that team. This verifies authenticated read access and the intended team/project identity; it does not establish every administrative permission or verify a deployed authentication boundary.

| Metadata | Existing production | Existing staging |
| --- | --- | --- |
| Name | `ourground` | `ourground-staging` |
| Project ID | `prj_4li6QnqulPgPbJpxMW2L9hczDNrS` | `prj_eU9xRSetSQYTbkAce2cYIR5zx8c2` |
| Framework | Vite | Vite |
| Node project setting |24.x |26.x; repository `engines.node` is 24.x |
| Deployment history | Latest returned production deployment READY, November 5; five recent records inspected, with older records remaining |**No deployments**, no further deployment page |
| Standard project domain | `ourground.vercel.app`, verified | `ourground-staging.vercel.app`, verified |
| Other domains in complete list |None returned |None returned |
| SSO protection metadata | `all_except_custom_domains` | `all_except_custom_domains` |
| Password / trusted-IP protection |Disabled / disabled |Disabled / disabled |

The explicit **list-project-domains** response returns the standard domains above, although the compact **get-project** response contains `domains:[]`. The explicit list is the current domain evidence; these names do not prove that staging serves a deployment. SSO metadata is not a browser verification of an actual staged response because no staging deployment exists.

The Node setting difference is **not by itself a confirmed incompatibility**: current Vercel documentation says `package.json` engines overrides the project setting, so this candidate’s `24.x` should select Node 24. Verify the actual build and function versions rather than changing cloud settings unnecessarily. [Official Node version precedence](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), retrieved 2026-11-07.

The latest production record is `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`, URL `ourground-cfiaqimgw-penuels-projects-aa802b06.vercel.app`, target production, READY. No source Git SHA was present in the returned recent deployment summaries. Local HEAD is `3897dea703a7175e8ec57e1d7ba0f358dafc0221`, with substantial preserved uncommitted work; the old READY record cannot be claimed to contain this working tree or its current API/data behavior.

The existing `.vercel/project.json` still points to **ourground production** and the team above. It was **not relinked**. Any later authorized staging operation must select the exact staging project through an explicit isolated destination; a default CLI command in this checkout must not be assumed to target staging. Current `vercel.json` still has `git.deploymentEnabled:false`.

## Environment metadata — names and targets only

Both project environment reads explicitly used **`decrypt:false`**. Values were neither requested nor printed. Returned `hiddenProductionEnvCount` was 0 for both projects.

| Project | Returned names | Targets |
| --- | --- | --- |
| `ourground` | `VITE_GEOAPIFY_BROWSER_KEY`, `GEOAPIFY_ENABLED`, `GEOAPIFY_LIVE_APPROVED`, `GEOAPIFY_SERVER_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |Production only for all six |
| `ourground-staging` |**None** |No Development, Preview, Production or branch-specific entries returned |

No database, Supabase or Gemini names were returned for either project. This is metadata absence in the returned project scope, not an independent audit of an external database or secret store. The production variables’ actual enablement values, validity, privileges, remaining quota and runtime connectivity were not verified. They must not be copied blindly into staging or inferred to be safe merely from their names.

Current local file-presence inspection:

| Local configuration | Safe result |
| --- | --- |
| `.env.local` |Present. Separate Geoapify browser/server key names and Upstash URL/token names have values. Values were not printed. |
| `DATABASE_URL`, `MIGRATION_DATABASE_URL` |Absent from `.env.local`. |
| Server/browser Supabase URL and publishable-key names |Absent from `.env.local`. |
| `.env.production.local`, `.env.preview.local` |Absent. |
| `.env.eden-review.local` |Absent at this audit. This does not disclose or infer the environment snapshot of an already running process. |

No replacement credential was sought in unrelated files or another service. Browser-prefixed values are public build inputs; the restricted browser map key is intentionally public. Database/owner/Redis/Gemini values must remain server-only. Current Vercel Config/Secret guidance distinguishes readable Config values from write-only Secrets; environment values were not changed here. [Official Config/Secret reference](https://vercel.com/docs/environment-variables/sensitive-environment-variables), reviewed 2026-11-07.

## Database, PostGIS and actual records

The local TCP listener inventory showed the application on loopback ports 5199, 18418 and 8789, but no observable PostgreSQL listener, including the previously documented 18790 target. There were no PostgreSQL Unix sockets under `/private/tmp`, and a targeted PostgreSQL Unix-descriptor inventory returned none. The broader process-list command was unavailable in this environment; no inference relies on that failed check.

PostgreSQL 18 tools and an existing cluster directory **are installed** at `/opt/homebrew/var/postgresql@18`: `PG_VERSION` exists, `postmaster.pid` does not, and the read-only `pg_ctl status` command reported **no server running**. `pg_controldata` reported a shut-down cluster and a November 5 checkpoint. Its parsed configuration uses port 5432 and localhost; historical resource evidence instead refers to database `ourground_discovery_final`, cloned from `ourground_final`, on port 18790 with runtime role `our_ground_api`. The evidence does **not** establish that the historical target lives in this installed cluster. The cluster's databases, records, owner and intended role were not inspected. The historically documented `/private/tmp/our-ground-final-db`, `/private/tmp/our-ground-7d-db` and `/private/tmp/our-ground-food-expansion` directories are absent.

The owner directed the team to **continue and document the missing nonproduction `DATABASE_URL` blocker**. The installed cluster remains stopped; the proposed startup investigation was canceled. No database provisioning, startup, migration or import is authorized by this finding.

These are observed local inventories, not proof that no database exists elsewhere. With no configured runtime connection, **no real SQL connection, PostGIS version, migration journal, role/grant state, live source count or actual imported resource was verified**. No database was started or created.

Implemented intended path:

`/api/v1/resources` / `/resources/search` → `PostgresRepository` → `app_private.public_resource_search` and public publication/provenance projections.

- Runtime configuration requires `our_ground_api` (or the permitted pooler-qualified name), rejects reuse of the migration connection, checks `current_user`, and uses bound query parameters. Remote TLS checks certificate trust and hostname; plaintext is limited to explicit nonproduction loopback use.
- PostGIS point/distance filtering, publication/privacy suppression and source-qualified identities are implemented in the SQL chain. Migrations 001–016 use a checksum journal; owner apply requires explicit target and apply gates. Those files’ presence does not establish that they exist in the intended staging database.
- Production runtime rejects demo/fixture configuration. Explicit local demo mode requires `ALLOW_DEMO_DATA=true`. The current EDEN agent is still deliberately injected only with the approved **DemoRepository**; it is not a real-data provider adapter simply because the manual site has a PostgreSQL implementation.
- The earlier EDEN-05 personal API check returned 0 real records and 1 explicitly fictional Harrisburg record for its scoped search. It verified fixture isolation, not a connected real database and not absence of local assistance. That prior evidence is not relabeled as a fresh EDEN-06 resource search.

The required distinction remains:

| Record class | What it establishes |
| --- | --- |
| `fictional_demo` |An invented test record, clearly labeled; no real contacts, visitable address or directions. |
| `imported_unverified` / `sourced_unverified` |A source-backed listing with source attribution/dates, not independent current operational verification. |
| Verified currently operating service |Requires applicable fresh operational evidence; source import, coordinates or a public listing alone do not establish it. No such new verification was performed. |

## Imported sources and permission boundaries

Existing historical evidence reports **17,418 HRSA healthcare sites** and **593 regional public food programs**: Philadelphia 324, Seattle/King County 209 and Prince George’s County 60. These are prior local-import results, not current staging row counts or complete nationwide assistance coverage. Historical JSON evidence remains in `output/phase-7d/real-directory-harrisburg.json`, `docs/implementation/phase-7d-hrsa-coverage.json` and `docs/implementation/final-discovery-food-verification.json`. Their structure was inspected without printing record contents; they are evidence artifacts, not a verified restorable database. A bounded repository filename inventory, excluding dependencies, Git and environment files, found no `.dump`, `.backup`, `.sql.gz`, `.csv`, `.xlsx`, `.tar` or `.tgz` artifact. That inventory does not establish that an external backup is unavailable. No new bulk download or import was performed for EDEN-06.

| Intended source | Existing provenance and limitations |
| --- | --- |
| [HRSA Health Center Program Service Delivery and Look-Alike Sites](https://data.hrsa.gov/data/download) |Stable source identity, source/import dates and `imported_unverified`; confidential/suppressed addresses excluded and never reconstructed. The catalog’s source/usage information was reviewedNovember 7, not independently verified service availability. |
| [Philadelphia Free Food and Meal Sites](https://opendataphilly.org/datasets/free-food-and-meal-sites/) |City license/attribution; source-supported active status, hours and eligibility only. |
| [Seattle/King County Emergency Food and Meals](https://data.seattle.gov/Community/Emergency-Food-and-Meals-Seattle-and-King-County/kkzf-ntnu) |Public-domain source metadata; actual supplied schedule text retained rather than invented weekday hours. |
| [Prince George’s County Food Assistance Directory](https://data.princegeorgescountymd.gov/Community/Prince-George-s-County-Food-Assistance-Directory/d7ae-zbbv) |Custom OpenPGC terms, local required notice and original-row lineage; not CC 0. Source permission/withdrawal duties remain distinct from provider operating status. |
| Optional Geoapify/OpenStreetMap supplements |Mapped-source evidence with attribution, separate `geoapify_discovered` label; not curated-service, eligibility or open-now verification. No current provider request was made. |

See [current map/resource audit](map-and-resource-readiness.md), [HRSA import evidence](../implementation/phase-7d-data-sources.md) and [regional food evidence](../implementation/final-discovery-food-expansion.md). Permission-dependent 211/FoodFinder/Feeding America/Findhelp feeds remain blocked without appropriate access/reuse evidence; no protected locator was scraped. Source attribution and correction workflows must survive any real-data adapter. Missing hours, timezone, availability, eligibility and contacts remain missing.

SQL source/import/privacy tables have implemented private access boundaries and sticky withdrawal controls. The runtime uses public-safe projections; owner import/release operations are separate. **Their actual staging grants/RLS/hold behavior remain unverified without the intended database.** This report makes no legal-compliance or universal data-license certification.

## Map and resolver state

The initial read-only inventory had no connector capable of reading Geoapify's private key restriction settings. The owner subsequently explicitly approved signed-in dashboard inspection, then approved the exact local-rule correction. The **OurGround Dev Browser** key's masked suffix was confirmed to match the configured browser key; only the match result was recorded, not the key or suffix.

The dashboard's existing Allowed Origins entries covered ports 18434 and 18418. Existing referrer entries covered 18417/18418 variants, `ourground.vercel.app` and 18434. **Neither 5199 rule existed**, explaining the earlier local authorization failure. The approved change added and saved only:

| Rule | Added value |
| --- | --- |
| Allowed Origin | `^http://127\.0\.0\.1:5199$` |
| Allowed Referer | `^http://127\.0\.0\.1:5199/` |

All old entries were preserved. The existing CORS `*` setting was unchanged; it is not treated as key access control. No staging or production policy rule was added or changed, and no key was replaced or exposed.

Controlled requests after the save used the **same configured browser key and fixed map style**, with the corresponding Origin and Referer together:

| Request source | Observed result |
| --- | --- |
| `http://127.0.0.1:5199` |**200**, valid version 8 style JSON |
| `http://127.0.0.1:18418` |**200**, valid version 8 style JSON |
| `https://ourground-staging.vercel.app` |**401** |
| `https://ourground.vercel.app` |**401** |

These are bounded style-authorization results, not proof that every tile renders or that resource coordinates are correct. Full native-browser map rendering on 5199 remains pending. The denied hosted origins are not an invitation to broaden restrictions; any later hosted-map configuration needs its own exact target and approval.

The prior Call 1 browser evidence at 18418 showed a canvas, attribution and a **fictional** marker, without a complete full-tile screenshot or real-source coordinate verification. Preserve the accessible list/details fallback. Existing source-qualified marker selection tests do not replace a real dataset/map check.

The existing shared resolver 100/day cap is preserved and still blocks the fresh resource/marker flow. EDEN-05 observed `/places/resolve` returning 429 `RATE_LIMITED`; this infrastructure audit did not reissue a resolver search, poll Redis, reset/increase counters or bypass the standard path. The style checks above do not establish a successful resolver/resource query. Resolver denial must not be called Gemini quota exhaustion, a successful zero-results search, or proof that no assistance exists. The real-database blocker also remains unresolved.

## Staging prerequisites and decision

| Prerequisite | Current finding |
| --- | --- |
| Correct existing staging project/team |**PASS, metadata only**; exact IDs above. Existing production checkout link preserved. |
| Deployment protection |**Present in metadata** through SSO; no deployed staged response exists to verify. No custom production domain was assigned. |
| Runtime matches the candidate |**UNVERIFIED**: staging project setting 26.x, but repository `engines.node=24.x` should override it. Verify the actual build/function versions; no cloud change is automatically required. |
| Real resource database/PostGIS/migrations/TLS |**BLOCKED**: no configured local or staging connection; no live read-only resource evidence. |
| Staging environment and shared admission |**BLOCKED**: no staging variables, including required production-mode Redis protection or browser/server map configuration. No secret values verified. |
| Account/Auth capability |**UNCONFIGURED**: Supabase names absent. Account workflows cannot be claimed working; a deliberately scoped public read-only stage could keep them explicitly unavailable. |
| Current source/build/API artifact |**UNVERIFIED**: staging has no deployment; old production READY metadata is not this changed working tree. Root’s final candidate build/security evidence is separate. |
| Exact staged map origin and actual coordinates |**BLOCKED / UNVERIFIED**: controlled staging and production style probes returned 401. Local 5199/18418 style authorization is verified, but full 5199 browser rendering and real-source coordinates remain unverified. No wildcard staging origin is justified. |
| Hosted EDEN / Live |**DENIED BY DESIGN**: public/provider audience/privacy gates and distributed security-state requirements remain unresolved. No local owner bypass may be copied into a hosted environment. |

The user's conditional authorization for **protected staging only** does not make these missing prerequisites pass. Do not deploy an empty/unconfigured resource system and present it as verified real-data staging. No staging URL is reported as deployed.

Shortest next owner/release actions:

1. Identify the existing owned **nonproduction** resource database and provide its restricted `our_ground_api` runtime connection through secure configuration, not chat or a `VITE_` variable. Keep owner/migration credentials out of deployed runtime configuration. Read-only verification must establish PostGIS, migrations, runtime grants/TLS, actual public records and source/withdrawal state before any proposed data change. Do not provision a replacement database or start the installed local cluster without confirming the intended existing target.
2. On the exact staging project and intended deployment target, verify the candidate’s Node 24.x engine and configure reviewed runtime settings: real PostgreSQL mode, demo data disabled, shared Redis URL/token admission and exact-origin browser map configuration. Configure the approved server resolver key/flags if that flow is offered. Database, Redis and the required browser map path are mandatory for the proposed real-data scope. Configure Auth and its redirect/access rules **only if account workflows are offered**; otherwise keep those workflows explicitly unavailable. Review the project Node setting only if needed. Do not copy all production or local review variables, reset budgets, create paid services, or activate hosted Gemini.
3. Freeze/build the actual candidate and verify frontend/API output, production fixture denial, private headers, safe logs, rollback and manual real-record/map flows. Only after the mandatory gates pass should root carry out the separately scoped protected-staging operation, preserving production and its existing link/domain.

Current official Vercel documentation supports WebSocket servers on all plans, subject to function lifetime and external state/reconnect requirements. EDEN already uses browser→Google WSS with HTTPS mint/tools, so a historical platform limitation is not the staging blocker. The blockers here are actual configuration, data connectivity, admission and release eligibility. [Official WebSocket reference](https://vercel.com/docs/functions/websockets), reviewed 2026-11-07; [existing release review](vercel-release-readiness.md).
