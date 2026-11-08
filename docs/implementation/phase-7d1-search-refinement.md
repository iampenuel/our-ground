# Phase 7D.1 — search refinement and Phase 7E handoff

November 5, 2026 (America/New_York; provider counters use UTC). Local work is on `feat/phase-7d1-search-and-7e-readiness` in the recovered iCloud checkout. Production is unchanged by this work. The evidence tables below report this phase's actual results, separately from historical totals and hosted requirements.

## Problem and implemented behavior

The previous location adapter sent one primary Geoapify autocomplete request and exposed only its returned choices. It had no authoritative secondary name index. Consequently a misspelling such as `San Fransisco` could return an irrelevant Mission, Arizona match without offering San Francisco. A working geocoder did not establish reliable correction or actual nearby-resource coverage.

The new path is: debounced input → one Geoapify autocomplete plus a bounded indexed Census name lookup → labeled choices → explicit user selection → signed receipt validation → at most one exact Geoapify city/state resolution for a selected canonical correction → existing PostgreSQL/PostGIS nearby search. No location is automatically selected. No LLM, Mapbox, fabricated address, unlicensed directory or hand-maintained typo dictionary was added.

A strong exact provider match precedes local fuzzy choices. Credible canonical choices follow strong provider matches and precede uncertain provider rows, so the five-choice cap does not hide a supported correction behind weak alternatives. Country, jurisdiction, finite coordinates, explicit input state and five-digit postal evidence are checked independently. Wrong returned house numbers are excluded. Ambiguous cities remain separate choices; a state narrows place results, and additional ambiguity prompts the user to refine. Neither population nor popularity selects a city. Only a returned ID with a current session-bound two-minute HMAC receipt can be retrieved.

## Authoritative reference and local database changes

The [2026 Census Gazetteer catalog](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html) supplied the bounded national Places and States archives. The actual local import has **32,363 places**, **52 state/DC/Puerto Rico records**, and **64,817 indexed names**, in two versioned imports. Geographic identifiers remain strings, including leading zeros. Source publisher, URL, vintage, source hash, import time, original NAME, GEOID/GEOIDFQ, ANSI/LSAD/function fields and published representative coordinates are retained. Official LSAD suffix rules derive display names; no unsupported nickname or spelling aliases were invented. No ZCTA or street-address dataset was imported.

The [USGS GNIS download entry point](https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data) was considered but returned a JavaScript verification page. No protection was bypassed and no GNIS data was imported. Census fallback covers all 50 states, DC and Puerto Rico. AS/GU/MP/VI canonical fallback remains incomplete; provider and actual HRSA resource coverage are separate. Full sources, archive hashes, refresh procedure and limitations are in [the reference report](phase-7d1-geographic-reference.md).

Additive migration `011_geographic_reference.sql` creates private import, canonical-record and normalized-name tables, equality/state indexes and a GiST trigram index. The reviewed runtime role can execute a narrow lookup function, not modify its tables. Queries preselect at most 128 indexed names, return at most five distinct records, require bounded trigram/edit-distance acceptance, and have a 750 ms statement deadline. Inputs of two/three characters receive exact matching only; fuzzy matching starts at four characters. Normalization handles case, spacing, punctuation and diacritics. Explicit state restricts place matches. ZIPs, digits and street addresses are never fuzzy-matched as delivery points. The API additionally applies bounded normalized edit-distance acceptance. Similarity is an internal local measure, never a provider confidence percentage.

The runtime uses one serialized reference connection and enables the layer only with `GEOGRAPHIC_REFERENCE_ENABLED=true` on an appropriately migrated/imported PostgreSQL target. The example defaults to false. Only new disposable local clones were migrated; the original Phase 7D database was retained. Historical migrations 001–010 were not edited. Migration 011 SHA-256 is `a96f8a9ea03a4f18460d9fc749cf4c4d467b5c16e52dd39f34a7b872a04d9b6a`.

