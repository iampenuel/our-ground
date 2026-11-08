# Phase 7D — nationwide resource discovery

Date: 2026-11-05. Work is in the recovered iCloud checkout on `feat/phase-7d-national-discovery`. Existing uncommitted Phase 7A–7C work was preserved. Production remains Phase 7A; no deployment, remote migration, GitHub connection, provider-plan purchase, billing change or credential/restriction change occurred. No AI agents were added to the product.

The owner's later engineering steer superseded the original Mapbox requirement. **Geoapify is the primary autocomplete, forward-geocoding, reverse-geocoding and map-tile provider. MapLibre remains the map renderer. Mapbox credentials are not a blocker or requirement.** The unfinished Mapbox adapter was replaced within the new provider-independent boundary; a local scratch snapshot preserves that intermediate source. Existing UI, security and HRSA work was retained.

## Separate decisions

| Decision | Result and scope |
|---|---|
| Implementation complete? | YES for the authorized local scope: features, additive data/privacy changes, actual import, regression suites and local production preview are complete. Hosted and permission-dependent work remains explicitly blocked — local feature, security, database and browser evidence below. External permission/configuration gates are separate. |
| Live Geoapify verified? | YES for bounded live autocomplete/forward/reverse and MapLibre/Geoapify checks below; typo/landmark quality limitations are retained — actual provider responses are distinguished from deterministic tests. |
| Nationwide resource discovery verified? | YES for the measured healthcare baseline, not comprehensive food/healthcare coverage — 17,418 actual HRSA sites, all 50 states/DC plus five territories; healthcare coverage is a baseline, food coverage remains referral-based. |
| Staging security verified? | BLOCKED. No staging deployment was explicitly authorized or nonproduction target confirmed. Local production-build checks and an isolated hosted Redis test do not establish staging verification. |
| Limited pilot ready? | **NO-GO.** Real Google/Supabase, hosted database/TLS/pooler, deployed abuse/header/CSP boundaries, privacy contact and operational retention remain unverified. |

See the [provider/setup guide](phase-7d-provider-setup.md), [data-source and coverage report](phase-7d-data-sources.md), [machine-readable HRSA coverage](phase-7d-hrsa-coverage.json), and [pilot readiness reconciliation](phase-7d-pilot-readiness.md). Sanitized local evidence is under ignored `output/phase-7d/`; source CSV/workbook, private browser profiles and credentials are excluded.

## Original causes

The actual checkout, not GitHub main, was inspected. Different location paths had different scope:

- The primary Phase 7A Geoapify mapped-Places path already supported 50 states/DC, validated returned country/state evidence and used a bounded circle. That was not a nationwide curated resource database.
- The location input had a static native datalist with Harrisburg, Portland and a leading-zero ZIP example. It had no live address autocomplete or selected-address retrieval.
- The independent directory API rejected coordinates outside a Pennsylvania rectangle, its legacy resolver rejected other states, stored service locations constrained `state='PA'`, and the support UI skipped directory queries outside PA.
- The only persistent local records before this phase were small, explicitly fictional demonstrations. The hardcoded Harrisburg/Philadelphia/ZIP resolver map was confined to enabled demo behavior. Portland could come from genuine Geoapify mapped discovery or the static input example; it did not establish imported Oregon directory coverage.
- Mapbox configuration was absent; the discarded new Mapbox path could not honestly be called live verified. The later provider decision removed that dependency. `/discover` already redirects into unified support; an obsolete Google page was not the current resident location component.
- Account/security configuration remained incomplete as documented in Phase 7C. A local synthetic account fixture never established real Google login.

The implementation removes the unnecessary live-path restrictions without deleting or mixing fictional fixtures into public resource discovery.

## Architecture and user experience

The location UI consumes typed internal suggestions and a normalized `SelectedLocation`. Provider-specific fields are confined to `backend/location-search.ts`. Resource search uses the selected coordinates independently; it does not trust location labels for authorization. HRSA ingestion and organization permission checks do not depend on the geocoder vendor.

