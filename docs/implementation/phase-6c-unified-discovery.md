# Phase 6C — unified resource discovery

28 October 2026. Implemented locally. **No deployment, Gemini implementation, database changes, credential creation, or live Google calls.** `/support` is now the canonical search experience. Live provider behavior remains unverified until the owner configures and approves Google access.

## Modified files

This list is relative to the content-hash baseline captured at the start of Phase 6C, not the much older Git HEAD. Earlier uncommitted work was preserved.

| Files | Change |
|---|---|
| `src/support.ts` | Mount the unified search page, using existing public environment values |
| `src/support-page.ts` (new) | Unified form, source orchestration, status/recovery, selection, details, local filter, directory pagination and map toggle |
| `src/support-model.ts` (new) | URL state, compatibility conversion, namespaced result identities, source filtering, local keyword filtering and stale-request guard |
| `src/support-search.ts` (new) | Reuse discovery and directory APIs, reuse the Google-resolved center, isolate source failures |
| `src/support-view.ts` (new) | Consistent cards and directory selected-result preview, with explicit provenance |
| `src/unified-support.css` (new) | Scoped desktop list/map grid, responsive form and list-first mobile presentation |
| `src/discovery.ts` | Replace the old route with a parameter-preserving `/support` redirect |
| `src/discovery-selection.ts` | Extract generic keyed selection while preserving the existing discovery API |
| `src/google-discovery-map.ts` | Accept minimal map points from either source; retain the existing Google-only renderer |
| `src/discovery-view.ts` | Export the existing safe provider-attribution renderer for reuse |
| `backend/app.ts`, `backend/postgres.ts` | Optional directory `data_kind` filter, applied before count/pagination; retain server demo authorization |
| `.env.example` | Update the explanatory phase comment only; no values changed |
| `tests/unified-support.test.mjs` (new) | Nine focused orchestration, source-isolation, selection, cancellation and compatibility tests |
| `tests/unified-support-browser.html`, `tests/unified-support-browser.ts` (new) | Clearly labeled deterministic browser harness; never imported by production |
| This report (new) | Implementation evidence and owner activation checklist |

No dependencies were added. Package/lock files, deployment configuration, Google provider implementation, API entrypoints, authentication, staff workflows, shared resource contracts, photography and other routes are unchanged. In particular, `src/participate.ts`, `src/landing.css` and `src/photography.ts` match the starting baseline: the Phase 6B.1 Give Support introduction image placement is preserved. Audit: `output/phase-6c/change-audit.json`.

## Search flow

1. `/support` checks `/api/v1/discovery/status`. This makes no Google request. Missing configuration leaves real sourced-directory search available; it does not enable a fake Google experience.
2. The user submits a city/ZIP, Food or Healthcare, one approved support term and a 5/10/25-mile radius. Category/term changes and typing do not call providers.
3. When authorized Google discovery is available, the existing search API performs one geocode and one bounded Places Text Search. Ambiguous locations require an explicit choice; the existing API revalidates that choice before proceeding.
4. The returned center is reused for the directory query. There is no second Mapbox geocode for a successful Google search. Directory failure does not discard Google results. No Google matches does not manufacture replacements.
5. The page combines source-tagged records, sorts by estimated distance, and renders one list and one Google map. Local keyword filtering searches only the loaded names, addresses and directory summaries. It makes no provider requests.
6. Directory pagination is manual: 20 records per page, at most five pages/100 records. It retains loaded Google results and never reruns Places or geocoding. Google search remains capped at ten candidates before conservative relevance checks; there is no automatic provider pagination or term fan-out.
7. A directory selection links to its existing `/resources/:uuid` detail route with a safe return URL. A Google selection uses the existing Google details API, only on selection. Obsolete searches, detail requests and pagination responses cannot overwrite a newer search.

If Google search fails, the page shows its error and retry controls. It does not silently resolve an ambiguous/invalid city through another provider. The user can explicitly choose “Try sourced directory records only,” which uses the existing `/places/resolve` path. When Google is disabled from the outset, that existing resolver is used directly. The current local in-memory API resolves only Harrisburg/17101 and Philadelphia/19102; this is not statewide fallback coverage.

