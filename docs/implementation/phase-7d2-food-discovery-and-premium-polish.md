# Phase 7D.2 / 7F — Food discovery and premium polish

Owner-facing date: November 5, 2026 (America/New_York). Some machine timestamps fall on November 6 UTC. Implementation is local in the recovered iCloud checkout. Production and the empty staging project are unchanged. No AI agent was started.

## Decisions

| Workstream | Decision | Evidence and limits |
| --- | --- | --- |
| Food discovery reliability | **Implemented; useful layered experience verified, coverage remains limited** | Genuine Harrisburg and Philadelphia mapped leads; real empty directory coverage; successful empty, disabled-source and provider-outage fallbacks distinguished. San Francisco food Places requests timed out twice within the unchanged 8-second deadline. |
| Institution media | **Implemented and locally verified** | Approved About illustrations replace the empty square; deterministic reviewed image/logo priority, exact identity checks, containment and failure fallback tested. No third-party institution logo is approved/populated yet; logo examples are technical fixtures. |
| Find Support polish | **Locally verified; live tiles BLOCKED** | Map default, explicit hide, source hierarchy, result scrolling, user interruption and reduced motion pass offline Chrome checks. Geoapify map style returns 401 even after the owner's local-key check. |
| Whole-site audit | **Complete for reachable local routes** | 20 desktop/mobile route checks; loaded media, no horizontal overflow, no JavaScript/CSP errors. Report-link focus issue found and fixed. Hosted authenticated workspaces remain unconfigured. |
| Security regression | **PASS locally** | 320 deterministic tests, full build/typechecks, source/build secret checks; unchanged security controls and migrations. This is not new hosted security verification. |
| AI-agent foundation | **Not ready to begin; not started** | Food provenance and fallback states are explicit. Provider availability and sparse food coverage must be first-class constraints. Live-map authorization and prior hosted/privacy gates remain unresolved. Resolve live-map authorization and retain these coverage limits before planning agent work. No pilot or agent release approval is implied. |

## Actual causes

1. The actual PostgreSQL clone contains **17,418 real healthcare records and zero real food records**. The two existing fictional test rows (one food, one healthcare) remain excluded by `ALLOW_DEMO_DATA=false` and the real-search filters. HRSA is healthcare coverage, not a food directory. No authorized national food-feed integration or reuse permission has appeared since Phase 7D.
2. The prior owner-preview process explicitly set `GEOAPIFY_ENABLED=false` and `GEOAPIFY_LIVE_APPROVED=false`. With no real food records, this necessarily led to referral-only searches. This phase's separately guarded local process enables optional Places. No saved secret or hosted flag changed.
3. The food query used only `service.social_facility.food`. It omitted the documented `amenity.give_box.food` category. Both are now requested in **one OR query** with the same circle/proximity filters, 5/10/25-mile choices and 20-result cap. Normalization independently rechecks explicit food evidence, country/state, finite coordinates, distance and excluded commercial/restaurant categories.
4. Disabled optional Places was treated as a partial failure. Repeated warnings, provider explanations and duplicated limitations separated the form from the results. Disabled, successfully empty and failed sources now have distinct typed state and copy.
5. Real San Francisco food requests hit the existing deadline. This is an observed provider availability limit, not proof that food assistance is absent. Genuine Harrisburg/Philadelphia queries succeeded with the same configuration.

## Food layers and behavior