| API under `/api/v1` | Behavior |
|---|---|
| `GET /locations/status` | Capability metadata; does not make a geocoding request |
| `POST /locations/suggest` | Bounded, shared-rate-limited Geoapify autocomplete; US country filter, five suggestions maximum |
| `POST /locations/retrieve` | Verifies a 120-second signed receipt binding returned ID/session/point; **zero additional provider calls** |
| `POST /locations/reverse` | Explicit GPS/map point label lookup; no automatic permission request |
| `GET /places/resolve` | Compatibility city/ZIP and standalone state-code forward resolution through Geoapify; exact returned evidence and one unambiguous match required |
| `POST /resources/search` | Transient coordinate/filter body → restricted PostgreSQL/PostGIS public search; precise coordinates stay out of frontend share URLs |
| Existing `GET /resources`, `GET /resources/:id` | Nationwide bounded public discovery/details; fictional and private records remain isolated |
| Existing optional `POST /geoapify/places` | Selected-point mapped supplement, with existing category/radius/result/admission checks; no repeat geocoding or precise-center cache |

The combobox preserves the approved visual language. It has a location icon, clear control, dismissible panel, loading/error/empty feedback, manual suggestion selection, selected-location confirmation, screen-reader announcements and visible focus. Arrow keys navigate; Enter chooses only an active option; Escape dismisses; Tab and standard input editing remain predictable. Touch selection completes on release. Input is debounced 300 ms, duplicate work is avoided, requests are abortable, and generations prevent stale responses from replacing current results. No address or typo is invented.

GPS is requested only after the explicit control, in a secure context, with bounded permission/timeout handling and no high-accuracy demand. Grant, denial, unsupported/error and cancellation paths are tested. Device/map coordinates stay transient; a failed optional reverse label retains the original point and visibly states that address lookup is unavailable. It does not invent a city, state or address, and the normal resource rate/authorization controls still apply.

Map adjustment is an explicit mode, separate from resource selection. An empty-map click or keyboard pan plus **Search this map center** confirms a new query point. Marker clicks still select actual resources; a crosshair is not described as a service. Public lists remain usable if map loading fails. The existing MapLibre renderer/style, numbered markers, selection, zoom, antimeridian unwrapping and Geoapify/OpenStreetMap/OpenMapTiles attribution are retained. Autocomplete, optional POI supplements, map tiles and directory availability are independent capabilities.

A final navigation regression corrected state-only coarse URL restoration: standalone supported two-letter codes use Geoapify structured full-state-name/country parameters, `type=state` and exact returned jurisdiction, while full city names keep the strict city path.

URLs preserve public coarse area/filter/giving context. Provider IDs/receipts, precise addresses and GPS/map coordinates are not persisted in URLs or resource tables. Back/detail navigation can repeat a coarse public area; a GPS/map point without a coarse label must be explicitly chosen again after a full refresh. This is the documented privacy tradeoff rather than a promise to retain exact GPS state.

Search displays true matching records, valid-location coverage gaps, unrecognized/ambiguous locations and source/provider outages separately. No outage substitutes fictional data. Food gaps offer official referrals, rather than asserting that no food assistance exists. Loaded local filtering and bounded nearby directory keyword/name queries are labeled appropriately. The narrower mapped-place-type selector is labeled for mapped supplements only and disabled while those supplements are unavailable; imported HRSA records use only their supported Healthcare category, never an inferred general-practice subtype. City/state/ZIP/region searches use provider representative points; their radius does not mean every resource in the entire jurisdiction. Giving intent remains separate from resident search; imports gain no invented donation route, charity status or reviewed identity binding.

## Nationwide database and actual data

Migration 008 extends valid resource states to all 50 states/DC plus PR/VI/GU/AS/MP, retains ZIP strings including leading zeros/ZIP+4, adds private source/import/version provenance, and supplies indexed bounded `geography` search. Parameters are bound; radii are capped at 50 miles, page size at 50 and page at 100. Ordering is stable by straight-line distance and ID. Counts, details and map points contain only intentionally public published records. No single bounding rectangle is claimed to validate US geography.

Source and display distinguish publication, imported verification status, source dates, stale/review state and claim approval. A published HRSA site is not independently verified, guaranteed free, accepting patients or associated with Our Ground. No hours, appointments, eligibility, insurance, clinical availability, costs or donation destinations were invented.

