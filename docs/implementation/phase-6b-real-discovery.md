# Phase 6B — editorial completion and real-place discovery

28 October 2026. **Implemented locally; Google live integration is blocked by missing configuration. Nothing deployed.**

The new `/discover` experience is separate from `/support`. It uses server-side Google Geocoding and Places API (New) interfaces and an on-demand Google Maps JavaScript renderer. The current preview explicitly shows discovery as unavailable. No paid provider request was made, and no fictional result is used as a fallback for live discovery.

## Changes made

| Area | Files | Result |
|---|---|---|
| Editorial imagery | `src/photography.ts`, `src/participate.ts`, eight new WebPs in `public/images/our-ground/` | Approved outreach image on Give Support; approved building on Organizations; responsive source selection |
| Disclosure | `src/info.ts`, `src/navigation.ts` | Accessible `/about#ai-and-imagery` section and shared footer link; redundant decorative captions removed |
| Discovery boundary | `shared/discovery.ts`, `backend/google-discovery.ts`, `backend/discovery-api.ts` | Separate transient provider types, location/category validation, explicit field masks, bounded calls and controlled errors |
| Existing backend connection | `backend/app.ts`, `backend/runtime.ts` | Optional discovery dependency and `/discovery/*` dispatch; existing directory handlers preserved |
| Discovery UI | `src/discovery.ts`, `src/discovery-page.ts`, `src/discovery-view.ts`, `src/discovery-selection.ts`, `src/google-discovery-map.ts`, `src/discovery.css` | City/ZIP and six approved terms, result list, optional map, shared selection, details, attribution and honest errors |
| Route/navigation | `src/main.ts`, `src/support.ts` | `/discover` entry and visible choice between the resource directory and Google place discovery |
| Configuration | `.env.example`, `backend/env-boundary.mjs` | Explicit opt-in/configuration gate; reject server Google/Gemini secrets under browser variable names or aliases |
| Attribution | `public/attribution/google-maps.svg`, adjacent README | Unmodified official Google logo with source and display requirements |
| Validation | `tests/discovery.test.mjs`, `tests/discovery-fixtures.mjs`, `tests/discovery-browser.html`, `tests/discovery-browser.ts` | Deterministic provider tests and isolated, clearly labeled browser harness; no production mock switch |

The working tree already contained earlier-phase edits and untracked files. A content-hash baseline was recorded before Phase 6B. Only ten existing files differ from that baseline (the files above that already existed); **no existing public asset changed**. No package, lockfile, database schema, repository implementation, resource contract, authentication implementation, staff handler, Mapbox renderer, or deployment configuration was changed in this phase. No dependencies were installed.

## Image integration

The attached `Our_Ground_Healthcare_Community_CODEX_READY.zip` was inspected before extraction: 13 entries, comprising eight WebPs and five documentation/review files. All eight image sizes and SHA-256 hashes matched the supplied manifest before and after copying. Files were staged and collision-checked; existing photography was preserved.

| Placement | Native master | Responsive derivatives | Loading |
|---|---|---|---|
| `/give`, existing editorial panel | Outreach: 1536 × 1024, 247,470 bytes | 1200 × 800 / 137,224 bytes; 780 × 520 / 79,900 bytes | Lazy, async decoding |
| `/organizations`, existing intro panel | Building: 2048 × 1377, 1,096,706 bytes | 1200 × 800 / 354,870 bytes; 780 × 520 / 170,920 bytes | Eager, async decoding |

The existing frames crop with `object-fit: cover`; intrinsic dimensions reserve space. `srcset` uses the supplied 780/1200/native widths. Neither image was enlarged or re-encoded. The two optional wide alternatives are retained but unused. The pack's review sheet is not served as webpage content. Although its documentation references PNG originals in a fuller package, **this ZIP does not contain those originals**.

Both images are decorative (`alt=""`). The central disclosure explains that they are AI-generated imagined scenes, not actual providers, facilities or events. It separates sourced directory information from imagery, identifies Gemini as planned/inactive, and asks users to confirm service details. Existing provider-specific and fictional-demo notices remain.

Part A was tested before discovery implementation: **27/27 tests passed** and the production build passed on retry. Desktop/mobile images, lazy/eager behavior, direct fragment focus and caption removal were inspected. The new images also loaded successfully at 768 and 320px; no horizontal overflow was observed.

## API contracts

All routes below are under `/api/v1`, return JSON with `Cache-Control: no-store`, and support GET only. They do not use the resource repository or write to PostgreSQL.