## Reused API contracts

| Endpoint under `/api/v1` | Purpose |
|---|---|
| `GET /discovery/status` | Existing readiness and public policy URLs; no secrets |
| `GET /discovery/places?q=…&term=…&radius_miles=…[&location_id=…]` | Existing Google Geocoding + Places search and ambiguity handling |
| `GET /discovery/places/:place_id?category=food\|healthcare` | Existing Google details, identity/category revalidation, returned website/contact/attribution |
| `GET /places/resolve?q=…` | Existing directory-only or explicit demonstration location resolution |
| `GET /resources?lat=…&lng=…&category=…&radius_miles=…&page=…&page_size=20&data_kind=…` | Existing directory search, with a new optional source filter |
| `GET /resources/:uuid` | Existing directory detail API, unchanged |

`data_kind=sourced_unverified` excludes demo records in the repository query, before pagination. `data_kind=fictional_demo` selects only fictional records and still requires server `allowDemo`. Omitting it retains the earlier API behavior. Unknown values are rejected. PostgreSQL filtering uses parameters; no schema or security rule changed. The new filter was exercised through the actual API handler with in-memory dependencies; a real PostgreSQL query execution remains untested locally.

Google IDs are never sent to UUID directory endpoints or staff workflows. Similar names remain separate. Keys are `directory:<uuid>` and `google:<place_id>`, so identifier collisions cannot merge sources.

## Map, selection and accessibility

Desktop uses adjacent result and map columns. At widths up to 900px the layout stacks and defaults to the results list. “Show map” explicitly loads and reveals the map; the current selection is preserved when hiding/showing it. Explicit bookmarked `view=map` is honored. Tablet and narrow mobile controls wrap without shrinking the touch targets.

One keyed selection controller connects result buttons, markers and details. Selecting either representation updates both; changing the filter removes markers for hidden results and clears a selection if it no longer exists. Focus moves to the selected detail heading; “Back to selected result” restores it to the corresponding result button. Mobile map activation focuses its heading. Loading/status text is announced, labels are explicit, and normal buttons/links are keyboard operable.

The Google SDK loads only when the map is visible, has matching non-demo points, the server readiness gate permits discovery and the browser key/map ID are present. The homepage does not import it. `/support` no longer imports the Mapbox renderer. `src/resource-map.ts` remains for rollback and existing resource-detail behavior; it is not activated alongside Google in unified search.

The renderer retains light styling, native Google credits, accessible Advanced Markers and nonanimated `moveCamera` updates. Existing reduced-motion CSS disables transitions/animations; no new animation was added. A map failure leaves the list and details usable. Reloading the page retries a failed SDK load; search and detail failures have their own visible retry buttons. A mock map does not establish that real Google map controls, tiles, credits or keyboard behavior work under the owner's configuration.

## Source trust and attribution

- **Our Ground sourced record:** labeled not independently verified; existing resource detail provenance and safety behavior remain authoritative.
- **Google Maps listing:** labeled services not verified. Returned third-party attributions and the official Google logo accompany Google content, including map-hidden states. Google location choices have attribution too.
- **Fictional demonstration record:** only after explicit checkbox/`mode=demo` selection, with a prominent warning. No Google calls or location map in this mode, and no real contact/directions actions are offered.

The shared warning explicitly says a listing does not confirm food availability, free care, eligibility, appointments, donation acceptance or partnership. No provider-specific generated image is added. The central `/about#ai-and-imagery` disclosure is unchanged.

Google content remains transient page memory. There is no new database/file/browser-storage persistence, ingestion, cache or staff edit action. Existing provider `no-store` behavior, bounded field masks, conservative relevance filters and request limits are retained. The current limits are two concurrent server requests, six per minute and sixty per day **per process**; map loads have separate provider accounting. These counters are not a public/serverless spending cap.

