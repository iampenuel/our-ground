# Phase 7A — Nationwide search and source-backed giving

November 4, 2026. The local production build is ready for owner review. Open [Find Support](http://127.0.0.1:18418/support) or [Give Support](http://127.0.0.1:18418/give). For the reviewed donation action, choose **Explore local providers**, search **Philadelphia, PA** with **Food assistance**, and open Saint John’s Hospice’s organization website.

## Discovery

The active Geoapify geocoder uses the U.S. country filter. Each geocode and mapped result needs U.S. country evidence, a supported state/DC identifier and valid coordinates. The adapter checks city, requested state or ZIP, category and selected radius. Ambiguous matches offer a choice before Places is called. The PA suffix, geocoding rectangle, literal PA result state, hard-coded address labels, Harrisburg starting camera and PA camera bounds were removed. The map starts at the resolved center, includes nearby cross-border results and handles the date line. [Geocoding contract](https://apidocs.geoapify.com/docs/geocoding/) · [Places contract](https://apidocs.geoapify.com/docs/places/).

Discovery covers the 50 states and DC. Listings vary by area. The sourced directory retains its PA storage and query boundary. The interface distinguishes partial source coverage, a complete empty search, and provider failure. The local preview uses its existing in-memory directory, with fictional records confined to explicitly selected demonstration mode. Live Geoapify discovery uses shared Redis admission, including the existing 200/day ceiling. Geocoding and Places caches, timeouts, attribution, and credential boundaries are preserved.

## Giving links

Both discovery links on Give Support carry `intent=give`. The same form, search endpoint, selection, and detail return links handle giving and resident searches. Giving cards offer a confirmed donation page, a labelled listed website, a valid phone contact, or an explanation of missing information. The Give page explains who handles payments, receipts, refunds, and card details.

The server’s typed collection stores the organization, source namespace and exact record ID, name, physical address, domain, official website, nullable donation destination, identity and donation sources, check date, optional status evidence, and exception notes. Matching requires the recorded ID, name, street, city, state, ZIP, and website host. Approved evidence is returned separately from mapped contact data. Both entries were checked on **2026-11-04** and carry no tax-status claim.

| Reviewed organization | Evidence and outcome |
| --- | --- |
| Saint John’s Hospice, Philadelphia | The live food result’s place ID, domain and 1221 Race Street address, including ZIP 19107, match the reviewed binding. The official homepage links to its donation page. The button and source/date appeared in the built preview. [Location](https://saintjohnshospice.org/contact/) · [Official source](https://saintjohnshospice.org/) · [Donation page](https://saintjohnshospice.org/donate/) |
| Mazzoni Center, Philadelphia | The Washington West site at 1201 Locust Street publishes ZIP 19107. Its archived mapped record lists 19103. The separate 1334 Bainbridge record conflicts with the published 1348 address. The current matcher withholds donation actions for both saved records. The official giving page remains available for an exact future match. [Locations](https://www.mazzonicenter.org/sexual-health/washington-west) · [Official source](https://www.mazzonicenter.org/) · [Donation page](https://www.mazzonicenter.org/donate-mazzoni-center) |

## Validation

- **89 tests passed**, zero failed or skipped. The full build then passed with Node 24.22.1, both TypeScript checks and the public environment check. The existing large-chunk warning remains. Memory settings were `GOMEMLIMIT=64MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=192`. [Tests](../../output/phase-7a/tests.log) · [Build](../../output/phase-7a/build.log).
- Deterministic coverage includes all supported state codes, representative cities, ambiguity, explicit mismatches, leading-zero ZIPs, cross-state and date-line results, excluded areas, source outcomes, unsafe URLs, exact identity matching, fictional protection, Redis limits, scrolling, and selection.
- **12 live server requests** through Redis admission, comprising six geocodes and six Places calls. Each query used a 10-mile radius. A persistent counter checked before network dispatch enforced the task cap. The final matching code was also run offline against all six saved responses and both archived Mazzoni records. [Request ledger](../../output/phase-7a/provider-requests.ndjson) · [Final replay](../../output/phase-7a/final-replay.json).

| Live query | Selected category | Accepted mapped records |
| --- | --- | ---: |
| Harrisburg, PA | Food | 1 |
| Philadelphia, PA | Food | 20 |
| Portland, OR | Clinics | 20 |
| Anchorage, AK | Clinics | 19 |
| Honolulu, HI | Food | 0 |
| 02108 (Boston, MA) | Clinics | 20 |

These counts reflect the observed responses. The Hawaii geocode succeeded. The food query returned zero qualifying records in that radius.

- Chrome rendered two live tile maps, Philadelphia and Portland, each with 20 markers. Browser search responses were replayed from the bounded live checks. Browser map traffic is separate from the 12 server requests. The Portland window exposed seven map-style resource entries. A complete worker tile count was unavailable.
- Verified desktop card/marker selection, mobile marker-to-card focus, keyboard activation and all four viewport widths with loaded photography and no horizontal overflow. All 30 content-hashed JS/CSS bundle names in the final build match the browser-tested build. The first keyboard simulation omitted the character event. A native Enter sequence produced keypress, click and the correct selection. [Browser evidence](../../output/phase-7a/browser.json).
- The owner preview uses the normal local API. Six readiness checks passed. Six public page routes returned HTTP 200. All 36 served public files matched their baseline SHA-256 hashes, including the seven favicon files and approved photographs. Built JavaScript passed the server-secret exclusion check. [Readiness](../../output/phase-7a/readiness.log) · [Preview checks](../../output/phase-7a/owner-preview.json).

| Viewport | Give page | Giving context | Resident search |
| --- | --- | --- | --- |
| 1440 × 900 | [Give](../../output/phase-7a/screenshots/give-1440.jpg) | [Giving search](../../output/phase-7a/screenshots/support-1440.jpg) · [donation action](../../output/phase-7a/screenshots/giving-result-1440.jpg) | [Portland results](../../output/phase-7a/screenshots/resident-results-1440.jpg) |
| 768 × 1024 | [Give](../../output/phase-7a/screenshots/give-768.jpg) | [Giving search](../../output/phase-7a/screenshots/support-768.jpg) · [donation action](../../output/phase-7a/screenshots/giving-result-768.jpg) | [Portland results](../../output/phase-7a/screenshots/resident-results-768.jpg) |
| 390 × 844 | [Give](../../output/phase-7a/screenshots/give-390.jpg) | [Giving search](../../output/phase-7a/screenshots/support-390.jpg) · [donation action](../../output/phase-7a/screenshots/giving-result-390.jpg) | [Portland results](../../output/phase-7a/screenshots/resident-results-390.jpg) |
| 320 × 700 | [Give](../../output/phase-7a/screenshots/give-320.jpg) | [Giving search](../../output/phase-7a/screenshots/support-320.jpg) · [donation action](../../output/phase-7a/screenshots/giving-result-320.jpg) | [Portland results](../../output/phase-7a/screenshots/resident-results-320.jpg) |

## Files changed

Paths are grouped by responsibility and are relative to the recovered checkout.

- **Shared contracts** — `shared/us-location.ts`, `shared/geoapify.ts`, `shared/place-evidence.ts`, `shared/contracts.ts`.
- **Server** — `backend/geoapify-discovery.ts`, `backend/giving-links.ts`, `backend/app.ts`, `backend/runtime.ts`, `backend/postgres.ts`.
- **Search and map** — `src/support-search.ts`, `src/support-model.ts`, `src/support-page.ts`, `src/support-view.ts`, `src/maplibre-support-map.ts`, `src/unified-support.css`.
- **Giving and coverage copy** — `src/participate.ts`, `src/info.ts`, `src/resource-detail.ts`.
- **Tests and fixtures** — `tests/national-search.test.mjs`, `tests/giving-links.test.mjs`, `tests/geoapify.test.mjs`, `tests/unified-support.test.mjs`, `tests/unified-support-browser.ts`, plus this report.

Release scope is local review only. The two reviewed organizations are a starting set. The PA directory and conflicting Mazzoni addresses are the remaining coverage limitations.

<!-- phase-7a1-release-evidence -->
## Phase 7A.1 — hosted release verification

November 5, 2026 (America/New_York). **Released and verified on [ourground.vercel.app](https://ourground.vercel.app). Temporary staging referrer removed and its rejection verified.**

| Release identity | Verified value |
| --- | --- |
| Canonical checkout and Git root | `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/Documents/Projects/our-ground` |
| Branch and base commit | `feat/our-ground-editorial-ui`, `3897dea703a7175e8ec57e1d7ba0f358dafc0221`, including the existing uncommitted Phase 7A source |
| Existing project | `ourground` · `prj_4li6QnqulPgPbJpxMW2L9hczDNrS` · `penuels-projects-aa802b06` |
| Tested source SHA-256 | `1105f1e24999d4692e2ebf83e405b519a298c603d4abe02a4a9f1a1cc12bb30e` (160 manifest files) |
| Tested build SHA-256 | `c500efe445181f151ebd2bac7af50e393229a6de7e6a66457db76e764e95e902` (67 output files) |
| Promoted production deployment | `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4` · [Deployment URL](https://ourground-cfiaqimgw-penuels-projects-aa802b06.vercel.app) |
| Previous deployment / rollback target | `dpl_84n9yqnHJJt9xeJ9LFVYbvkG91vy` · `ourground-r4prym1yr-penuels-projects-aa802b06.vercel.app` |

**Source and build.** The November 4 release validation ran `npm test`, then `npm run build`, with Node 24.22.1 and the documented memory settings. **89 tests passed, zero failed or skipped; build passed.** The existing bundle-size warning remains. The reviewed output digest matched. On resumption, all **159 uploaded source files again matched the canonical checkout** by SHA-1; `.gitignore` was excluded from upload. No application source changed during release verification. Existing uncommitted work was preserved. [Tests](../../output/phase-7a/release-7a1/tests.log) · [Build](../../output/phase-7a/release-7a1/build.log) · [Original identity](../../output/phase-7a/release-7a1/identity-tested.json) · [Resumed source proof](../../output/phase-7a/release-7a1/resumed/resumed-source-proof.json).

**Release.** CLI 65.7.0 staged with `deploy --prod --skip-domain --scope penuels-projects-aa802b06`. The stage retained Vercel Authentication and the six required production environment names were present. Both staged maps passed before `vercel promote dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4 --scope penuels-projects-aa802b06`. Promotion reused that Production build. Inspection of the public domain returned the same deployment ID. No credentials, limits, GitHub connection, deployment-protection setting, or design assets were changed. [Promotion identity](../../output/phase-7a/release-7a1/resumed/production-promoted.json).

| Actual hosted flow | Protected stage | Fresh unauthenticated public browser |
| --- | --- | --- |
| Find Support → Portland, OR → Healthcare / Clinics → 10 miles | HTTP 200, Oregon / Multnomah County, 20 real mapped records | HTTP 200, same location and 20 real mapped records |
| Give Support → Explore local providers → Philadelphia, PA → Food assistance → 10 miles | HTTP 200, Pennsylvania / Philadelphia County, 20 real mapped records | HTTP 200, same location and 20 real mapped records |

Each flow used the actual hosted API, without fixture replacement. All four map checks rendered real tiles and 20 matching markers. Marker selection returned mobile users to the selected card with focus; card selection updated the desktop marker. Directions matched each response record by stable ID and coordinates. Each explicit mobile search scrolled its loading status once. Both 390 × 844 and 1440 × 900 checks had no horizontal overflow. Map attribution was visible and desktop columns measured 582 px each. Captured browser JavaScript exception and console-error lists were empty. The public browser had no Our Ground authentication/protection cookies.

| Evidence | Resident | Giving |
| --- | --- | --- |
| Staged live search and map | [Search](../../output/phase-7a/release-7a1/resumed/stage-resident-search.json) · [Map](../../output/phase-7a/release-7a1/resumed/stage-resident-map.json) | [Search](../../output/phase-7a/release-7a1/resumed/stage-giving-search.json) · [Map](../../output/phase-7a/release-7a1/resumed/stage-giving-map.json) |
| Public live search and map | [Search](../../output/phase-7a/release-7a1/resumed/public-resident-search.json) · [Map](../../output/phase-7a/release-7a1/resumed/public-resident-map.json) | [Search](../../output/phase-7a/release-7a1/resumed/public-giving-search.json) · [Map](../../output/phase-7a/release-7a1/resumed/public-giving-map.json) |
| Public screenshots | [Desktop](../../output/phase-7a/release-7a1/resumed/public-resident-desktop-map.jpg) · [Mobile](../../output/phase-7a/release-7a1/resumed/public-resident-mobile-map.jpg) | [Desktop](../../output/phase-7a/release-7a1/resumed/public-giving-desktop-map.jpg) · [Mobile](../../output/phase-7a/release-7a1/resumed/public-giving-mobile-map.jpg) · [Reviewed donation action](../../output/phase-7a/release-7a1/resumed/public-giving-donation.jpg) |

**Giving evidence.** On both origins, the browser opened exactly `https://saintjohnshospice.org/donate/` in a protected new tab. The official homepage source and `2026-11-04` check date remained visible, and the search URL retained `intent=give`. The public result set had one reviewed donation action and zero donation actions on ordinary mapped cards. No external forms, calls or donations were submitted. The unchanged deterministic tests and prior offline archived-record check preserve the conflicting Mazzoni website fallback; matching was not loosened. The current food-result Mazzoni listing supplies no website or phone and correctly shows the missing-information explanation. [Giving safeguards](../../output/phase-7a/release-7a1/resumed/public-final-browser.json).

**Public assets and pages.** All six routes `/`, `/support`, `/give`, `/about`, `/account`, and `/organizations` returned 200. A fresh mobile browser rendered the homepage, Give, About, Account and Organizations pages with loaded visible images and no overflow or JavaScript exceptions. All **36 approved public assets**, including all seven favicons and photographs, retained their SHA-256 hashes on both origins. All **30 JS/CSS assets** were byte-identical to the tested local build, including entry `/assets/index-BUlyeTb7.js`. The server-key and Redis-value exclusion check passed against every client bundle. [Stage assets](../../output/phase-7a/release-7a1/resumed/stage-statics.json) · [Public assets](../../output/phase-7a/release-7a1/resumed/public-statics.json) · [Browser pages](../../output/phase-7a/release-7a1/resumed/public-browser-pages.json).

**Provider allowance.** The first staged session used four additional server requests. Its temporary browser and files were cleared before resumption, so its loaded pages could not be reused. The owner explicitly increased the Phase 7A.1 cap from eight to **12 total** to permit replacement staging checks. The resumed guard allowed exactly four query/phase combinations, once each, reserving at most two provider requests per submission. Redis daily admissions on day 20762 measured **0 → 2 → 4 → 5 → 6**. The two replacement staged searches used four requests; the two public searches used two more with existing geocode-cache reuse. **Phase 7A.1 total: 10 server provider requests (four earlier + six resumed), within the approved 12.** The shared 200/day ceiling remained intact, with 194 remaining at the final read. Counters were never reset. [Original submission ledger](../../output/phase-7a/release-7a1/search-dispatch.ndjson) · [Resumed guarded ledger](../../output/phase-7a/release-7a1/resumed/resume-dispatch.ndjson) · [Final Redis read](../../output/phase-7a/release-7a1/resumed/quota-after-public-final.json).

Browser map traffic was measured separately: **44 successful resource responses** were captured across the four resumed interactive-map windows (12 Portland + 10 Philadelphia on each origin), including worker vector tiles. Earlier style checks recorded two staged 401 responses and one public 200. The resumed staging preflight returned 200 after the owner saved the exact rule. Cleanup made three uncached style probes: an initial staging probe before rejection had propagated, then the final staged/public pair described below. These are observed browser resources, not a billing-total assertion; later viewport activity outside capture windows is not included.

The resumed harness initially blocked a search because it checked `radius` rather than the application's `radius_miles` parameter. That attempt was stopped before network dispatch and consumed no provider admission. Its corrected guard then completed the permitted search. A donation-tab check initially lacked a native user-gesture flag; the corrected check reused the loaded response and page. No application change or repeated provider search was needed. The iCloud checkout was hydrated in place to read existing evidence and configuration.

**Temporary referrer cleanup.** macOS rejected automation of the owner's dashboard with error `-1743`. After successful public verification, the owner removed and saved only the exact temporary rule below. The initial uncached probe did not yet reject staging. One bounded follow-up returned **401** from staging and **200** from production with the same browser key. No server provider requests were used for cleanup. [Removal verification](../../output/phase-7a/release-7a1/resumed/referrer-cleanup.json).

```
^https://ourground-cfiaqimgw-penuels-projects-aa802b06\.vercel\.app/.*$
```

**Remaining coverage limitations.** Nationwide discovery reflects qualifying mapped listings within the selected radius and is not a complete inventory of assistance. The sourced directory remains Pennsylvania-only. Its Philadelphia request returned the existing 503 availability response, shown separately while all mapped results and giving actions remained usable. Reviewed giving destinations require exact identity evidence; unresolved Mazzoni records remain unmatched. Authentication/database onboarding and further features were outside this release.