| Route | Input | Response |
|---|---|---|
| `/discovery/status` | None; no Google call | `{ enabled, terms_url, privacy_url }`; never credentials or project identifiers |
| `/discovery/places` | `q` city/ZIP, `term`, `radius_miles` 5/10/25; optional `location_id` | `status: "choose_location"` with up to five PA choices, or `status: "results"` with resolved location, term, radius and up to ten eligible places |
| `/discovery/places/:place_id` | Required `category=food` or `healthcare` | Revalidated place with optional returned website/phone; no fabricated hours, eligibility, costs or services |

Approved term keys are `food_pantry`, `food_bank`, `food_assistance`, `community_health`, `medical_clinic`, `free_clinic`. `shared/discovery.ts` is the source of truth for their displayed query strings.

Search performs **one geocode and, for an unambiguous location, one Text Search request**. If several locations are returned, the user must choose; the follow-up repeats geocoding and verifies that choice before searching. No autocomplete calls, broad query fan-out, pagination loops, ingestion or background prefetching are implemented.

Locations must have US/PA address components, valid PA-range coordinates and an eligible city/town/ZIP type. Partial matches are rejected. Five-digit ZIP inputs must match the returned postal component. Places require a usable Place ID, name, address, US/PA components, valid coordinates, distance within the chosen radius, category relevance and an `OPERATIONAL` business status. That status does **not** establish program availability. Known closed/moved details are rejected; IDs must match the requested identity. UUID-shaped directory identifiers are not accepted as discovery identifiers.

Food-assistance filtering requires explicit assistance wording in the returned establishment name and rejects major retail/restaurant primary types. A broad nonprofit type or submitted query alone is insufficient. Healthcare accepts medical-clinic/medical-center types or specific clinic/health-center naming and rejects unrelated primary types such as pharmacy, dental and veterinary care. These conservative heuristics will miss legitimate programs with less descriptive names; they are not verification. Live recall/precision still needs review.

### Trust and errors

- `fictional_demo`: existing examples, no real contact/directions actions.
- `sourced_unverified`: existing directory data; its existing provenance contract is untouched.
- `google_discovered`: new transient establishment data; labeled “services not verified,” never a verified partner.
- `staff_confirmed`: not introduced or inferred; there is no new evidence supporting that status.

Controlled responses include 422 for invalid/unresolved locations or unsupported inputs, 404 for ineligible details, 429 for provider/local quotas, 503 for missing configuration/permission/upstream failure, and 504 for timeout. Provider messages, URLs containing keys and response bodies are not reflected in errors. A failed detail revalidation removes contact/directions actions. Empty or unavailable Google results never fall back to the demo repository.

## Map, details and accessibility

`/discover` loads only Google Maps, and only after results exist and the user requests the map. `/support` retains its existing Mapbox integration. Google coordinates are never passed to Mapbox.

Advanced Markers and list buttons use the same Place IDs and selection controller. The selected list item and marker update together. Selecting a place focuses its detail heading; a return button restores focus to its list item. Asynchronous detail refresh preserves focus. Markers have descriptive titles, click/keyboard handling and 44px visual targets. Map failure retains the matching list and details. External links use escaped provider text, safe HTTPS destinations and explicit new-tab descriptions. Directions include the returned Place ID. No photos or business-hours fields are requested.

The existing design tokens, light palette and responsive navigation are reused. Camera changes use nonanimated `moveCamera`; the new page adds no animations. Existing reduced-motion CSS remains. Browser preference was normal motion during this pass, so a forced OS reduced-motion mode and real Google keyboard behavior are **not** claimed as live-tested.

## Google setup — owner action required before live calls

All four proposed Google credentials/map settings were checked for **presence only** and are absent. No key was created, guessed, printed or written. No billing, Cloud project or policy configuration was changed.