HRSA's official service-delivery-site CSV and field metadata were downloaded through two public requests. The 19,537-row snapshot yielded **17,418 public fixed sites across 1,584 organizations**, covering every state/DC and five territories. Excluded rows total 2,119, with exact reasons in the data-source report. Domestic-violence/suppressed sites, missing public addresses, invalid points, unsupported associated sovereign states and mobile/nonfixed sites were not published. Seasonal sites are identified without invented schedules. HRSA is not a complete healthcare directory.

Imports are owner-only, dry-run by default, target-guarded, transactional, batch-processed and keyed by exact stable source IDs. A repeated identical snapshot created no duplicate sites/run/version. Older snapshots, disabled sources and changed parent identity fail safely. Reviewed edits are preserved for explicit reconciliation. Missing records become stale according to deliberate full-snapshot policy, not silently deleted.

Additional privacy review found two concrete gaps in an initially excluded-row path: a snapshot containing only suppression evidence could abort before withdrawals, and a later active row could automatically clear suppression. Additive migration009 now records durable private ID-only holds and minimal immutable withdrawal/review-release events; migration010 hides the whole held location, including other services sharing that point. Historical008 was not rewritten. Later public evidence cannot automatically republish a held point. Owner-only reviewed release requires fresh source evidence, an active reviewer and exact current public-location reconciliation, and still does not publish the site automatically.

Reprocessing the already reviewed snapshot added17 minimal private holds (14 suppressed/domestic-violence and3missing/suppressed public-address IDs), without downloading again or changing the17,418 real resources, 17,418 versions or one import run. Excluded confidential addresses were never copied into reports. Synthetic suppression regressions roll back and verify that details, public locations, provenance and map/search projections all hide the point, including shared-location aliases.

Historical migrations 001–007 retain their original hashes. New migration names/hashes and actual current inspection are in `preservation.json`; no owner migration ran remotely. The original Phase 7B/security databases were kept separate; new disposable schema-current fixtures and the separate real-import preview database were used. The final read-only inspection confirms the originals still have their16-table schemas and no Phase 7D tables. No initial row-level snapshot exists for a byte-for-byte comparison; `final-data-inspection.json` states that limit.

| Resource category | Actual coverage |
|---|---|
| Healthcare | 17,418 HRSA fixed-site records across 50 states/DC plus five territories. Geographic queries and public details verified locally; coverage/availability remain incomplete. |
| Food assistance | No licensed/configured food directory feed was imported. Official Feeding America, 211 where available and USDA hunger referrals are usable. All states have referral paths, not falsely claimed pantry records. |
| Other community support | Outside current supported search categories; 211 is an external referral, not an imported listing or Our Ground verification. |

Food source adapters require explicit permitted-use evidence. Feeding America/211/findhelp do not grant unrestricted bulk directory rights merely through public pages/API documentation; USDA SNAP retailer records must not be misrepresented as free-food pantries. No unauthorized scraping, account creation, paid access or fictional records filled the gaps.

## Security, privacy and dependency changes

Phase 7C's supported Supabase verification, current SQL membership/session checks, exact listing scope, revocation/suspension, reviewed writes, append-only correlated audits, private cache controls, runtime-role checks and verified database TLS remain. Public location/body schemas reject unknown privileged fields; inputs are bounded; selected receipts cannot retrieve unreturned IDs or cross sessions. No new public URL-fetch/crawler endpoint exists. Upstream URLs are fixed and redirects rejected. Provider errors never expose keys or SQL.

All server Geoapify calls share the existing Redis 200/day maximum, 2/second and 12/client-provider/minute constraints. Configurable lower budgets and a conservative warning marker were added. Location-specific admission uses the same infrastructure, not a process-only competing limiter. Each retry requires admission; default automatic retries are zero, with at most one explicit transient-only 500 ms-backoff configuration. Browser tiles remain outside complete backend account enforcement. Shared budgets, observed requests and estimated credits are separated below.

Headers retain document/frame/object boundaries and private no-store/no-referrer. Geolocation permission policy changed deliberately from disabled to **self only** to support the explicit user action; third-party origins are not granted location access. Obsolete Mapbox CSP hosts were removed. Full resource CSP remains report-only pending real hosted Auth/provider inventory verification. This is not a PILOT READY claim.