- **Directory first:** nonfictional sourced/imported food records are ordered before mapped leads, then by distance within each layer. Healthcare retains its prior distance ordering. No fuzzy-name merging or fabricated records. Database pagination, keyword search and provenance are preserved.
- **Mapped supplements:** `service.social_facility.food,amenity.give_box.food`. Food-sharing boxes have a specific mapped category label. Generic `service.social_facility`, shelves for books, shops, restaurants and healthcare-only categories cannot establish food assistance. The generic social category is intentionally excluded because counseling, nursing homes and unrelated facilities fit it. This follows [Geoapify's categories and multiple-category contract](https://apidocs.geoapify.com/docs/places/).
- **Referral fallback:** existing Feeding America, 211 and USDA/USAGov options remain external referrals, not directory records. They are offered with mapped-only/partial/empty searches; a food search with no local records leads directly to them rather than an empty result panel. No location is appended to referral links.

Main summaries identify directory records, mapped leads or referrals. Failed sources remain visible in a short availability line; error details, source dates, representative-coordinate explanations and privacy options use native disclosures. No error is relabeled a successful empty search. Mapped results survive directory failure; directory results survive Places failure. Redis/admission failures remain fail-closed.

The service links and hotline numbers were cross-checked against [Feeding America](https://www.feedingamerica.org/find-your-local-foodbank) and [USAGov](https://www.usa.gov/emergency-food-assistance). The supplied `fna.usda.gov` URL and the FNS page returned 403 during research; the existing working USAGov pathway was retained. No directory was scraped or imported and no unsupported food coverage claim was added.

## Product changes

Map/list is the default on desktop **and mobile**; an explicit `view=list` and the user's Hide map choice are honored across resize and history. Empty results do not load billable map tiles. An unavailable map leaves the source-labeled list, directions and referrals usable.

Explicit searches reveal the loading summary when necessary, then continue to the actual map/list anchor or referral choices. Wheel, touch, pointer navigation, navigation keys, Tab, Escape, replacement requests and disposal cancel that continuation. Focus is not moved by search scrolling. History restoration, filtering and pagination do not repeatedly scroll the page. Reduced-motion uses immediate scrolling.

The location control uses a crisp shared 2px keyboard-visible outline without a fuzzy shadow. Static controls have no decorative glow. Card selection uses a narrow inset edge. Mapped subtype controls and lengthy provider text no longer interrupt the primary form. Card media is aligned beside the name, and card source dates are disclosed below visible verification labels. Detail pages use a deliberate square image and calmer source information; genuine needs-review/demo warnings remain distinct. The Report an issue anchor now opens its disclosure and leaves keyboard focus on the summary while retaining fragment navigation.

The approved landing page, photography, wordmark, favicon, giving semantics, organization authentication/authorization, and data ingestion were preserved. See the [media strategy](phase-7d2-media-asset-strategy.md) and [UI audit](phase-7d2-ui-audit-and-design-rationale.md).

## Verification actually performed

Node 24.22.1, `GOMEMLIMIT=64MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=192`.

| Check | Outcome |
| --- | --- |
| `npm test` | **320 passed**, 0 failed/skipped. Includes the preserved security, giving, location, rate-limit, provenance, map-selection and URL regressions plus 14 new food/media/scroll tests. |
| `npm run build` | **PASS**, frontend/backend typechecks and Vite production build. Existing lazy MapLibre/demo large-chunk advisory remains; no threshold or dependency changed. |
| Offline compiled Chrome fixtures | **15 groups PASS**: six source outcomes, 390/768/900/1440 layouts, default/hide map, marker counts, manual-scroll cancellation, reduced motion, keyboard focus, image priority/containment and bounded image-failure fallbacks. No external fixture traffic. |
| Site audit | **20 route/viewport checks PASS** (1440×900,390×844). Separate final interactions verify the corrected report focus, source disclosure, no invented privacy email, unconfigured accounts closed and protected external links. |
| Captured real result reuse | **PASS** giving context, Saint John's official donation link, Mazzoni discrepancy excluded, 19 directions links, Back/Forward/refresh and local filtering without provider calls. Explicitly replayed genuine results, not a fresh provider search. |
| Data preservation | **PASS**, all eight ordered HRSA table fingerprints match the original 7D data: 17,418 source services/locations/records/versions, 1,584 organizations, 1 import run, 17 source privacy holds/events. Migrations 001–013 match their journals and source. Read-only inspection only. |
| Approved assets | **PASS**, all 36 prior public assets byte-identical; no new third-party imagery or dependency. |
| Actual hosted Auth/TLS/Redis/CSP/privacy operations | **Still BLOCKED** as documented in Phase 7E; not represented as local passes. |

### Genuine provider observations

| Query/workflow | Actual outcome |
| --- | --- |
| San Fransisco autocomplete → explicit selection | **PASS**: Census correction, geographic ID 0667000, Geoapify city coordinates 37.7879363,-122.4075201; representative-area label retained. |
| Harrisburg food | Directory 0; **1 real mapped lead**, Central Pennsylvania Food Bank—Harrisburg Branch. |
| Philadelphia food | Directory 0; **19 real mapped leads**, including recorded food-category evidence. Leads are not independently verified services. |
| San Francisco food | Directory 0; **Places 504 twice**, under the unchanged 8-second deadline; referrals and specific unavailable-source messaging work. No deadline was raised. |
| San Francisco healthcare | **150 actual nearby HRSA records**, 20 shown; resource details/contact/directions and category media inspected. |
| Live map after owner key-settings check | **BLOCKED:401** from `maps.geoapify.com/v1/styles/osm-bright-smooth/style.json`. Browser sent Origin `http://127.0.0.1:18434`, Referer `http://127.0.0.1:18434/`. Sent key fingerprint matches the build and ignored local `VITE_GEOAPIFY_BROWSER_KEY`; no key is published. Response body was empty. No CSP violation or browser transport error was observed. |

Provider counts: **11 server dispatches of 12 guard**, including failures; **3 browser map style attempts of 60 guard**, all401. No automatic server retries. A read-only aggregate monitor reported 101 shared server reservations for UTC November 6, 200/day ceiling, 80% warning inactive. This aggregate includes other activity and is not attributed entirely to this phase. Browser maps and other consumers are separate; account-wide billing was not verified. All existing shared admissions, deadlines, limits, key separation and fail-closed behavior remain.

Initial diagnostics also found a loopback-origin mismatch after the proposed preview port was occupied. Only this phase's local process origin was corrected to 18434; the existing origin protection was preserved. The initial offline browser harness could not attach Fetch interception to a worker; the harness was corrected and the final fixture run passed with workers resumed and bounded. These diagnostics were not counted as live-map success.

## Preview, remaining limits and release boundary

[Local preview](http://127.0.0.1:18434/support). The verification process remains capped at 12 outbound server requests, with 11 used. New uncached searches can exhaust that guard and fail closed; screenshots and captured responses support repeatable review without more provider traffic. No limit was reset or relaxed. Live-map authorization needs resolution in the browser-key configuration; the recorded401 cannot identify the exact dashboard rule. The current public-key variable is populated and actually sent. Do not weaken CSP, origin checks or production restrictions to work around it.

No comprehensive national food directory exists in this checkout. A place's mapped food category can be wrong or stale, a food bank can require referral to a pantry, and a sharing box can be empty. The live San Francisco timeout illustrates why referrals and provenance remain essential. No real institution-specific photo/logo has been approved. Physical-device accessibility and a VoiceOver/NVDA session were not performed; evidence is real Chrome, its accessibility tree, keyboard behavior and emulated touch/layouts. Real authenticated organization workflows require the isolated hosted resources already listed in [Phase 7E owner actions](phase-7e-owner-actions.md).

Production readback remains deployment `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`, project `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`, updatedAt 1793860580927. No deployment, promotion, Git connection, push, hosted migration, secret change or production/staging configuration change occurred. The working tree was preserved; no commit/reset/stash was made.

## Changed files in this phase

- `backend/geoapify-discovery.ts`
- `shared/geoapify.ts`
- `shared/national-referrals.ts`
- `shared/place-evidence.ts`
- `src/design-tokens.css`
- `src/detail.css`
- `src/institution-media.css`
- `src/institution-media.ts`
- `src/resource-detail.ts`
- `src/styles.css`
- `src/support-model.ts`
- `src/support-page.ts`
- `src/support-scroll.ts`
- `src/support-search.ts`
- `src/support-summary.ts`
- `src/support-view.ts`
- `src/support.ts`
- `src/unified-support.css`
- `tests/food-reliability.test.mjs`
- `tests/geoapify.test.mjs`
- `tests/giving-links.test.mjs`
- `tests/institution-media.test.mjs`
- `tests/location-browser.html`
- `tests/location-browser.ts`
- `tests/location-live-guard.mjs`
- `tests/media-browser.css`
- `tests/media-browser.html`
- `tests/media-browser.ts`
- `tests/national-referrals.test.mjs`
- `tests/support-scroll.test.mjs`
- `tests/unified-support-browser.ts`
- `tests/unified-support.test.mjs`

Also added the three required Phase 7D.2 reports. This list is relative to the preserved Phase 7D.1/7E baseline, not the repository's older HEAD. Full hashes and sanitized browser/test evidence are in [the evidence index](../../output/phase-7d2-7f/README.md).