1. Select the intended Google Cloud project and record its project ID. Confirm billing ownership and authorize a small initial test budget. Enable **Geocoding API**, **Places API (New)** and **Maps JavaScript API** in that same project.
2. Create separate server credentials for Geocoding and Places, each API-restricted to its respective API. Keep them server-only. Restrict server egress IPs where supported. Vercel's ordinary dynamic egress must not be treated as a fixed allowlist: resolve controlled egress or a suitably secured proxy/authentication architecture before public enablement. This implementation currently uses API keys; it does not provision OAuth or fixed egress.
3. Create a distinct browser key restricted to Maps JavaScript API and exact approved HTTP referrers. For local testing approve only the necessary `http://127.0.0.1:18417/*`, `http://127.0.0.1:18418/*` and explicitly used localhost equivalents. Do not add broad `*.vercel.app` or unrestricted production referrers. Add actual owned hosted origins only when that deployment is approved.
4. Create the project's JavaScript map ID with a light map style. Set `VITE_GOOGLE_MAPS_MAP_ID`. The renderer explicitly selects LIGHT and leaves Google basemap attribution visible.
5. Publish and approve public Our Ground Terms and Privacy pages, including Google's required references and accurate data-handling/retention disclosures. Set their HTTPS URLs below. This phase has **not** invented legal policies or treated Google’s policies as a substitute for the site's own pages. Review host access-log retention/redaction for search strings as well as application behavior.
6. Establish low Cloud quotas and monitoring before enabling. Suggested initial plan: 5 requests/minute per web-service API, a shared application cap of 20 searches and 20 detail requests/day, and a separately approved small map-load allowance. Use the lowest applicable provider quota controls, billing alerts and a shared gateway/rate limit where quota granularity differs. Budget alerts are not hard spending caps. Review **Text Search Pro** and **Place Details Enterprise** pricing for the masks used here; contact fields raise detail billing. These are recommendations, not configured controls or an approved spending amount.
7. Complete the restriction/attribution/policy checks, then explicitly set both enable/approval flags. Restart the API and rebuild the frontend for browser-key changes. The flags are owner attestations, **not automatic proof** that Cloud settings or billing are correct.
8. Authorize a small manual live validation for Harrisburg, Philadelphia and Middletown. Confirm PA scope, food/health relevance, ambiguity handling, real map/list synchronization, marker keyboard behavior, attribution, legitimate contacts/directions, mobile layout, permission failure and usage costs. Never ingest the returned content into the directory. Do not enable publicly until these checks and distributed cost controls are complete.

| Environment variable | Location / purpose |
|---|---|
| `GOOGLE_GEOCODING_API_KEY` | Server secret; Geocoding API |
| `GOOGLE_PLACES_API_KEY` | Server secret; Places API (New) |
| `GOOGLE_DISCOVERY_PROJECT_ID` | Server; owner-selected project identifier |
| `GOOGLE_DISCOVERY_TERMS_URL` | Server; public owner-approved HTTPS terms |
| `GOOGLE_DISCOVERY_PRIVACY_URL` | Server; public owner-approved HTTPS privacy policy |
| `GOOGLE_DISCOVERY_ENABLED` | Server; defaults off, requires literal `true` |
| `GOOGLE_DISCOVERY_LIVE_APPROVED` | Server; requires literal `true` after setup approval |
| `VITE_GOOGLE_MAPS_API_KEY` | Public browser key, distinct and referrer/API restricted |
| `VITE_GOOGLE_MAPS_MAP_ID` | Public map identifier; needed for Advanced Markers |

The server can supply lists without browser map settings. The map then fails safely to the list. Missing server keys, approval flags, project ID or valid policy URLs keep the entire discovery provider disabled. An existing demo-mode API can host this separate capability later without relabeling its demo records.

## Cost, security, storage and attribution

Requests use explicit masks, capped results, no retries, 6.5-second per-provider timeouts, 15-second client request bounds, and cancellation of obsolete detail requests. A warm process allows at most two concurrent calls, six provider calls/minute and sixty/day, including geocoding and failed calls. These counters are **not distributed** and reset with a new process. They cannot protect a public serverless deployment alone; shared limits and Cloud controls remain a public-enable blocker. Maps JavaScript billing is separate from those server counters.

The application does not persist provider content to a database, file, localStorage, sessionStorage or service worker. It retains results only in the active page's memory. Place IDs have a documented storage exception, but no persistent Place ID store was added. Provider result strings are escaped before rendering; response caches are disabled. Search/details expose no staff edit action.

An unmodified official Google Maps logo is displayed with Google location choices, empty-result location text, results and details. Returned third-party attribution names/URLs are displayed. The actual map keeps Google's native credits. No Places photos, reviews or AI summaries are requested. Relevant requirements: [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [Google security guidance](https://developers.google.com/maps/api-security-best-practices).

## Validation evidence

| Check | Actual result |
|---|---|
| Part A tests, before discovery | 27 passed, 0 failed |
| Final `npm test`, Node 24.19.0 | **40 passed, 0 failed, 0 skipped**, 77.48 seconds |
| Final `npm run build` | **Passed** on retry: environment boundary, frontend/backend type checks and Vite production output |
| Existing suite | UUID/resource behavior, demo isolation, staff authorization/version checks and Vercel adapter tests still pass |
| Deterministic provider tests | All six terms; three representative cities; ZIP match; ambiguity; scope/distance/retail exclusions; duplicate/closed/moved/identity checks; safe links; no results; timeout/quota/permission; call budgets; secret boundary |
| Mock map integration | Marker-to-list and list-to-marker selection; stale-marker cleanup and removed-result protection |
| Browser harness | Search via Enter, details, selected-state/focus return, ambiguity choice, no results, invalid location, timeout, quota, permission, detail failure removing links, map failure retaining list/details |
| Responsive browser inspection | 1440, 768, 390 and 320px: discovery unavailable and populated mock states; no horizontal overflow; new photography inspected at the same widths |
| Actual local browser | Homepage, mobile menu Enter/Escape, directory search, fictional details, new photos, AI footer fragment/focus, unavailable discovery with zero Google scripts |
| Local workflow | `check:local` and `check:preview`: all six checks each passed, including direct/proxied API, search and safe demo details |
| Live Google / Supabase / Postgres / hosted Vercel | **Not tested**; missing credentials/configuration or not authorized |

