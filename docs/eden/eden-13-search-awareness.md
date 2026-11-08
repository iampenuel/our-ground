# EDEN-13: Reading search results

On November 7, 2026, the [protected staging Preview](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) passed the same search-and-read sequence on desktop (1365 × 880) and mobile (390 × 844). The tool proposals were mocked. The page controller, search responses, directory totals, resource details, maps and rate limiter were real. No hosted Gemini inference was used.

Previously, EDEN treated an empty list of visible cards as “search not started.” Even when cards were visible, their number represented only the loaded page. Find Support now records the attempted filters and outcome together. A successful response with a valid total, including zero, is a completed search. A failed directory lookup cannot become an empty success; an optional map lookup cannot invalidate a successful directory count. EDEN compares the current controls with the attempted filters before reporting results.

| Hosted read or follow-up | Observed on both viewports |
| --- | --- |
| Harrisburg Food, 10 mi; Pittsburgh Food, 10 mi | 0 at each location. EDEN said the search completed, named the city, category and radius, explained that other community services may exist, and directed the visitor to the page’s existing Feeding America and 211 links. |
| Harrisburg after empty results | Refined to 5 mi: still 0 food listings. Switched to Healthcare: 2 listings at 5 mi; 3 at 10 mi. Location retained. |
| Philadelphia Food, 10 mi | 323 directory matches; 20 loaded. The count matched the authenticated API response. |
| Philadelphia keyword | An unsubmitted edit produced a filters-changed reply. Submitting “share” returned 1 listing. Leaving for Give Support and returning, then refining to 5 mi, preserved “share”; a different unmatched keyword returned 0 and EDEN named it. |
| Start, wait, failure and retry | Before searching: no search run. During a held real request: still loading. One intentionally invalid request received an actual HTTP 422; EDEN said no count was confirmed. A valid retry succeeded. The manual location resolver returned a real HTTP 429; EDEN reported the wait (43 s desktop, 29 s mobile), then read the successful retry. |
| Navigation, details and map | Leaving for About and returning restored the Harrisburg empty search. A real pin selected its card, the card highlighted its pin, and EDEN opened HHC- South Allison Hill’s published details. Geoapify tiles loaded at both sizes. |

The useful distinction is **directory coverage versus local availability**. An empty directory search does not establish an absence of services; even a populated listing does not establish hours or availability. EDEN can read the matched total and name up to five loaded results. On an explicit return to the same supported city, category and radius, keyword recall is held in page memory for up to 15 minutes; the page queries the directory again. This does not add a persistent conversation or transmit the keyword to Gemini.

Implementation:

- [Search outcome and replies](../../src/support-search-outcome.ts), [search transport](../../src/support-search.ts), [Find Support page adapter](../../src/support-page.ts).
- [Public navigation](../../src/eden/public-navigation.ts) and [Find Support navigation](../../src/eden/support-navigation.ts) for returning to the same search.
- [Regression tests](../../tests/eden-search-outcome.test.mjs), [hosted runner](../../scripts/eden/check-pa-preview.mjs), and [browser scenario](../../scripts/eden/search-state-scenario.js). The runner and the [coverage](../../scripts/eden/pa-preview-scenario.js) and [gap](../../scripts/eden/pa-gaps-scenario.js) scenarios resolve the shipped module paths from the authenticated build manifest.

TypeScript passed. On Node 24 the focused outcome, final support search, EDEN directory and support navigation suites passed **19/19**. The [desktop](verification/eden-13/hosted-desktop.json) and [mobile](verification/eden-13/hosted-mobile.json) receipts each contain 27 controller actions and 34 API responses. The browser checks compared replies with the submitted API filters and totals and verified the actual referral links.

The [Preview probes](verification/eden-13/preview.json) show anonymous requests redirected to authentication, authenticated health returned 200, and hosted Gemini session, speech and Live token endpoints returned 403 `EDEN_DISABLED`. The server function files matched the preceding deployment, which remains available for rollback. A [read-only directory comparison](verification/eden-13/directory.json) matched all 324 Philadelphia food and 43 HRSA healthcare records against the EDEN-12 inventory. No migrations, imports, production changes, billing changes or changes to local Gemini Live were part of this release.
