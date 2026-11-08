# Phase 6D — search results UX and approved map style

29 October 2026. Local implementation only. No deployment, push, dependency installation, account/plan change, database migration, authentication change, or Gemini work.

## Implemented behavior

The Find Support workspace now uses equal desktop columns instead of an asymmetric list beside a map and duplicate detail card. The separate inline detail section and its rendering/focus handlers were removed from the DOM and source. Standalone `/resources/:id` pages remain available through directory-card links.

Cards use a neutral cream background, a quiet border, and a muted-gold selected border. There is no selected green fill, glow, shadow, or scaling. A separate blue keyboard outline remains clearly visible. Native title buttons select locations; clicking noninteractive card space also selects. Directions, website and phone links keep their native behavior and do not select another result. External web links disclose that they open a new tab. No popover or replacement detail modal was added.

Each card includes the available name, mapped-category evidence or directory category, address, straight-line distance estimate, concise source/verification line, and appropriate actions. Directory cards retain their supplied summary and link to the full record and source. Real records have coordinate-based directions; fictional records have no contact/directions actions and explicitly say they are not visitable.

The existing Places response can now pass through optional website/phone fields when supplied. Only explicit HTTP(S) URLs without embedded credentials and syntactically valid phone numbers become actions; these are checked again while rendering. Missing fields stay absent. No website is inferred from a name, and no details API, extra geocode, database enrichment, or fabricated service information is used. Directory search responses do not contain contact/hours/eligibility fields; their existing standalone detail route remains the way to read that independently sourced information.

The broader uncertainty explanation is shared at results level. Geoapify/OpenStreetMap result credit is shared with the query; additional provider source credit remains on the relevant card. Unknown availability, operating status, costs, eligibility, appointments, donation acceptance and partnership are not represented as verified.

## Map style and interaction

The sole chosen style is **`osm-bright-smooth`**, using the existing browser key and the official endpoint:

`https://maps.geoapify.com/v1/styles/osm-bright-smooth/style.json?apiKey=…`

The existing lazy MapLibre renderer and explicitly bundled v6 worker remain. The style's automatic Geoapify, OpenStreetMap and OpenMapTiles attribution is preserved. These credits arrive through TileJSON metadata; a redundant custom fallback was removed after live validation exposed duplicate credit. See [Geoapify map styles and attribution](https://apidocs.geoapify.com/docs/maps/).

Markers stay forest-green. Selection uses a muted-gold border without glow and a raised stacking order; keyboard focus has its own outline and stacking priority. Zoom targets are 44px. Card selection centers the matching marker with duration zero. Marker selection reveals its card by scrolling only the desktop list, retaining focus on the marker. On mobile it returns to the list and focuses that card's title button. Reopening the map preserves selection and centers it. A ResizeObserver resizes the renderer when its container changes, and is disconnected on destruction.

Programmatic selection and fit-to-results do not animate. Shared reduced-motion rules remain, and card transitions explicitly disable under `prefers-reduced-motion`. The browser tooling does not expose motion-preference emulation; this portion was verified in source rather than claimed as an emulated browser test.

## Responsive workspace

At desktop widths above 900px, CSS Grid uses `repeat(2, minmax(0, 1fr))`, a 24px gap, and `clamp(32rem, calc(100dvh - 10rem), 42rem)` height. The list and map share top and bottom edges. The list has an independently scrollable body, a stable heading/count, and accessible pagination outside its scrolling body. Normal page scrolling is not captured; the list is keyboard-focusable and Tab exits normally. One-result cases retain the balanced workspace without stretching the card.

Measured browser dimensions:

| Viewport | List region | Map region | Behavior |
| --- | --- | --- | --- |
| 1440 × 900 | 582 × 672px | 582 × 672px | Equal bounded regions |
| 1024 × 768 | 453.91 × 608px | 453.92 × 608px | Fractional-pixel rounding only |
| 768 × 1024 | Full-width natural list | Explicit full-width map | List first |
| 390 × 844 | Full-width natural list | Explicit full-width map | 44px card actions |
| 320 × 700 | Full-width natural list | Explicit full-width map | No horizontal overflow |

