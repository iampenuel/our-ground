# EDEN-05: map and resource readiness

Audit date: **2026-11-07**. This records inspected code, bounded read-only requests and existing evidence. No dashboard restrictions, keys, billing, database records, imports or deployments were changed. The key/source diagnostics made no AI requests; the parent’s separately authorized synthetic Call1 browser observation is identified below.

## Decision

- **Map on port 5199: blocked by request-source authorization.** The existing browser key and style work at the already approved `http://127.0.0.1:18418` origin. Keeping the existing restriction and reviewing from that origin is supported; it is not evidence that 5199 or a future hosted origin is allowed.
- **Real resource data: implemented, but not connected or reverified in the current local configuration.** The current personal EDEN API returns explicitly fictional records only. Historical real-import evidence must not be presented as a successful current database connection or complete nationwide coverage.
- **Fresh resource journeys: blocked by the existing shared resolver limit.** At 13:51:10 UTC on November 7, the standard resolver returned 429 `RATE_LIMITED`. The 100/day counter was preserved; this is a failed search admission, not an empty-result or no-assistance claim.
- **Public resource/AI release: NO-GO** until the independent database, source freshness, map-origin, hosted infrastructure and AI audience/provider gates pass. The manual site and resource architecture do not require hosted Gemini activation.

## Map diagnosis and approved-origin review

The actual stack is MapLibre GL6.16.0, a bundled V6 worker, and Geoapify's fixed `osm-bright-smooth` vector style. `shared/map-provider.ts` accepts only a bounded public browser key and constructs a fixed HTTPS host/style; callers cannot supply another style host. `src/maplibre-support-map.ts` does not strip headers or proxy map traffic. Both local Vite origins serve the same configured public browser key; values and credential-bearing URLs were compared only in memory and never printed.

Five bounded style GETs were made with the existing **browser** key, with no tiles/font fetches by this diagnostic. The server key was not used. Results:

| Request source headers | HTTP | Interpretation |
| --- | --- | --- |
| Origin and Referer for `http://127.0.0.1:5199` | 401 | Rejected request source; provider message classified as “not allowed.” |
| Origin and Referer for `http://localhost:5199` | 401 | This alternate local origin is also rejected. |
| Referer for127.0.0.1:5199, no Origin | 401 | Historical referer-only 200 was **not reproduced** in this run. |
| Origin and Referer for `http://127.0.0.1:18418` | 200 | Valid style version 8 with sources; key/style are usable at this origin. |
| Repeat of the first request, safe error classification only | 401 | Confirms request-not-allowed class without recording provider text or key URLs. |