Policy references checked: [Places content and attribution policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Google Maps API security guidance](https://developers.google.com/maps/api-security-best-practices), and [accessible Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/accessible-markers). The live map must retain Google's native attribution and Google-derived locations must not be presented on the retained Mapbox search renderer.

## `/discover` compatibility

`location.replace()` forwards bookmarked `/discover` URLs to `/support`, so the obsolete page is not an extra history step. Legacy `q` becomes the city/ZIP `location`; supported term, category, radius, explicit demo mode and view are preserved. Unsupported distances normalize to 25 miles, and an unsupported/all category becomes an approved category. A legacy location-choice ID is not trusted across navigation: ambiguity is resolved again. There is no required navigation between two search products. The old standalone page module and harness remain as regression/rollback source, but the production `/discover` entry no longer mounts them.

## Owner checklist — safe local Google activation

All nine Google environment settings below were absent in the resolved development/production environment during implementation; both activation gates remained off. No values were printed. Cloud key restrictions, billing, quotas and policies therefore **could not be validated**, and no live calls were attempted.

1. Select the owner's intended Google Cloud project, confirm billing authorization and an acceptable small-test budget, and enable **Geocoding API**, **Places API (New)** and **Maps JavaScript API**. Review the field-mask pricing before authorizing search/details; contact fields can use a higher billing tier. Configure API quotas and budget alerts. Budget alerts alone are not a hard spending cap.
2. Create three separate restricted keys in Google Cloud. Restrict the first server key to Geocoding API, the second to Places API (New), and the browser key to Maps JavaScript API. Server restrictions must cover the actual approved outgoing IP/network; a browser HTTP-referrer restriction is not a server-key restriction. Verify the restrictions in Cloud before allowing requests; do not temporarily leave keys unrestricted to make a test pass.
3. Restrict the browser key to the exact intended local referrers, `http://127.0.0.1:18417/*` and `http://127.0.0.1:18418/*`. Add `localhost` variants only if those origins will actually be used. Do not add broad public host wildcards. Create/use a JavaScript map ID configured for the approved light style and Advanced Markers.
4. Approve and publish the owner's public HTTPS Terms and Privacy pages, including the relevant Google disclosures/links. The app's `safePublicUrl` check only validates URL shape; it cannot approve policy contents or verify ownership. Do not use test/example URLs as production policy approval.
5. Open `.env.local` directly in the owner's local editor. **Merge** these entries into the existing file; do not replace existing Supabase/database settings or paste secrets into chat. Fill blank values locally, keeping both gates false until the preceding checks and a bounded live test are explicitly approved:

   ```dotenv
   GOOGLE_DISCOVERY_PROJECT_ID=
   GOOGLE_GEOCODING_API_KEY=
   GOOGLE_PLACES_API_KEY=
   GOOGLE_DISCOVERY_TERMS_URL=
   GOOGLE_DISCOVERY_PRIVACY_URL=
   GOOGLE_DISCOVERY_ENABLED=false
   GOOGLE_DISCOVERY_LIVE_APPROVED=false
   VITE_GOOGLE_MAPS_API_KEY=
   VITE_GOOGLE_MAPS_MAP_ID=
   ```

   The Geocoding/Places keys are server secrets and must never use `VITE_` names. The `VITE_GOOGLE_MAPS_API_KEY` is intentionally delivered to the browser and must rely on API/referrer restrictions; it must not be either server key. `.env.local` and `output/` are Git-ignored; `.env*` and output are also excluded from the existing deployment upload rules. Confirm they remain untracked before any future commit/upload. Do not print environment files or use a shell command that echoes secrets.
6. Use Node 24 (`.nvmrc`, or the already installed `/Users/admin/.nvm/versions/node/v24.19.0/bin`). The existing `dev:local:api` and `dev:local:web` launchers use Vite's **development** environment resolution; `preview:local` uses **production**. Standard `.env` and `.env.local` participate, with mode-specific files taking precedence and existing process environment taking final precedence. Remove/resolve conflicting overrides locally without exposing them. Browser `VITE_` values are embedded at build time; restarting only the preview does not change a built key/map ID.
7. Run `npm run check:env`, `npm test` and a staged `npm run build -- --outDir output/phase-6c-live/staged-dist`. These checks do not call Google. Keep the current preview serving its existing `dist` while building. After a successful build, stop only the preview, retain the previous `dist`, move staged output into `dist`, then run `npm run preview:local` on 18418 again. Do not replace assets underneath an active presentation.
8. Only after the owner confirms the project/restrictions/policies/quotas and approves the limited live test, set both `GOOGLE_DISCOVERY_ENABLED=true` and `GOOGLE_DISCOVERY_LIVE_APPROVED=true` locally and restart the API. The current `npm run dev:local:api` is an explicitly fictional in-memory directory on 18787; it can exercise transient Google discovery without creating database records. Real mode in the unified UI filters out all its fictional directory records. A real sourced directory requires the separately configured PostgreSQL backend; do not change a real database into demo mode to hide failures.
9. Verify `http://127.0.0.1:18418/api/v1/discovery/status` reports enabled with the approved policy URLs. Open `/support`. Perform one **Harrisburg / Community food assistance** search, one **Philadelphia / Community health center** search and one **Middletown / Food pantry** search. Space searches and explicit details to stay within the existing six-provider-requests-per-minute budget: a normal search uses two calls, ambiguity choice revalidation uses additional calls, and each selected detail adds one. Do not run a scripted fan-out or leave automatic refresh running. Map loads are separately billable.
10. Record actual returned geography, relevance, source labels, list/marker synchronization, keyboard controls, native credits/third-party attribution, one detail and its actual website/directions, mobile map toggle and recovery behavior. Do not submit a contact, donation or edit as part of this read-only live validation. Mark failures as failures and retain the list fallback. Turn the local gates off/restart when the approved test window ends unless the owner explicitly requests ongoing enabled use.

This checklist does not authorize public deployment. No key/restriction or policy review was performed in Google Cloud during this phase.

## Validation and local review

| Check | Actual result |
|---|---|
| `npm test`, Node 24.19.0 | **49 passed, 0 failed, 0 skipped**, 100.412 seconds; the previous 40 tests remain passing |
| `npm run build -- --outDir output/phase-6c/staged-dist` | **Passed**: environment boundary, frontend/backend TypeScript checks and production output |
| `npm run check:preview` after startup | **6/6 passed**: frontend, direct/proxied health, demo ZIP, search and safe details |
| `git diff --check` | Passed |
| Four required viewports | 1440×900, 768×1024, 390×844 and 320×700 inspected; document width equals viewport width in each; images loaded |
| Mixed-source deterministic browser harness | Both sources together, list/marker selection, selected-state focus, details and correct Google directions Place ID, attribution, local filtering and directory-only pagination |
| Provider failure harness | Ambiguity selection, no results, invalid location, timeout, quota, permission, directory failure retaining Google results, explicit directory-only recovery, failed details removing links and successful detail retry |
| Map-failure harness | Three results and selected Google details remain usable when map initialization fails |
| Mobile harness | List-first with zero map mounts; keyboard selection and map toggle preserve selection; no horizontal overflow at 390/320px |
| Stale responses | A slow Harrisburg search could not replace a newer Philadelphia healthcare result; unit test also covers a transport ignoring cancellation |
| Built preview regressions | Home, Support, directory Details, Give, Organizations, About/AI fragment, Account and anonymous Staff rendered; Give has exactly one outreach image, in its introduction |
| Real/demo separation in built preview | Real-mode Harrisburg returned zero sourced records from the in-memory demo repository, without fictional substitution. Explicit demo mode returned its labeled fictional pantry; map/contact/directions unavailable |
| Authentication boundary | Account shows its configuration-unavailable state; staff form/save are hidden. Actual anonymous `GET /api/v1/services/:uuid` returned 401. Existing assigned/outsider/version tests still pass |
| Browser keyboard | Enter search, menu Enter/Escape, explicit demo opt-in, result activation, focus movement and mobile map toggle checked |
| Reduced motion | Shipped media rules inspected in the browser; camera changes are nonanimated. The browser tool has no media-emulation capability, so an OS-level reduced-motion toggle was not exercised |
| Production console | No error entries across the checked production routes. Injected harness errors are intentional test cases |
| Live Google, real PostgreSQL/Supabase, hosted Vercel | **Not tested**; configuration/owner activation or deployment approval is still required |

Representative Harrisburg food-assistance, Philadelphia healthcare and Middletown pantry interactions were **mocked**. Their invented places are labeled “do not visit” in a yellow-banner test harness. They prove contract/UI wiring, not real geography, live coverage or functioning Google credentials. The current real `/discovery/status` returned `{ enabled: false, terms_url: null, privacy_url: null }`.

An initial standalone TypeScript attempt ended with signal 9/no diagnostics on this memory-constrained host; the retry and full staged build passed. The successful build used process-local `GOMEMLIMIT=128MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=256`, with Node 24 prepended to PATH. No dependency or compiler configuration was changed. The pre-existing `/demo` 549.75 kB minified chunk warning remains. The unified support chunk is 20.73 kB / 7.18 kB gzip; the deferred Google adapter is 1.90 kB / 1.04 kB gzip. These are build sizes, not live SDK performance or Core Web Vitals measurements.

Development watcher restarts briefly interrupted harness loading; a fresh page after restart passed. Preview startup was also slow: the readiness probe attempted before it listened failed, and the post-startup check passed all six endpoints. The final preview is stable and serves the new hashed assets. The old `dist` was moved to `output/phase-6c/previous-dist` only after the staged build passed and the preview was stopped; the new build was then moved into `dist` and the preview restarted. No files were replaced beneath an active presentation session.

Logs: `output/phase-6c/tests.log`, `build.log`, `typecheck-retry.log`, `preview-check.log`, `browser-checks.json`, `production-browser.json`, `runtime-boundaries.json` and `change-audit.json`. Output artifacts are locally ignored, not added to public application assets.

### Verified preview and screenshots

- **[Unified Find Support — production preview](http://127.0.0.1:18418/support)**
- [Homepage](http://127.0.0.1:18418/) · [Give Support](http://127.0.0.1:18418/give) · [Organizations](http://127.0.0.1:18418/organizations) · [AI disclosure](http://127.0.0.1:18418/about#ai-and-imagery)
- [Clearly labeled mock harness, development only](http://127.0.0.1:18417/tests/unified-support-browser.html)

The existing local services remain running: production preview 18418, development 18417, explicit in-memory demo API 18787. No real service records are available from that demo repository. Select Demonstration options explicitly to explore the fictional directory flow.

| Screenshot evidence | Files |
|---|---|
| Actual configured-off production page | [1440 desktop](../../output/phase-6c/support-1440.jpg), [768 tablet](../../output/phase-6c/support-768.jpg), [390 mobile](../../output/phase-6c/support-390.jpg), [320 mobile](../../output/phase-6c/support-320.jpg) |
| Mixed-source **mock** results | [1440 desktop](../../output/phase-6c/mock-desktop-1440.jpg), [768 tablet](../../output/phase-6c/mock-tablet-768.jpg), [390 mobile](../../output/phase-6c/mock-mobile-390.jpg), [320 mobile](../../output/phase-6c/mock-mobile-320.jpg) |
| **Mock** map failure with usable details | [Map unavailable](../../output/phase-6c/mock-map-unavailable.jpg) |
| Actual explicit fictional mode | [390 mobile](../../output/phase-6c/demo-mobile-390.jpg) |
| Preserved editorial routes | [Home](../../output/phase-6c/home-1440.jpg), [Give introduction](../../output/phase-6c/give-1440.jpg) |

## Remaining public deployment blockers

- Owner-approved credentials, restrictions, policy URLs, billing controls and a successful bounded **live** Google validation; no claim of live discovery can be made from mocks.
- Shared/distributed abuse controls and quota protection for public/serverless use. Existing process-local counters can reset/scale independently. Review privacy/logging/monitoring and maps costs before public enablement.
- A deliberately configured real sourced directory, actual PostgreSQL execution of the source-filter query, and real Supabase OAuth/member-access checks. Unit tests do not prove hosted authentication or database access.
- Actual Vercel API rewrites/runtime, direct deep links, headers, environment scoping and asset/auth checks on an explicitly approved hosted preview; the earlier deployment-readiness report still applies.
- Live relevance/coverage and real Google map accessibility/attribution review. Conservative filters can omit legitimate programs, and source records with similar names are intentionally not identity-merged.

Gemini, public deployment and Mapbox removal are outside this phase. Servers remain local for review.