The public privacy notice describes actual providers, anonymous searches, transient GPS, source provenance, external giving, hosting/provider logs, missing privacy contact and owner-run retention. No tracking, session replay, advertising, resident medical records, card processing or uploaded-file feature was added. Retention/redaction procedures exist and are tested; their real operation and staffed contact remain owner gates.

`src/resource-map.ts` was removed only after proving it had zero callers. Active support/detail maps already used MapLibre/Geoapify. Removing `mapbox-gl` changed only its direct dependency/lock entry; retained package versions and integrities were unchanged. Transitive utility packages with a Mapbox namespace do not constitute a Mapbox API/GL dependency. Normal Find Support requires no Mapbox token/account. Legacy Google API code was retained disabled and had its unnecessary PA scope removed without introducing a fallback dependency.

## Actual validation and observed behavior

All commands used Node 24.22.1 with the documented memory constraints. No ordinary provider request is made by deterministic unit tests.

| Validation | Actual result |
|---|---|
| `npm test` | **234/234 PASS**, 0 failed/canceled/skipped. Includes previous Phase 7B/7C regressions and new provider/receipt/input/error, controller/GPS/navigation, giving, referrals, map configuration, HRSA and abuse tests. |
| Actual current-schema organization/PostgreSQL/API/security/retention | **57/57 PASS**, 0 failed/skipped, on new disposable schema 010 fixture databases. |
| Actual HRSA/PostGIS/import/privacy | **20/20 PASS**, 0 failed/skipped: actual nationwide records/index/distances, cross-state/antimeridian, idempotency/history/review preservation, private role isolation and suppression holds. |
| Physical verified PostgreSQL TLS | **5/5 PASS**: selected CA succeeds, missing/wrong chain and hostname reject, production disable forbidden. Local endpoint only. |
| Existing physical shared Redis abuse algorithm | **2/2 PASS**. |
| Physical Geoapify provider Redis admission | **4/4 PASS**:200/day, 2/sec, 12/provider-client/min, 6/search admission, lower cap/warning. Hosted-only case conditionally skipped in this local mode. |
| Real hosted Redis isolated algorithm | **1/1 PASS**, 9 REST commands, 3 allowed/3 blocked, 429 with Retry-After and cleanup. Four local-only cases conditionally skipped in this hosted mode. No ordinary production counters were accessed by this isolated test. |
| Unique Node checks across the above suites | **323 passed, 0 failed**. Five intentional mode-only skips across the two complementary Geoapify Redis invocations, plus one explicitly blocked hosted Supabase integration below; no unexplained skipped requirement. Focused reruns and browser groups are not added to this total. |
| Deterministic real-Chrome browser fixture | **13 groups PASS**, 0 provider/external requests, 0 JS/CSP errors. Synthetic location/resource responses are explicitly labeled. |
| `npm run build`, frontend/backend strict TypeScript and environment boundary | **PASS** after the 234-test suite, 651 ms Vite build. Existing large-chunk warning remains: lazy MapLibre 1,104.23 kB minified/298.14 kB gzip; no warning threshold was raised. The 234 checks include 2 safe attribution rendering tests. |
| Dependency audits | Production and full dependency audit: 0 vulnerabilities at verification. No forced upgrade. |
| Source/staged/built secret scans, diff whitespace and evidence checks | **PASS**: source, staged and built-output secret checks; all sanitized evidence checked for configured key values and selection receipts; diff whitespace checked and the one blank-line defect removed. See `output/phase-7d/secret-scans-final.json`. |
| Existing real-Supabase `tests/live.integration.mjs` | **BLOCKED**, 0 passed / 1 skipped: required hosted target and two confirmed session tokens are absent. Missing-config preflight guaranteed its body did not run; no remote fixture write occurred. |
| `npm run check:setup` | **BLOCKED as expected**, exit 1: seven persistent Auth/hosted-target values are absent. The disposable local preview uses explicit loopback runtime exports. Presence-only setup is not claimed to pass from those exports. |
| Preserved design/assets | All 36 public asset hashes match Phase 7C; landing/photography/design/navigation/account authentication source and historical 001–007 migration hashes match. |

### Actual Geoapify → PostgreSQL → browser journeys