The initial and some subsequent build/typecheck attempts ended with signal 9 and no TypeScript diagnostics. This host showed memory pressure and approximately 4 GiB free disk. The final successful build used process-local limits (no package/config edits):

```sh
PATH=/Users/admin/.nvm/versions/node/v24.19.0/bin:$PATH \
GOMEMLIMIT=128MiB GOMAXPROCS=1 GOGC=20 \
NODE_OPTIONS=--max-old-space-size=384 npm run build
```

The cause of the terminations is not conclusively established. Development hot reload and a navigation during build output replacement also interrupted browser loading; fresh post-build page checks succeeded. Avoid rebuilding while reviewing the static preview. The pre-existing `/demo` chunk warning remains (549.75 kB minified); new discovery JS is 12.20 kB / 4.54 kB gzip, with the map adapter separately loaded at 1.90 kB / 1.04 kB gzip. These are build sizes, not live Google SDK or Core Web Vitals measurements.

Logs and machine-readable browser evidence are under `output/phase-6b/`: `tests-final.log`, `build-final-retry.log`, `check-local.log`, `check-preview.log`, `part-a-browser.json`, `extra-photo-browser.json`, `discovery-browser.json`, `mock-sync.json`, `mock-responsive.json`, and `mock-error-states.json`. Fixtures and the harness live only in `tests/`; they are not imported by the production entry point or emitted as a mock application route. Mocked results **do not prove live discovery**.

## Local review and screenshots

- [Built preview homepage](http://127.0.0.1:18418/)
- [Discover places — correctly unavailable until configured](http://127.0.0.1:18418/discover)
- [Give Support](http://127.0.0.1:18418/give) · [Organizations](http://127.0.0.1:18418/organizations) · [AI disclosure](http://127.0.0.1:18418/about#ai-and-imagery)
- [Development preview](http://127.0.0.1:18417/)

The Phase 6A loopback-only commands remain `npm run dev:local:api`, `npm run dev:local:web`, and `npm run preview:local` under Node 24. The API is explicitly in-memory demo mode at port 18787; no database was changed. Servers are kept running for review.

Screenshots are in `output/phase-6b/screenshots/`, named by route and width. `mock-discovery-*.jpg` is visibly labeled **MOCK VALIDATION ONLY** and is evidence of UI wiring, not a real Google basemap or live establishments. The ordinary `discovery-*.jpg` screenshots show the true configured-off state.

| View | Desktop | Mobile |
|---|---|---|
| Give Support | [1440px](../../output/phase-6b/screenshots/give-1440.jpg) | [390px](../../output/phase-6b/screenshots/give-390.jpg) |
| Organizations | [1440px](../../output/phase-6b/screenshots/organizations-1440.jpg) | [390px](../../output/phase-6b/screenshots/organizations-390.jpg) |
| AI disclosure | [1440px](../../output/phase-6b/screenshots/about-1440.jpg) | [390px](../../output/phase-6b/screenshots/about-390.jpg) |
| Discovery unavailable | [1440px](../../output/phase-6b/screenshots/discovery-1440.jpg) | [390px](../../output/phase-6b/screenshots/discovery-390.jpg) |
| Mocked selection/details | [1440px](../../output/phase-6b/screenshots/mock-discovery-1440.jpg) | [390px](../../output/phase-6b/screenshots/mock-discovery-390.jpg) |

## Remaining work and next approval

The owner must supply the Google project, authorization, restricted keys, map ID, cost controls and approved public policies, then authorize the limited live check. Live relevance/coverage, Google rendering/keyboard behavior and contacts remain unverified. Do not advertise statewide completeness or Mid-Atlantic coverage. Keep Mapbox until Google passes live validation, then propose a separate cleanup; no Mapbox removal is authorized here.

Gemini remains planned and inactive. The typed, source-labeled discovery contract can support a later grounded assistant, but does not establish assistance eligibility or availability. No conversational AI, voice or autonomous actions were added.

Vercel deployment remains a separate owner approval. No deploy, push, migration, schema edit or public service launch occurred. Phase 6B stops at this local implementation and report.

## Technical references checked

- [Geocoding requests](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding)
- [Text Search method and rectangle restriction](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places/searchText)
- [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Place field pricing tiers](https://developers.google.com/maps/documentation/places/web-service/data-fields)
- [Accessible Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/accessible-markers)