This isolates an Origin/referrer-dependent provider restriction. It rules out an absent key, a universally invalid key and a missing style as explanations for these responses. The private dashboard restriction values were not inspected, so the audit does not claim which individual dashboard rule rejected 5199. `Access-Control-Allow-Origin:*` was present even on 401; that CORS response header does not grant key authorization. Geoapify documents separate **Allowed origins**, **Allowed HTTP referrers** and **CORS Access-Control-Allow-Origin** settings. [Official API-key guide](https://myprojects.geoapify.com/help/api-keys/), retrieved 2026-11-07.

The approved 18418 origin is existing infrastructure, not an invented allowlist entry: `scripts/local.mjs` uses 18418 for the local preview; `.env.example` lists that local account origin; the earlier [provider setup](../implementation/phase-7d-provider-setup.md) and [nationwide verification](../implementation/phase-7d-nationwide-discovery.md) record the same origin passing this key's restriction. A second **loopback-only** review process was started on 18418 while 5199 was preserved. The current 18418 runtime uses `vite.eden-assistant.config.ts` in `eden-review` mode, including its local same-origin microphone permission and direct Google Live WSS policy; its API proxy is 8789. These local review policies do not alter the production microphone/hosted-Gemini denial. Style authorization alone is not a full map-render/marker verification.

If 5199 must remain a map origin, the owner needs to review **Geoapify MyProjects → existing project → API Keys → existing browser key** and add only the required local entries while preserving approved production/preview entries:

- Allowed origins: `http://127.0.0.1:5199`; add `http://localhost:5199` only if that origin is also used. Origin values have no path or trailing slash.
- If an HTTP-referrer restriction is active, allow its corresponding origin-only browser referrer. Suitable anchored expressions are `^http://127\.0\.0\.1:5199/.*$` and, if needed, `^http://localhost:5199/.*$`.
- Retest style, source/TileJSON, tiles, fonts and sprites with the **actual browser** Origin/referrer. Keep attribution visible. Do not replace the public key with the server key, remove restrictions, strip Origin, switch to an opaque fetch or broaden CORS as a substitute for authorization.

No such external setting was changed. Geoapify documents compatible style.json use with MapLibre and the required attribution. [Official Maps API documentation](https://apidocs.geoapify.com/docs/maps/), retrieved 2026-11-07.

## Coordinates, selection and fallback

Implemented behavior:

- Public directory locations use their database/source coordinates; Geoapify points use its validated Point geometry, bounded to the requested distance. Representative city centers locate a search; they do not prove a provider street address.
- `supportMapPoints` excludes `fictional_demo` records in ordinary real mode. Source-qualified IDs prevent merging a directory record with a similarly named mapped location. The keyed selection controller selects the matching card and marker.
- The map initializes lazily, keeps the results list independent, bounds its zoom and loading time, retains Geoapify/OpenStreetMap/OpenMapTiles credits, and exposes keyboard controls. Failed style/tiles leave list and details available; errors do not print credential-bearing URLs.
- Explicit `syntheticDemo` review mode may show labeled fictional markers over real tiles. That exception is not verification of real institutions or visitable coordinates. The personal EDEN fixtures use city-area test points and have no real contacts/directions.

Existing deterministic tests passed for marker/list identity, selection retention, marker cleanup, provider style validation, attribution and fixture exclusion. Before the resolver cap, the parent’s **Call 1 browser observation on 18418** found a Support-page map canvas, attribution and a **fictional demonstration marker** in the DOM. This is evidence that the review map/marker surface mounted at the approved origin. No complete full-tile screenshot or real-dataset coordinate verification was obtained. **Complete current basemap rendering and actual real-source marker/coordinate verification remain outstanding**; the current directory is not connected and fresh journeys are now resolver-limited.

## Resource systems and current connection evidence

The production-capable manual resource path is `/api/v1/resources` and `/resources/search` → `PostgresRepository` → the restricted public search/projection functions. `DATABASE_URL` must authenticate as `our_ground_api`; public queries use bound values, verified remote TLS and the public publication/privacy filters. Account/import/owner operations are separate. `BACKEND_DATA_MODE=disabled` fails directory reads closed. `demo` explicitly requires `ALLOW_DEMO_DATA=true`, and production runtime rejects demo/fixture configuration.

Current local checks inspected only safe configuration indicators: browser/server Geoapify keys are present and distinct; `.env.local` has **no DATABASE_URL or Supabase configuration**. No other credential file was searched for a replacement connection. The previous temporary HRSA CSV/workbook paths were absent. Therefore no real SQL, current database row count, migration state or source snapshot was reverified.

The parent’s separate read-only Vercel metadata inspection found only six production provider/Redis key names and no database/Supabase or Preview keys; values were not inspected. That metadata absence is a configuration finding, not an audit of a running remote database or proof of current deployment API health.

Initial read-only requests to the personal API, Harrisburg Food within 10 miles:

| Requested source | HTTP | Actual result |
| --- | --- | --- |
| `data_kind=real` | 200 | 0 records; no fictional fallback |
| `data_kind=fictional_demo` | 200 | 1 record, `data_kind=fictional_demo`, no contacts |
| Standard `/geoapify/status` | 200 |`enabled:false`; no Places request or direct-provider bypass followed |

These results verify isolation for this test configuration. They do not mean Harrisburg has no assistance, prove nationwide coverage or verify a real mapped-Places pipeline. Existing approval/Redis protections were preserved; no Geoapify Places/geocoding call was made.

## Observed shared resolver limit and remaining verification

At **2026-11-07T13:51:10Z**, the standard application request `/places/resolve?q=Harrisburg%2C%20PA` returned **HTTP429, `RATE_LIMITED`, `Retry-After:36612`**. The existing shared Redis resolver budget is **100/day**. No counter was cleared, replaced or raised; no direct-provider fallback, alternate key or alternate admission namespace was used to evade the limit. The daily window resets at **00:00UTC on November8**, which is **7:00PM Eastern on November 7**; the observed Retry-After remains recorded as returned rather than treated as a successful lookup.

Fresh real-resource workflows **A/B/C/G/H**—homepage search, contextual distance refinement, actual resource details, selected location on the map, and source-supported open-now uncertainty—could not be completed after that admission denial. Existing fixture/deterministic passes do not establish these real-data results. A 429 must remain an explicit temporary search failure and must not produce fabricated success or a zero-provider-results claim.

The current private review grant expires **2026-11-07T21:10:16.879Z**, or **4:10PM Eastern**, before the daily reset. Further controlled verification after reset therefore needs a current appropriately bounded review grant as well as the normal provider/admission gates. No grant extension was performed by this audit. Port18418's map-origin authorization is independent of this resolver limit; 5199 still returns the external Geoapify 401 restriction.

## Intended real sources and provenance

| Layer | Intended source and preserved meaning | Current evidence |
| --- | --- | --- |
| Healthcare directory | [HRSA Health Center Program Service Delivery and Look-Alike Sites](https://data.hrsa.gov/data/download). Source ID, URL, snapshot/import/last-seen dates and `imported_unverified` status are separate from independent verification. Confidential/suppressed site addresses must never be reconstructed. | Official catalog retrieved 2026-11-07: displayed update 2026-08-28, daily refresh, usage limitations “None,” explicit shelter-address suppression. Historical local import evidence reports 17,418 sites; current DB not reverified. |
| Philadelphia food | [City Free Food and Meal Sites](https://opendataphilly.org/datasets/free-food-and-meal-sites/), City license/attribution, source-supplied active status, coordinates, hours and eligibility only. | Official catalog and ArcGIS metadata read 2026-11-07; source data-last-edit 2026-11-05T16:54:29.474Z. Historical published count 324. |
| Seattle/King County food | [Emergency Food and Meals](https://data.seattle.gov/Community/Emergency-Food-and-Meals-Seattle-and-King-County/kkzf-ntnu), city source/attribution, structured contacts and raw supplied schedule text. | [Official metadata](https://data.seattle.gov/api/views/kkzf-ntnu.json) read 2026-11-07: Public Domain, rows-updated 2026-09-26T00:53:05Z. Historical published count 209. |
| Prince George’s County food | [Office of Food Security directory](https://data.princegeorgescountymd.gov/Community/Prince-George-s-County-Food-Assistance-Directory/d7ae-zbbv), original source-row lineage and custom OpenPGC terms. | [Official metadata](https://data.princegeorgescountymd.gov/api/views/d7ae-zbbv.json) read 2026-11-07: rows-updated 2026-11-06T14:33:27Z. Historical published count 60. Required local notice exists at `/data-notices/openpgc.html`; terms are not CC0. |
| Optional mapped supplements | Geoapify/OpenStreetMap point evidence, separate `geoapify_discovered` label and source credit; not curated service verification. | Adapter implemented; standard local API reports disabled, so current live discovery not tested. |

Historical counts come from [healthcare import evidence](../implementation/phase-7d-data-sources.md), [food foundation](../implementation/final-food-foundation.md) and [Maryland expansion evidence](../implementation/final-discovery-food-expansion.md). The 593 historical public food programs cover portions of PA, WA and MD; they are not a nationwide food directory. Re-reading source metadata did not reimport, refresh or independently verify any listing. This audit does not verify legal compliance or a continuing contractual permission for every future use.

Source/record reliability safeguards inspected in code:

- Public search/detail projections retain source attribution, verification status and dates; UI converts valid dates to their UTC date and labels missing/invalid dates as not supplied. Source/import dates do not establish current availability.
- Importers retain only supported contacts, schedules, eligibility and costs. HRSA weekly totals do not become weekday opening times. Seattle/PGC schedule prose stays source prose. Missing fields remain missing; open-now requires reliable current hours, timezone and applicable date evidence.
- SQL publication/privacy views suppress confidential or withdrawn locations. Sticky privacy holds and owner-reviewed release are implemented in migrations; their deployment state was not reverified here. Disabling source ingestion alone is not withdrawal of existing public records.
- Real mode excludes fictional records in both request source filters and frontend result/map assembly. Fixture cards/details say fictional/not a real provider, disable contact/directions, and avoid real-provider share/report actions. The older visual-concept examples are not the current public resource API.
- EDEN's current provider adapter is intentionally bound to the same approved **fictional DemoRepository** used by the personal evaluation API and validates known records afresh. It cannot invent a provider or silently send arbitrary browser records. A real-data adapter still needs a reviewed, read-only public projection and independent audience/provider release approval; switching database mode is not permission to activate it.

## Validation and next gates

**50 existing focused tests passed**: 26 map-provider/provenance/detail/sample tests and 24 unified-search/map-selection/resource-context tests. No implementation change or redundant new test was needed for an external authorization mismatch. These tests used deterministic fixtures and fake map transports; they are not live database/map claims.

Before real-data staging: wait for normal resolver admission to become available without bypassing its shared counter; ensure the private review grant is current when resuming authorized evaluation. Configure the intended nonproduction restricted database, verify its exact migration chain/TLS/roles, restore or refresh reviewed source snapshots through an explicitly authorized owner workflow, run public real-mode search/detail/provenance/privacy-withdrawal checks, and confirm no fixtures cross the public boundary. Complete the blocked real-data A/B/C/G/H workflows and capture actual full map rendering and real-source coordinates/selection while retaining the list fallback. Recheck source terms, attribution and withdrawal procedures. Keep hosted Gemini and raw microphone access denied until their separate release gates are satisfied.