Real Geoapify suggestions were selected manually with keyboard controls, verified signed retrieval returned the selected coordinates, and the restricted runtime queried the actual imported HRSA data. These were not mocked geocoding or resource responses. Each search used Healthcare, 10 miles and a20-record page:

| Selected provider city | Actual nearby HRSA total | Displayed |
|---|---:|---:|
| San Francisco, CA | 150 | 20 |
| Harrisburg, PA | 6 | 6 |
| New York, NY | 314 | 20 |
| Boston, MA | 116 | 20 |
| Houston, TX | 65 | 20 |
| Anchorage, AK | 7 | 7 |
| Honolulu, HI | 25 | 20 |

The live browser measured typing-to-suggestions1,554–7,516ms, selection-to-resource display215–724ms and directory HTTP127–441ms across those seven searches. These small-sample local measurements include network/debounce/driver overhead, not a provider SLA. Retrieval itself made zero further Geoapify requests.113directions links were checked against the returned public-resource coordinates. The twelve-city static-coordinate SQL/index timings in the coverage report are separate measurements; their centers and totals need not equal Geoapify's chosen centers.

The live map journeys used San Francisco and Honolulu:20 markers each, matching the displayed20public HRSA records. Actual style/TileJSON/sprite/glyph/vector-tile responses rendered through the bundled MapLibre worker. Marker→card, card→marker, mobile return/focus and visible Geoapify/OpenStreetMap/OpenMapTiles credit passed. Measured map loads were3,711ms and3,138ms. Desktop1440×900 and mobile390×844 screenshots are retained. The same renderer was reused for responsive checks; no per-result provider requests were added.

An earlier18428preview origin returned401for the style. A read-only diagnostic found that the same key/style returned200at the already approved18418origin. No restriction/key was edited. A CDP harness initially paused workers and then attempted unsupported worker`Fetch.enable`; a zero-provider local worker proof identified and corrected the driver, without changing the product renderer. All dispatched failed/probe requests remain counted. Final live map runs had no JS or CSP errors. These earlier failures remain in the evidence rather than being relabeled as successful map renders.

| Additional actual input or flow | Observed outcome |
|---|---|
| `San Fransisco` | **Did not correct to San Francisco.** Geoapify returned Sunshine Rescue Mission on South San Francisco Street in Flagstaff,AZ. It was displayed as returned and left unselected. No city or address was invented. The input now explicitly advises checking city/state and adding spelling/state/ZIP context when none match. |
| `100 Larkin St San` | Five returned suggestions included100 Larkin Street and San Francisco Main Library,CA 94102. These were actual partial-address suggestions, not an invented street. |
| `1 Dr Carlton B Goodlett Pl San Francisco CA 94102` | Actual suggestions included City Hall and the explicit1 Dr. Carlton B. Goodlett Place address. The numbered address was explicitly selected and returned137nearby HRSA records/20shown. House number, street and requestedZIP were present; rooftop/building accuracy was not independently surveyed. |
| `02108` | Leading zero retained; actual Boston/Beacon Hill02108 suggestion selected, 115 nearby HRSA records/20shown. |
| `Portland`, `Springfield` | Five actual alternatives each, across different states. No automatic choice; a real Search-button action required selection. A prior low-level synthetic Enter did not submit the native form; that driver assertion was corrected without selecting a location. |
| `Golden Gate Bridge` | Returned sidewalk features, with a suspect provider-supplied`CA 24129`postcode. None was selected as an exact bridge address. This is a provider-data limitation, not an Our Ground-verified postcode or invented correction. |
| California state selection/refresh | Initial actual state suggestion selected; public URL stores only`CA`. Live free-text`CA&type=state`returned an empty200response, exposing a fixture gap. The final adapter uses structured`state=California&country=United States&type=state`, then requires exact returned state evidence. Actual refresh passed. Its representative center has0matching HRSA sites within10miles; UI correctly shows a valid-location coverage gap, not an invalid state or a claim of statewide zero coverage. |
| Current location | Actual Chrome permission flow used explicitly **synthetic public test coordinates**, 1500 m accuracy, after a click. One real reverse request supplied the coarse San Francisco label while retaining the injected point; actual PostGIS returned135/20. Denial offered manual entry and no automatic permission request occurred. This is not a physical device GPS fix. |
| Optional reverse outage | Only the reverse response was deliberately intercepted as503; the retained map point and real PostGIS remained actual, returning25/20in Honolulu with0provider requests. Clearly separate fault injection from live-provider success. |
| Actual resource detail | HealthRIGHT 360 Integrated Care Center loaded from the actual API with sourceID/provenance,`Imported · unverified`, correct Nov 5, 2026 UTC dates, missing-hours/cost guidance and safe contact/directions/website/return links. Link destinations/attributes were inspected; no phone call, donation or third-party site visit was made. A driver originally expected ISO text where the approved detail UI uses an en-US date; the final check asserts the correct displayed UTC date. |