Below 901px there is no independently scrolling list. Map opens above the list with a visible Back to list action, and its heading receives focus. Map selection and Back to list restore a useful list focus position. No secondary detail panel exists in any layout.

## Category safeguards

The existing food query already required `service.social_facility.food` or a true child category. The misleading part was presenting that query match as the generic service label “Food assistance.” The new shared evidence helper makes the distinction explicit:

- Specific food-category match: “Mapped category: food-related support.”
- Explicit food plus healthcare categories: “Mapped categories: food-related support & healthcare.”
- Clinic/practice match: labelled as a mapped clinic or practice category, without claiming free care.
- Missing/unsupported category evidence: “Mapped location · category unconfirmed.”

Generic social-service categories, healthcare-only POIs, and similar-looking prefixes such as `foodstore` are not accepted for a food search. Legitimate dual-category records remain useful but unverified. Names such as Mazzoni Center or St. John's Hospice are not used as a speculative blacklist or as evidence of current services. Deterministic regression fixtures cover these cases. Existing category/radius/country/coordinate checks and retail/catering/dental/pharmacy exclusions remain. No broader Places queries were added. See [Geoapify category semantics](https://apidocs.geoapify.com/docs/places/).

## Validation

- Final `npm test`: **63 passed, 0 failed, 0 skipped**, Node 24.19.0; 61.551 seconds. `output/phase-6d/tests-final.log`. Three new tests cover misleading category evidence, source-only safe contacts, and complete fictional-card safeguards. Existing selection tests also verify the selected style and zero-duration centering.
- The first full build was terminated during TypeScript checking (exit 137). The retry passed all environment/type checks and Vite bundling (29.53 seconds for Vite). A later build including the final small mobile adjustments was also terminated during TypeScript checking; its retry passed both type checks and bundled in 76 seconds. The subsequent attribution-only correction also passed a complete build; its final status is recorded below. Failures remain in logs and are not counted as passes.
- Offline browser fixtures exercised 21 cards/markers, overlapping points, card-to-marker centering, marker-to-card list scrolling, keyboard focus, local filtering, directory pagination, one-result and empty states, invalid location, timeout, quota, permission, directory failure, map failure, and fictional mode. Local filtering, selection and pagination did not repeat Geoapify calls. Map failure kept the complete cards and directions usable; fictional mode added no Geoapify calls and exposed no contact actions.
- Desktop selected-card computed styles were cream (`rgb(255,254,250)`), gold border (`rgb(181,138,55)`), `box-shadow: none`, with a separate visible focus outline. A selected marker was centered exactly in its map container. Keyboard PageDown scrolled the list, and Tab exited to a result button.
- Homepage, Give Support, Organizations, About, Account, guarded staff editor and fictional resource detail rendered without horizontal overflow or production console errors. The fixture Website link opened Example Domain without changing selection. Phone href formatting was inspected; no call was placed.
- The first readiness check ran before the restarted API finished loading and failed its API checks. After the API reported listening, all six checks passed (HTTP 200, 27–69ms). No database fallback or configuration change was used to conceal that startup delay.

Offline evidence: `output/phase-6d/browser-fixtures.json`, `route-checks.json`, `mock-1024.jpg`, `mock-map-768.jpg`, `mock-list-390.jpg`, and `mock-map-320.jpg`. These are explicitly labelled invented fixtures and offline maps, not live provider evidence. They precede only the final map-reopening, zoom-target, empty/demo status and attribution refinements; the final live captures include those changes.

## Exact modified files

- `backend/geoapify-discovery.ts`
- `shared/geoapify.ts`
- `shared/place-evidence.ts` (new)
- `src/geoapify-view.ts`
- `src/maplibre-support-map.ts`
- `src/maplibre-support-map.css`
- `src/support-page.ts`
- `src/support-view.ts`
- `src/unified-support.css`
- `tests/geoapify.test.mjs`
- `tests/unified-support.test.mjs`
- `tests/unified-support-browser.html`
- `tests/unified-support-browser.ts`
- This report: `docs/implementation/phase-6d-results-ux-polish.md`

Existing unrelated dirty-tree changes were preserved. Validation files/builds/screenshots are ignored under `output/phase-6d/`; `dist/` is generated and ignored. No photography files, shared design tokens, search orchestration, authentication, staff logic, database code/schema, environment values/names, package manifests or lockfile changed in this phase. `.env.local` remains Git-ignored; no key value was printed.

