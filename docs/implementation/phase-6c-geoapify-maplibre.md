# Phase 6C — Geoapify + MapLibre unified discovery

Date: 2026-10-29. Local implementation and bounded live validation only. No deployment, Git push, database migration, billing change, or Gemini implementation.

## Architecture and preserved behavior

`/support` remains the single search, list, map, and selected-detail experience. `/discover` retains its compatibility redirect, including legacy term translation. The existing editorial design, photography, navigation, authentication, staff permissions, directory provenance, and fictional-demo protections are preserved. Baseline SHA-256 comparisons confirm no changes to the Give Support introduction photograph, photography files, landing page, About, Organizations, account, staff, database schema, or PostgreSQL repository in this phase.

The browser sends an explicit city/ZIP search to `/api/v1/geoapify/places`. The server geocodes it, asks for a choice if ambiguous, then makes one bounded Places request. That same center is reused for the independently sourced directory query. Geoapify and directory records have separate identities and source labels; similar names are not automatically merged. Discovered POIs are not saved to the database.

MapLibre GL JS 6.16.0 is the selected renderer, loaded dynamically with its CSS and Vite-bundled worker. The production browser fixture caught and corrected the v6 worker requirement: use `?worker&url` and `setWorkerUrl`, rather than relying on a worker next to the bundled main module. See [MapLibre installation](https://maplibre.org/maplibre-gl-js/docs/#installation). No competing Google or Mapbox renderer is initialized on `/support` or directory resource details. Geoapify's documented `positron/style.json` supplies the map. Google Maps is used only through external coordinate-based directions links.

Legacy Google adapters, their tests, and the Mapbox renderer/dependency are retained for controlled rollback; they are not part of the active frontend map bundle. The existing `places/resolve` directory-only fallback still uses the old configured Mapbox server geocoder outside explicit demo mode. In local demo mode it uses the documented local city fixtures. Replacing that fallback and removing inactive Mapbox/Google code are separate cleanup decisions after acceptance; no new paid provider was enabled.

## Categories and data safeguards

| UI choice | Geoapify category |
| --- | --- |
| Food assistance | `service.social_facility.food` |
| Clinics and medical practices | `healthcare.clinic_or_praxis` |
| General medical practices | `healthcare.clinic_or_praxis.general` |

The [Places documentation](https://apidocs.geoapify.com/docs/places/) also documents hospital, pharmacy, dental, and specialty categories. These were reviewed but not added as automatic searches or assistance substitutes. Clinic coverage includes commercial and specialist practices; it does not establish free care or suitability for a particular need.

Requests use a 5, 10, or 25 mile circle, a proximity bias, and a maximum of 20 results, with one selected category. The adapter checks the returned category, country/state, finite coordinates, radius, required name, and identifier. It rejects unrelated retail/catering, dental/pharmacy substitutions, invalid points, out-of-state locations, and unnamed records. Coordinates come from GeoJSON geometry; estimated distances are straight-line distances.

Geocoding uses the documented city/postcode types, country and Pennsylvania bounding filters, up to five choices, exact ZIP matching, and a confidence check when supplied. An ambiguous city cannot silently fall back to another geocoder. See [Geocoding documentation](https://apidocs.geoapify.com/docs/geocoding/).

Geoapify cards and details explicitly state that services, operation, food availability, costs, eligibility, appointments, donation acceptance, and partnership are unverified. Missing phone, website, hours, eligibility, and cost information is explicit. No additional paid detail lookup is made. Provider text is escaped. Geoapify, OpenStreetMap, and applicable map attribution are retained, including on empty or ambiguous geocoding outcomes. Demo mode makes no Geoapify calls, exposes no real-provider contact actions, and renders no fictional map pins.

## Key configuration and activation

The owner placed distinct keys in `.env.local`. `git check-ignore -v .env.local` confirms the `.env*` rule excludes it. No credential value was printed or added to source, documentation, or validation evidence. A value-blind scan confirmed distinct keys, the browser key compiled into the frontend, and no server key in browser bundles.

- `GEOAPIFY_SERVER_API_KEY`: server geocoding/Places only.
- `VITE_GEOAPIFY_BROWSER_KEY`: intentionally public browser map key, compiled into the frontend.
- `GEOAPIFY_ENABLED=true` and `GEOAPIFY_LIVE_APPROVED=true`: explicit server activation gates. Both default to false in `.env.example`.

`npm run dev:local:api` loads Vite's development-mode environment, merges process environment, and explicitly starts the existing in-memory demo directory on 127.0.0.1:18787. `npm run dev:local:web` uses development-mode Vite configuration on 18417. `npm run build` loads production-mode files, and `npm run preview:local` serves the built application on 18418 with the existing API proxy. Process variables take precedence. A changed browser key requires rebuilding production output; changing the server key or gates requires restarting the API.

For this authorized local activation the API was launched with the two activation gates in its process environment. The secret file was not rewritten. To reproduce activation after stopping it:

```sh
GEOAPIFY_ENABLED=true GEOAPIFY_LIVE_APPROVED=true npm run dev:local:api
npm run build
npm run preview:local
```

Use Node 24. The memory-aware build used process-local `GOMEMLIMIT=128MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=256`. This does not change project dependencies or compiler settings.

The environment guard rejects server-key names and matching server-key values under any `VITE_` name, including accidental reuse as the browser key. Error responses do not echo provider URLs or raw exceptions containing credentials.

In the existing Geoapify project, use API keys → Create a new API key (+) only if a second key is needed; no new account is necessary. Check browser allowed origins/referrers for `http://127.0.0.1:18417` and `http://127.0.0.1:18418`. Later allow only the exact approved Vercel site, not unrestricted previews. Restrict the server key to outgoing IPs where feasible. Geoapify supports IP/referrer restrictions; CORS configuration alone is not access control. See [Geoapify API key controls](https://myprojects.geoapify.com/help/api-keys/).

The account's actual restriction rules, plan selection, and remaining project credits have not been independently inspected. A successful localhost response proves the key works there, not that other origins/IPs are denied. These remain explicit owner verification requirements.

## Free usage and traffic limits

The documented Free allowance is 3,000 credits/day and five requests/second, shared by keys in the project. A geocode costs one credit, a Places query returning up to 20 costs one credit, and a map tile costs 0.25 credits. Free usage is not unlimited. See [pricing](https://www.geoapify.com/pricing/) and [credit accounting](https://www.geoapify.com/pricing-details/). No plan, account, or billing setting was changed.

The adapter bounds each process to two active requests, two requests/second, 12/minute, and 200/day. It keeps at most 100 geocode entries for ten minutes and 100 identical search entries for one minute, preserving attribution. These are memory-only caches; the [Geocoding](https://www.geoapify.com/geocoding-api/) and [Places](https://www.geoapify.com/places-api/) product documentation permits caching. No persistent POI store was introduced.

Typing, changing a category/radius before submitting, selecting a result, and panning do not initiate Places requests. A 750 ms identical-submit guard prevents immediate duplicates. Local result filtering and directory pagination do not repeat geocoding or Places. Provider failures have bounded timeouts and no automatic retries. Quota messages distinguish temporary rate limits from exhausted daily credits and offer directory-only recovery. Browser tile traffic is separate from the server budget and consumes the same project allowance.

## Interaction and responsive behavior

Desktop uses the existing list-left/map-right layout. On mobile, initial view is list-first with an explicit Map toggle; opening it focuses the map heading. Native keyboard-operable marker buttons share the same keyed selection as cards and expose pressed state. Selection focuses the details heading; Back to selected result returns focus to the card. All results remain usable without WebGL or tiles. Directory details use the same renderer only for non-fictional records and after an explicit map request.

Map bounds are limited to the Pennsylvania vicinity. Programmatic fit-to-results has zero duration; global reduced-motion CSS is preserved and MapLibre honors the platform preference for its interactions. No new decorative motion was added. Reduced-motion emulation is unavailable in this browser tool, so this was checked in the implementation rather than by changing the owner's system preference.

## Validation and live results

### Automated and browser checks

- `npm test`: **60 passed, 0 failed, 0 skipped**, Node 24.19.0. Final test log: `output/phase-6c-geoapify/tests-final.log` (63.8 seconds). Includes provider contracts, safe errors, geocode caching, relevance/radius checks, ambiguity, source identity, stale requests, environment boundary, authentication, anonymous-write denial, staff scoping, version conflicts, and Vercel adapter behavior.
- Full `npm run build` passed with environment checks and both frontend/backend TypeScript checks after the MapLibre worker correction. The final selected-pin stacking adjustment also passed a complete build; final refresh status is recorded below. Several compiler processes were terminated with signal 9 / exit 137 on this machine; these attempts were not counted as passes. The successful build used the memory-aware procedure and staged output before replacing the preview.
- Mocked browser checks exercised a real MapLibre renderer with a clearly marked offline style, keyboard card/pin synchronization, detail focus/return, local filtering, directory pagination, quota, permission, timeout, invalid-location, no-results, directory failure, and map failure. Switching to fictional mode made no further provider calls and hid the map. Invalid/mismatched ZIP tests are deterministic; no live invalid-ZIP traffic was spent.
- Live browser checks exercised real map tiles, 19 matching pins/cards, keyboard selection, selected source details, explicit missing-data text, attribution, Map toggle, zoom, and an external coordinate directions URL. Google Maps opened the destination coordinates; no live navigation or service availability was claimed.
- Inspected 1440×900, 768×1024, 390×844, and 320×700; no horizontal overflow. Map-open focus moved to its heading on mobile. Phone/tablet checks reused loaded live results rather than repeating Places requests.
- Homepage, Give Support, Organizations, About, Account, guarded staff editor, fictional resource detail, and `/discover` redirect rendered. The staff form stayed hidden without configured sign-in. Fictional resource details had zero map canvases and zero phone/directions links. Real Supabase sign-in and a real PostgreSQL connection were not tested: the existing local API intentionally uses its in-memory demo directory.
- Final live-map browser console showed no errors. Initial offline worker failures were corrected. One search during an API restart failed locally and recovered after the server reported ready; one Middletown attempt was blocked by the temporary six-request validation cap and was retried under a documented total cap of 12.

### Actual Geoapify results

| Search, 10-mile radius | Live result | Examples / coordinates |
| --- | --- | --- |
| Harrisburg, PA — food | 1 returned and displayed | Central Pennsylvania Food Bank - Harrisburg Branch, 3908 Corey Road; 40.2738756, -76.8224105 |
| Middletown, PA — food | Five city choices; explicit selection of the Dauphin County location, then 2 returned/displayed | The Lion’s Pantry, 922 West Governor Road, Derry Township; 40.2679589, -76.6731403. Also the Harrisburg food-bank branch. |
| Philadelphia, PA — healthcare | 20 returned, 19 named/category-valid points displayed | District Health Center 1, 1400 Lombard Street; 39.9443338, -75.1659035. Also Mazzoni Center, urgent-care and other clinic/practice records. |

Resolved centers: Harrisburg 40.2663107, -76.8861122; selected Middletown 40.1942806, -76.7314471; Philadelphia 39.9527237, -75.1635262. Returned GeoJSON and property coordinates agree within rounding precision; country/state and radius checks passed. These are provider-reported places and locations, not an independent audit of current operation or address correctness. The broad healthcare category also returned specialty/commercial entries such as weight-loss and telemedicine practices, and a professional-association listing tagged as a clinic. Those illustrate the source-quality limitation; they are not described as free assistance or verified providers.

A temporary local observer counted requests without recording URLs or credentials. Its sanitized output is `output/phase-6c-geoapify/live-provider-results.json`. At this pass, **12 server provider requests** were recorded: seven geocodes and five Places queries, all HTTP 200. This includes additional preview searches and repeated geocoding after the validation server restart. The observer imposed an initial six-request cap, then a total cap of 12 to complete interrupted validation. Additional Harrisburg preview traffic consumed the last two requests; the final page reload was therefore blocked by that temporary test cap. No further live validation retry was made. The observer was removed afterward and the normal API restarted with its application limits intact. No unbounded retry loop was used. Browser style/tile/glyph requests are not included in that count; total Geoapify account usage and remaining daily credits were not independently measured.

Measured individual provider response times were 616–947 ms for geocoding and 683–4,752 ms for Places. The final Philadelphia pair took 729 + 1,165 = 1,894 ms of provider response time, excluding UI/network scheduling and the directory query. Real map rendering was present at the next browser observation 22.3 seconds after Map was clicked; this is an observation upper bound, not a precise map-load benchmark. No performance improvement is claimed.

The renderer stays lazy: MapLibre main JS is 1,104.23 kB (298.14 kB gzip), its emitted worker is 518.98 kB, and map CSS is 71.33 kB (10.25 kB gzip). Vite reports the expected >500 kB warnings for MapLibre and the existing Three.js demo chunk. Neither map SDK nor worker is needed for the initial homepage or list-only presentation.

### Screenshots and local preview

- `output/phase-6c-geoapify/live-desktop-1440.jpg`
- `output/phase-6c-geoapify/live-map-768.jpg`
- `output/phase-6c-geoapify/live-map-390.jpg`
- `output/phase-6c-geoapify/live-map-320.jpg`
- `output/phase-6c-geoapify/live-middletown-list-desktop.jpg`

These screenshots contain real provider results. Deterministic test evidence is separately recorded in `browser-mock-checks.json`; route evidence is in `browser-route-checks.json`.

Owner preview: **http://127.0.0.1:18418/support**. Frontend, direct/proxied API, demo ZIP resolution, fictional search, and fictional details all passed the local readiness check (HTTP 200). Production preview and the local API remain running. The demo directory contributes no invented records to real search.

Final full build: PASS, exit 0; `output/phase-6c-geoapify/build-verified-retry.log`. This includes the last CSS adjustment bringing selected/focused pins above overlapping pins. Its staged output was switched into `dist` and the production preview restarted. Live screenshots precede only that final pin-stacking CSS adjustment; the renderer, provider code, and interactions are the same. Final readiness: all six checks passed, HTTP 200 (34–77 ms), recorded in `output/phase-6c-geoapify/readiness-final.log`. The proxied Geoapify status returned HTTP 200 with `enabled: true`. Normal local API, development server, and production preview are running.

## Deployment and Gemini

Not ready for public Vercel deployment yet. Local success does not establish account restrictions, a production directory connection, production Supabase redirect configuration, stable server-key egress restrictions, distributed abuse prevention, or a shared project quota budget. The process-local request limits reset on restart and do not coordinate multiple serverless instances. Browser maps share the provider account quota. These require a deliberate production configuration/review; no deployment was performed.

Gemini remains inactive. Future work must retrieve structured source-labelled data through the approved adapters, preserve unknowns and provenance, prevent invented eligibility/availability claims, and have separate cost and security approval. This phase implements no Gemini calls or architecture change.

## Exact implementation files changed

- `.env.example`
- `backend/app.ts`
- `backend/env-boundary.mjs`
- `backend/geoapify-api.ts`
- `backend/geoapify-discovery.ts`
- `backend/runtime.ts`
- `package-lock.json`
- `package.json`
- `shared/geoapify.ts`
- `src/geoapify-view.ts`
- `src/maplibre-support-map.css`
- `src/maplibre-support-map.ts`
- `src/resource-detail.ts`
- `src/support-model.ts`
- `src/support-page.ts`
- `src/support-search.ts`
- `src/support-view.ts`
- `src/support.ts`
- `src/unified-support.css`
- `tests/geoapify-fixtures.mjs`
- `tests/geoapify.test.mjs`
- `tests/unified-support-browser.html`
- `tests/unified-support-browser.ts`
- `tests/unified-support.test.mjs`
- `docs/implementation/phase-6c-geoapify-maplibre.md`

Build output and sanitized local validation evidence are in ignored `output/phase-6c-geoapify/`; production assets are in ignored `dist/`. Existing unrelated working-tree changes were preserved.