The final production-build controls were checked separately with explicitly mocked location/resource transports and no external requests, confirming attribution follow links, supported type scope and current keyword/category/radius behavior. These are regression fixtures, not new live-provider proof.

Static production-preview landing, Give Support, account-unconfigured, privacy and callback routes were checked at desktop/mobile sizes with zero external requests. Approved landing/Give photographs loaded. Giving evidence/unsafe-link/fictional safeguards and organization authorization/review/revocation remain covered by the full current regression suites; closed local Auth is not represented as real Google/Supabase sign-in.

Representative screenshots: [San Francisco desktop map](../../output/phase-7d/real-san-francisco-map-desktop.jpg), [Honolulu mobile map](../../output/phase-7d/real-honolulu-map-mobile.jpg), [actual resource detail](../../output/phase-7d/real-resource-detail-mobile.jpg), [actual typo result](../../output/phase-7d/real-typo-suggestions.jpg), [state refresh/coverage gap](../../output/phase-7d/real-california-state-refresh-desktop.jpg). Full actual responses, driver-stage failures and later successful continuations are preserved separately. Final deterministic browser fixture has13flow groups and zero provider requests.


### Observed requests, estimated credits and enforceable limits

The verification window is closed at **30 server Geoapify requests** against a fail-closed40-request guard:22 autocomplete, 7 forward and1reverse. **41 browser map-related attempts** were recorded separately against an80-attempt guard:16 vector tiles, 10 glyph requests, 6 styles, 3 TileJSON, 3 spriteJSON and3spritePNG. This includes earlier failed/probe/driver attempts; no ledger/counter reset or automatic retry occurred. Browser attempts can include cached/aborted work and are not a billing statement. Official HRSA CSV/metadata downloads were2additional public non-Geoapify requests. Deterministic browser tests made zero provider requests.