Additive migration `012_bounded_privacy_retention.sql` implements owner-only bounded maintenance, preserving existing retention durations and the original migration 007. Its SHA-256 is `8d573b943b37ba23f717e0ecb755e34414cd8ff191756c8c0dafa608e8674f9b`. Defaults are 100/category, 500 total; hard maxima 1,000/5,000, explicit single batches, dry-run, minimal audit, lock/statement deadlines and no schedule. [Security verification](phase-7e-security-verification.md) records its local effects and blocked hosted activation.

## Coordinate precision and confidence policy

The [Geoapify field documentation](https://apidocs.geoapify.com/docs/geocoding/) defines overall, city, street and building confidence separately, plus match type and result type. These fields are retained as provider evidence; local trigram similarity/edit distance is separate. Malformed/nonfinite/out-of-range confidence is rejected. The application thresholds below are conservative application policy, not provider guarantees or calibrated probabilities:

- Overall confidence below 0.2 is not credible. Exact named city/state component matches remain area points; provider-supported corrected names require strong evidence. Exact forward restoration rejects supplied overall/city confidence below 0.8.
- A claimed exact building point requires the matching requested house number, building result type, full/building match type, overall/building confidence at least 0.95 and street confidence at least 0.9. It still does not independently verify delivery, entrance or current conditions.
- Partial street/building matches are labeled uncertain. A correct city with unresolved address offers an explicit area alternative, never a fabricated building. ZIP+4 never implies the delivery extension was confirmed. Five-digit postcode coordinates are representative postal-area points.
- Canonical correction and exact canonical choices show Census source/vintage and representative precision. An explicit canonical selection may use one exact Geoapify city/state point; identity provenance and coordinate provenance remain distinct.

The official San Francisco Census internal point is **37.727239,-123.032229**, offshore. It is preserved exactly rather than silently replaced with an invented downtown point. When available, the selected canonical identity is resolved through exact Geoapify city/state evidence for a useful area search. If upstream resolution is unavailable, the user is explicitly told that the official representative point can be far from service clusters. This fallback can legitimately produce empty nearby results; it is not proof that help is unavailable.

Timeout, quota, unconfigured provider, genuine empty results and local-reference failure remain distinct. A usable canonical list can coexist with a provider-unavailable notice. Retry is explicit; stale/canceled responses cannot replace the current input. Selected device/map coordinates retain their original source even when reverse labeling succeeds or fails.

## Interaction, privacy, availability and preserved product

Choices show exact/possible/canonical/city-alternative labels, source and precision, with live-region notices. Keyboard arrow/Enter/Escape behavior, focus/active descendant state, clear/reselect and touch-equivalent selection use the existing combobox pattern. Suggestion panels flow with the form through the 900 px mobile/tablet breakpoint so they do not cover Search or current-location controls. The approved design, typography, photographs, giving flow, wordmark and favicon were preserved.

Selected locations remain transient for search/map/details. Shared and history URLs restore a labeled **coarse city/state area**, not the former address/GPS point or a receipt. A maximum 64-entry, 120-second process-local cache holds only public city/state resolutions and coordinate evidence; it contains no address, GPS, client/session identity, resource data or search history. Coarse restore can reuse that city resolution without another provider request; street/ZIP/conflicting-state queries cannot. No private resource cache was introduced. The existing shared admission still applies.

Geoapify supplements and the directory remain independent. A directory outage cannot erase a successful mapped result. Complete empty results, partial sources and provider errors are different states. Successful directory retries clear old failure notices. Redis failure keeps the existing fail-closed shared API protection. The page offers static official food and HRSA healthcare referral links without forwarding location; it does not claim a fresh protected database request succeeded during failure. Fictional records never replace real results or gain contact/giving actions. Imported HRSA membership is not a guarantee of appointments, free care, eligibility or current operation.

The corrected keyword display follows Back/Forward state. Failed signed retrieval clears stale choices before a new session can reopen them. Source credit reflects actual returned evidence; a device/map point with failed reverse labeling does not display invented provider attribution.

## Validation and evidence

Final counts, live request totals and actual browser results are recorded below. Fixture evidence is explicitly separate from live Geoapify plus actual HRSA/PostGIS evidence. The loopback preview is not hosted staging or real Google/Supabase authentication.

Local reference performance: five warm restricted-role adapter calls per query on PostgreSQL 18/PostGIS, including role check and statement setup. Six typo medians were **15.02–29.47 ms**; exact Boston approximately **2 ms**, ambiguous Springfield approximately **4.1 ms**. Actual EXPLAIN plans used the trigram index. These are local database times, not typing-to-suggestion or hosted latency; raw measurements accompany the evidence.

Provider verification uses a persistent dispatch ledger with a hard **40 server-request** guard, zero automatic retries, ordinary 200/day, 2/second and 12/provider-client/minute limits unchanged. Browser map traffic has an independent **80-request** guard and ledger. The account-wide allowance includes browser maps and other consumers; a backend cap is not proof of the account bill. Two Census public archive downloads are reported separately, not Geoapify calls. No key/referrer/dashboard configuration changed.

## Phase 7E boundaries and release decisions

The canonical checkout remains linked to the existing protected production project. Initial inventory returned403; the owner approved a fresh team consent and subsequent read-only inspection succeeded. The owner then explicitly approved empty-project creation only. Vercel project `ourground-staging` (`prj_eU9xRSetSQYTbkAce2cYIR5zx8c2`) was created in team `team_7zBDrVIlwYth2sXkAbBPcbYw` on its existing Hobby plan, without a Git link, uploaded source, environment variables or deployments. Its automatically reserved `ourground-staging.vercel.app` domain is not a deployed application. The project defaults to Node26.x; selecting24.x is required during later approved configuration. No isolated Supabase, Google OAuth or Redis resource is available. Configuration and deployment remain unapproved. A local preflight, exact-target manifest/environment templates and separate exact-Auth CSP renderer are ready for review. Their PASS is never hosted permission or proof of ACLs. No push, deployment, remote migration, secret change, existing domain/project change, paid resource or GitHub connection was performed. The approved new empty project and its automatically reserved staging domain are the only hosted project-creation effects.

Full CSP is now enforced in the local built preview and candidate configuration, with exact Geoapify and configured Auth fetch hosts and no report-only substitution. Actual hosted Auth/HTTPS/headers remain unverified. Real Google/Supabase sign-in, hosted PostgreSQL TLS/roles, isolated staging Redis, operated privacy contact, hosted retention operations and recovery/incident drills remain BLOCKED. The owner approved resolution-based90/180-day and365-day audit periods, legal/investigation holds, owner-run maintenance and interim privacy/incident ownership; an operational public inbox is still missing. Automatic approval review also rejected an ambient-environment real-auth integration command because it might target unapproved hosted services; it did not execute and no workaround was used.

[Staging readiness](phase-7e-staging-readiness.md), [security evidence](phase-7e-security-verification.md), and [exact owner actions](phase-7e-owner-actions.md) contain the target inventory, local/hosted distinctions, privacy/retention inventory, dashboard steps and safe commands. No destructive scheduled retention job was activated. Additive migration013 applies the owner's resolution-based rules and explicit preservation holds; original007 and applied011/012 hashes remain untouched.

Local agent development is a separate future decision: the corrected typed discovery path is a useful bounded read-only experimental foundation, subject to provenance, precision, stale-data, source-coverage, quota and provider-outage limits. This task implements no AI agent and grants no release permission. Any agent using real accounts/private organization data or real users must wait for hosted security and operational gates. Limited pilot remains **NO-GO** until those gates pass.


## Final actual validation

Node24.22.1 was used with `GOMEMLIMIT=64MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=192`. Local PostgreSQL18.6/PostGIS and a disposable16MB loopback Redis were used. These are not hosted staging services.

| Distinct check set | Actual outcome |
| --- | --- |
| `npm test`, all `tests/*.test.mjs` | **306 passed**,0 failed/0 skipped; includes72 provider regressions (37 preserved+35 refinement),8 reference unit cases and12 staging/artifact checks. Do not add those subsets again. |
| Geographic-reference actual PostgreSQL | **14 passed**, separate from the8 reference unit tests above. |
| Preserved organization/API/security/retention PostgreSQL checks on013 fixtures | **57 passed**, including authorization/tenant isolation/current revocation/audit/concurrency. Existing tests retained; the old correction fixture now explicitly records a resolved_at consistent with the approved policy. |
| Current bounded retention plus resolution/hold PostgreSQL checks | **21 passed**, with `--test-concurrency=1`; two concurrent maintenance suites correctly hit the shared fail-closed maintenance lock during an earlier diagnostic run. The final run tests the current013 policy, not a reinstalled012 implementation. |
| Nationwide database plus HRSA confidentiality/privacy checks after013 | **20 passed**. |
| Physical PostgreSQL certificate/hostname/TLS checks | **5 passed**. |
| Physical Redis shared limits/concurrency/budgets | **6 passed**;1 separate hosted algorithm check skipped because no isolated staging instance is configured. No hosted failure is relabeled PASS. |
| Total distinct passing Node/PostgreSQL/TLS/Redis checks | **429 passed** across the sets above. |
| Compiled strict-CSP browser fixtures | **13 preserved +15 refinement groups passed**,0 provider/external requests,0 JavaScript/CSP errors. Viewports include true390px and tablet768/900px no-overlap probes. |
| Final build | `npm run build` **PASS**, frontend/backend typechecks, memory-aware environment; final measured Vite build716ms. Existing large lazy MapLibre/demo chunk advisory remains, no threshold raised. |
| Scans | Source and built-output secret scans **PASS**; staged scan **PASS with0 staged files**; npm advisory audit reports0 known vulnerabilities. This is not a guarantee of no vulnerabilities. |
| Actual build/config evidence | **PASS**,70 hashed assets plus a nonsecret evidence file. Public Vite configuration is fingerprinted; Auth/key/API-origin mismatch, modified assets, fixtures and invalid warning settings fail closed. No key values are retained in the evidence. This detects accidental stale builds, not hostile-owner tampering or deployment authorization. |
| Real Google/Supabase/hosted security | **BLOCKED**, not counted as passing local tests. No credentials or approved hosted target exist. The ambient real-auth command was rejected before execution. |

### Genuine live browser journeys

The live browser used the built loopback preview and actual imported HRSA/PostGIS records. Census corrections are local authoritative lookups, **not Geoapify autocomplete corrections**. Each corrected selection below used actual Geoapify exact city/state coordinate evidence. Every choice was deliberate; first-position visibility did not imply automatic selection.

| Typed input | Chosen canonical identity | Actual nearby matches / shown | Typing→choices ms | Retrieve API ms | Nearby API ms |
| --- | --- | ---: | ---: | ---: | ---: |
| San Fransisco | San Francisco,CA |150/20|1257|674|178|
| Philidelphia | Philadelphia,PA |97/20|1151|896|1580|
| Chcago | Chicago,IL |183/20|1368|1335|123|
| Los Angles | Los Angeles,CA |443/20|1860|1492|177|
| Boson MA | Boston,MA |116/20|1260|1829|94|
| Pensylvania | Pennsylvania state |0/0|1156|458|154|

Pennsylvania state searches from its selected representative point; zero results in that radius is not a statewide count. The initial live Pensylvania run exposed a ranking gap: one strong Alabama place plus uncertain streets crowded out the Census state. The generalized ordering fix and a dedicated regression passed, then the live case passed. The first five successful typo journeys were retained instead of repeated.

Additional12 live observations: exact Boston116, Harrisburg6, PortlandOR83, SpringfieldMA23, leading-zero02108 postal-area115,02108-0001 postal-area115, full numbered civic address137, accented EspañolaNM11; unspecified Springfield presented alternatives without selection. Partial address offered labeled uncertain candidates. Incorrect street number and an unrecognized street offered explicit city alternatives and were left unselected as addresses. The full civic-address point was labeled uncertain rather than falsely guaranteed exact; ZIP+4 did not claim delivery-extension verification. Exact NewYork/Houston/Anchorage/Honolulu are covered in deterministic/new reference regressions and preserved Phase7D live evidence; they were not silently claimed as repeated live calls in this window.

The actual San Francisco map rendered20 matching markers with visible source credits, real Geoapify map responses and strict CSP. Marker/list keys synchronized with the correct resource. Actual WINDSOR HOTEL detail, HRSA source information, supported contact/directions and coarse-area detail return were inspected. Desktop1440 and true mobile390 screenshots were captured. Browser GPS permission was tested with an explicitly synthetic point and one real reverse lookup; denial used zero provider calls. It is not physical-device GPS evidence. Back,Forward,refresh,food referrals and giving intent were exercised. No JavaScript/CSP errors were reported by the successful final live flows.

A real navigation check also exposed duplicate forward requests after the old canonical cache expired. The final fix seeds the bounded public-area cache after a successful exact coarse-city restoration. Browser evidence records one initial provider resolution, then **zero** additional provider requests for same-city food/giving,Back,Forward andrefresh; coarse city/state and giving context remain visible. Raw request attempts from earlier diagnostics remain counted.

The final live ledger totals, freeze hashes and final smoke checks accompany the evidence directory. Browser diagnostic interruptions included a viewport-triggered map opening and a below-fold click; both were corrected in the driver with no product bypass. No VoiceOver/NVDA session or physical mobile keyboard was tested. Accessibility evidence is Chrome's accessibility tree, ARIA/live regions, focus/keyboard and emulated touch/viewport behavior.

### Integrity, operations and readiness

All **36 approved public asset hashes match Phase7D**, with no baseline file removed. The original HRSA database remains unchanged. The new clone has17,418 services/locations/source records/versions,1,584 organizations,1 import run and17 source privacy holds/events. All eight ordered table fingerprints match the original; migrations001–010 match both source and journals. Geographic lookup records are separate from resources and do not fabricate services.

Migration013 `013_resolved_retention_holds.sql` SHA-256: `92dda438a34a8a21604f2024361b061dc690a8973ac7e2d1f52b7d433451f0bf`. It deletes only resolved corrections older than90days after resolution; unresolved and recently resolved reports remain. Resolved claims/revisions are handled after180days, preserving active membership/access, current published records and necessary current verification. Inactive superseded private history is minimized in bounded batches.365-day audits respect explicit owner-managed legal/investigation holds, including related requests/site/subject evidence. Held subject erasure fails closed. Hold changes and retention are audited, owner-only and serialized. Schema-only migrations ran on three new disposable local clones. Destructive effects were tested in rollback transactions; no real cleanup, schedule or hosted retention operation ran.

| Gate | Decision | Reason |
| --- | --- | --- |
| A—Search refinement | **PASS locally with genuine live-provider/data evidence** | Original SF plus six typo journeys, ambiguity, address precision, actual resources/maps and final UX verified. |
| B—Local security regression | **PASS** |429 distinct local checks, build, scans, holds and enforcement passed; no new authority comes from geocoding labels. |
| C—Real staging infrastructure | **BLOCKED** | Empty isolated Vercel project exists; no approved deployed stack, Supabase/Google/DB/Redis credentials or real Auth verification. |
| D—Privacy/operations | **BLOCKED** | Owner/policy approved and local mechanisms tested; public inbox, hosted retention/recovery/incident drills and deployed headers remain unverified. |
| E—Limited real-user pilot | **NO-GO** | Critical C/D gates remain unsatisfied. No production or agent release is authorized. |

A bounded future **local read-only agent prototype** against the verified typed discovery path/fixtures is technically supportable, with provenance, uncertainty, coverage, privacy and provider-budget constraints. This does not authorize beginning it in this task, using private accounts or releasing agents to users. Hosted/private-user agent work remains blocked by the same critical security gates.

### Changed-file groups

- Geographic data: `backend/geographic-reference.ts`, `backend/gazetteer-import.mjs`, `scripts/import-gazetteer.mjs`, migration011 and reference tests/report.
- Location contracts/evidence/API: `shared/location-search.ts`, `shared/contracts.ts`, `shared/geoapify.ts`, `backend/location-quality.ts`, `backend/location-quality-validation.ts`, `backend/location-search.ts`, `backend/location-validation.ts`, `backend/location-api.ts`, `backend/runtime.ts` and targeted regression tests.
- Existing search UX/referrals: `src/location-controller.ts`, `src/location-combobox.ts`, `src/location-quality.ts`, `src/location-credit.ts`, `src/support-page.ts`, `src/support-search.ts`, scoped `src/unified-support.css`, `shared/national-referrals.ts` and browser fixtures.
- Security/operations: shared/backend security headers, `vercel.json`, `vite.config.ts`, `backend/build-provenance.mjs`, `backend/staging-csp.ts`, `scripts/staging-readiness.mjs`, `scripts/render-staging-csp.mjs`, migrations012/013, database-check/owner-maintenance helpers and `src/privacy.ts`.
- Handoff: the four required reports, authoritative reference evidence, exact-target/environment templates and the new [free-tier staging setup guide](phase-7e-staging-setup.md). The final identity manifest records every changed/new file and preservation result.

## Frozen handoff and preview

The completed live window used **32 server Geoapify dispatches** and **39 browser Geoapify map dispatches**, below the40/80 hard guards. This includes the initial Pensylvania failure and browser diagnostic attempts. The read-only aggregate monitor reports32 reservations for UTC2026-11-06,200/day configuration,80% warning inactive. Two official Census downloads are separate. Account-wide Geoapify credits/billing were not verified. No counters were reset, no retries enabled and no key/referrer changed.

The final built-client smoke passed `/`, `/give`, `/support` and `/privacy` at1440×900 and390×844, with loaded images, no horizontal overflow, actual enforced headers, nonfixture70-asset evidence and zero external/provider/JavaScript/CSP errors. Unconfigured real accounts remained unavailable; a tampered callback was scrubbed safely. These are local checks, not hosted OAuth.

Review: **http://127.0.0.1:18418/support?category=healthcare&view=list**. The owner preview remains on the new local database/reference layer, normal200/day shared provider safeguards and zero automatic retries; optional mapped-place supplements remain off. The completed verification preload/ledgers are frozen. Subsequent owner preview use is outside the recorded verification window and still spends ordinary provider allowance. Owner API health was checked200 after restart without a provider request. Task Chrome/profile, browser fixture servers, temporary Redis and the superseded local API were stopped; the preview/API and existing local PostgreSQL remain available.

Sanitized evidence, screenshot files and hashes: [local evidence index](../../output/phase-7d1-7e/README.md). Representative actual screenshots: [SF correction](../../output/phase-7d1-7e/screenshots/real-san-fransisco-correction-suggestions.jpg), [SF actual map](../../output/phase-7d1-7e/screenshots/real-corrected-sf-map-desktop.jpg), [mobile map](../../output/phase-7d1-7e/screenshots/real-corrected-sf-map-mobile.jpg), [actual detail](../../output/phase-7d1-7e/screenshots/real-corrected-sf-resource-detail-mobile.jpg). Fixture screenshots remain clearly labeled synthetic. No private profiles, raw secret-bearing network logs, database dumps, environment values or TLS private key were packaged.

Final metadata readback confirms production's latest deployment **and project updatedAt are unchanged** from the initial successful read-only inventory. The existing production deployment remains `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`; the new staging project still has no deployment. No remote migration, existing-project/domain/env mutation, Git connection, push or agent implementation occurred. Only the owner's separate empty-project creation approval was exercised.