## Before public deployment

Vercel deployment remains **not ready**. Prior account restrictions/actual Free-plan status and remaining shared credits remain unverified. A production directory connection, Supabase sign-in/redirect setup, server egress restrictions, distributed rate limits and shared quota budgeting need review. Process-local provider limits reset on restart and do not coordinate serverless instances. Browser map traffic also uses provider credits. Real authentication and PostgreSQL were not tested against the deliberately in-memory local directory.

The intermittent local startup/compiler termination issue is still observable; no root-cause fix is claimed. The large lazy MapLibre and existing Three.js chunk warnings remain. Public service availability is not independently verified by this UI work.

## Final build, live check and owner preview

**Final build passed, exit 0**, including environment checks, frontend TypeScript, backend TypeScript and Vite production output. Log: `output/phase-6d/build-verified.log`; its warm Vite bundling stage took 598ms (not the duration of the entire command). There were two earlier TypeScript process terminations in this phase, retained in `build.log` and `build-final.log`. No compiler/dependency settings were weakened. The final output replaced `dist` only after success, and the production preview was restarted.

**Live validation passed.** Two explicit submissions of the same Philadelphia food-assistance search were made: the first exposed duplicate attribution, and the second checked its correction. Both displayed 20 real mapped locations and 20 matching markers. No broader query or paid details call was made. The second submission can reuse the adapter's ten-minute geocode cache; this phase did not install a network request counter, so no exact provider or browser tile/credit total is claimed. Responsive captures reused the second loaded result set without submitting more searches or reloading the map.

The final map visibly renders Philadelphia streets using the compiled `osm-bright-smooth` endpoint and existing key. It shows one set of “Powered by Geoapify | © OpenMapTiles © OpenStreetMap contributors” credit. The selected marker remains forest-green with a gold border, and stays above overlaps. On reopening at 320px it was centered within 1px. Zoom controls measure 44px; card actions measure at least 44px. All five requested viewport sizes have no horizontal overflow and no inline detail panel. The final production browser console contains **zero errors**.

Examples actually returned by this food-category search include Mazzoni Center (21 South 12th Street), St. John's Hospice (1221 Race Street), Youth Health Empowerment Project and Saint Mark's Food Cupboard. These are provider-supplied mapped food-category matches, **not independent verification that these organizations currently provide food assistance**. St. John's Hospice included an HTTPS website and phone; those supplied values appeared as native actions. Mazzoni's result supplied neither contact action, so neither was invented. Clicking St. John's Directions opened its coordinate destination in Google Maps while the previously selected Mazzoni card stayed selected. No phone call was placed and no service availability was independently confirmed.

Final evidence:

- [1440px desktop screenshot](../../output/phase-6d/live-desktop-1440.jpg)
- [1024px desktop screenshot](../../output/phase-6d/live-desktop-1024.jpg)
- [768px tablet map screenshot](../../output/phase-6d/live-map-768.jpg)
- [390px mobile cards](../../output/phase-6d/live-list-390.jpg)
- [390px mobile map](../../output/phase-6d/live-map-390.jpg)
- [320px mobile map](../../output/phase-6d/live-map-320.jpg)
- [Measured final responsive checks](../../output/phase-6d/live-responsive-checks.json), [public result-card evidence](../../output/phase-6d/live-cards.json), and [empty production error log](../../output/phase-6d/production-console.json).

A value-blind bundle check confirmed distinct configured keys, no server key in browser assets, the approved style compiled, and no `positron` endpoint in the active map module. Git whitespace checks passed. The 88-file code baseline identified exactly the 13 code/test files listed above; all other sampled code/configuration files were unchanged. The report is the fourteenth modified/added project file.

Final readiness checks: all six **HTTP 200**, 29–78ms, recorded in `output/phase-6d/readiness-final.log`. The temporary offline server was removed and the normal frontend development server restored on 18417. The existing API (18787) and production preview (18418) remain running.

Verified owner preview: **[http://127.0.0.1:18418/support](http://127.0.0.1:18418/support)**. No deployment was performed. Phase 6D stops here.