Using [official credit costs](https://www.geoapify.com/pricing-details/), the known-class task estimate is **34 credits**:30 one-credit geocoding/autocomplete calls+16×0.25tile credits. The tariff for the25auxiliary style/metadata/sprite/glyph attempts was not independently established; it is not silently assumed zero. No Geoapify billing-dashboard total was obtained. The [pricing FAQ](https://www.geoapify.com/pricing/) describes the free5one-credit request per second rate with a4×tile weighting; this does not create another daily quota. No second project/account was used to bypass limits, and no plan/card/credits were changed.

The read-only shared monitor showed12server reservations after our first probe and41after completion, a29increase consistent with the remaining29task calls. Thus11reservations predate this task's first call. The configured application budget remained200/day, warning80%, inactive. Those41aggregate reservations are not the task's30requests and not account-wide consumed credits. Two monitor invocations used one read-only Redis operation each; the isolated hosted algorithm's9REST commands are a separate test count, not a count of every Redis admission used by the running app.

The backend enforces the shared server budget/rate/client limits and required Redis failure behavior. It cannot enforce the complete shared3000-credit daily account allowance or combined browser/server rate across users/keys. Lazy maps, no hidden-map pan/update, debounce, short suggestions, cancellation and zero default retry reduce traffic. Owner dashboard monitoring/restrictions remain necessary. No unlimited capacity, free SLA or measured remaining account balance is claimed.


The deterministic UI fixture is explicitly synthetic and made zero provider requests. It exercises ARIA/keyboard/touch, stale responses, explicit GPS grant/deny, current-point fallback, empty/failed sources, local bundled MapLibre, map-center adjustment and referrals. Its measured timings include debounce/devserver/driver overhead and are not live-provider benchmarks. Real screen-reader software and a physical device GPS fix were not exercised; real Chrome keyboard/ARIA/permission behavior and explicitly injected public test coordinates are distinguished below. Real live-provider results are separately labeled in the evidence; neither suite proves real Google/Supabase authentication.

Local production preview: `http://127.0.0.1:18418/`. Its API uses the restricted role against the disposable real-import database. Accounts remain unconfigured/closed; this is not a staging deployment. The existing synthetic account preview remains separately labeled and is not real sign-in. The verification preload/ledger and private browser profiles are not part of the production build. After closing verification browser pages, the local owner-review API runs without that task-only40-request preload, while preserving the normal shared200/day ceiling, lower configured budgets, deadlines, key separation and fail-closed Redis. The ignored `output/phase-7d/start-local-review-api.sh` reproduces the guarded loopback-only review target; source downloads and private browser profiles are excluded.

## Remaining gates and assessment

| Gate | Actual status |
|---|---|
| Real Google/Supabase/SMTP and two independently authenticated organizational accounts | BLOCKED; no real Auth configuration was supplied. Read-only Vercel environment metadata access was denied with 403; no values were pulled or permissions changed. Synthetic fixtures are not substituted as proof. |
| Hosted PostgreSQL restricted roles, TLS chain/hostname, Supavisor pooling and Data API/advisors | BLOCKED; physical local isolation/TLS pass, remote checks require the explicitly selected development project. |
| Hosted Redis | Isolated real algorithm/connectivity partial PASS; deployed Vercel client identity, failure behavior and production-equivalent boundaries remain BLOCKED. |
| New HTTPS/private headers and resource CSP | Local HTTP/browser configuration verified. New hosted deployment not authorized; full resource CSP still report-only. |
| Privacy contact and retention/deletion operation | BLOCKED operationally; publish/staff a real contact and run the reviewed maintenance procedure/cadence. |
| Geoapify account monitoring | Application budgets/key separation verified; total dashboard credits, other consumers and direct browser aggregate usage require owner monitoring. No SLA/unlimited capacity claimed. |
| Food feed rights and completeness | REQUIRES PERMISSION/unconfigured; public referrals usable, no comprehensive food database claim. |
| Territory location-provider behavior | Evaluated separately from the actual five-territory HRSA data; no universal geocoder coverage claim. |
| Production/staging release | No production deployment. Staging BLOCKED until explicit authorization and confirmed nonproduction target. |

The [pilot guide](phase-7d-pilot-readiness.md) provides exact owner actions and reconciles Phase 7C. A functioning nationwide geocoder alone is not resource coverage; the actual HRSA records and their limitations are measured separately. **Do not begin the product's AI-agent phase or a real-user pilot until the remaining infrastructure/security/operational gates and data limitations are addressed.**

## Changed implementation files and evidence

The full source manifest and differences from the Phase 7C 252-file snapshot are in `output/phase-7d/final-identity.json` and `preservation.json`. Main groups:

- Provider/API: `backend/location-search.ts`, `location-api.ts`, `location-validation.ts`, `runtime.ts`, `app.ts`, `geoapify-api.ts`, `geoapify-discovery.ts`, `geoapify-limits.ts`, `anonymous-protection.ts`; shared location/geography/map contracts.
- UI: location controller/combobox, support query/state/view/page/styles, existing MapLibre adapter, resource-detail provenance and nationwide time wording, minimal reviewed staff location fields, privacy copy.
- Data: new migrations, `backend/hrsa-import.mjs`, restricted Postgres repository, migration/inspection tools, `scripts/import-hrsa.mjs`, `hrsa-coverage.mjs`, `geoapify-usage.mjs`.
- Safeguards: existing organization location validators extended to valid geography; no role/ownership/publication bypass, origin/private-header protection retained; CSP/permissions/environment examples updated.
- Tests: provider/schema/receipt errors, controller/GPS/keyboard/stale/URL behavior, real PostGIS/import/security/retention/TLS/Redis, and controlled browser/live guard.
- Dependencies: obsolete unused Mapbox renderer/direct package removed; MapLibre and approved assets retained.

No production secrets or actual key values are in this report or screenshots. Approved branding, photography and favicon preservation is recorded by hashes, not assumed from a successful build.
