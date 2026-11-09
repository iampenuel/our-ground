# Production discovery repair — verified release

29 October 2026. **Public resource discovery and the interactive map are working.**

Public URL: **https://ourground.vercel.app/support**  
Released deployment: **`dpl_5kKCpNP44CYPUNs9zBzmippm2dz4`**  
Tested Production build: https://ourground-ffpms5pg4-penuels-projects-aa802b06.vercel.app

## Proven cause

The deployed Upstash configuration was malformed. The original Philadelphia request returned complete HTTP 503 JSON (`DISCOVERY_PROTECTION_UNAVAILABLE`) with `Retry-After: 60`, while `/geoapify/status` misleadingly looked healthy because it checks activation only.

1. The first diagnostic Production stage logged `URL_INVALID` before making any Redis request.
2. Replacing only Production `UPSTASH_REDIS_REST_URL` from the validated local configuration cleared URL validation. The next stage logged `TOKEN_INVALID`: the stored token contained whitespace or wrapping quotes prohibited by the validator.
3. Replacing Production `UPSTASH_REDIS_REST_TOKEN` from the already-tested local configuration cleared protection errors. The next Production stage returned 19 real Philadelphia clinic/practice results and one Harrisburg food-assistance result.

Both values were supplied securely through CLI stdin. No key was rotated and no credential value was printed. The precise original invalid URL component was not exposed or retrieved; the runtime validation failure and successful isolated correction establish the configuration cause without disclosing secrets.

The allowlist hypothesis was ruled out. Authenticated reads of the **deployed** runtime and limiter source established the actual chain: `api/index.ts` → `productionDependencies()` → `createGeoapifyProvider({env:process.env})` → `createDiscoveryLimiter(env)`. No filter drops the Upstash values. The correct Geoapify provider serves the route; the legacy Google handler is unrelated. Production variables were assigned to Production. Successful staged calls prove activation, server-key propagation and real Redis EVAL admission at runtime.

## Exact changes

| File / configuration | Change |
| --- | --- |
| Vercel Production `UPSTASH_REDIS_REST_URL` | Replaced malformed value with the validated existing local endpoint; kept Secret type. |
| Vercel Production `UPSTASH_REDIS_REST_TOKEN` | Replaced malformed value with the validated existing local token; kept Secret type. |
| `backend/geoapify-limits.ts` | Allowlisted server-side failure reasons, explicit token-format validation and cancellation handling, safe malformed-response handling. |
| `src/support-search.ts` | Distinct failed-search result instead of successful empty results. |
| `src/support-page.ts` | Announces failure with retry controls; no misleading “0 matching records” or empty-results panel. |
| `tests/production-geoapify.test.mjs` | Real API entrypoint with mocked transports verifies Production configuration propagation and complete success/429/503 JSON bodies. |
| `tests/geoapify-limits.test.mjs` | Failure reasons, no outbound provider calls on rejection, actual deadline, cancellation, and shared mocked admission. |
| `tests/unified-support.test.mjs` | Failed discovery/resolution differs from honestly empty results and cannot trigger an automatic fallback. |
| `tests/geoapify-redis.integration.mjs` | Corrected EVAL key indexes; random namespaces cover both client and global keys, 120-second maximum test retention, bounded cleanup, explicit SKIPPED prerequisite message. |
| `docs/implementation/production-discovery-repair.md` | This report. |

For staged map testing, temporarily added only `^https://ourground-ffpms5pg4-penuels-projects-aa802b06\.vercel\.app/.*$` to the **browser** key’s allowed HTTP referrers, then removed it after verification. The original localhost and public-domain entries remain. No wildcard Vercel origin, server-key exposure, or permanent map-key change was introduced.

The atomic Lua script, shared 200/day provider budget, two/second provider limit, per-client limits, HMAC privacy protections, production fail-closed behavior, and **2,500 ms timeout** remain intact. Redis errors still return 503; actual exhaustion still returns 429 with Retry-After. No retries, limit increases, provider changes or fictional substitutions were added.

## Validation

| Check | Result |
| --- | --- |
| `npm test` | **PASS: 75 tests, 0 failures, 0 skipped.** Deterministic/mocked checks include existing directory, identity, permission and discovery safeguards. |
| `npm run build` | **PASS**, including public environment boundary and both TypeScript checks. Used the documented sequential memory-aware environment: `GOMEMLIMIT=128MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=256`. No OS-killed build attempts. |
| Real Redis isolated admission | **PASS:** actual EVAL returned `[1,0]` in 192 ms, not merely PING. |
| Explicit Redis integration | **PASS:** two instances, 12 concurrent reservations admit exactly two remaining daily permits; eight client searches admit six. Corrected fully isolated run: 25 REST requests, zero Geoapify calls. |
| Failure protection | **PASS:** missing configuration, malformed URL/token, Redis authorization/command/network errors, malformed JSON/results, timeout and cancellation block subsequent Geoapify calls. Full 503/429 JSON and Retry-After checked. |
| Staged live API | **PASS:** Philadelphia `medical_clinic`, 10 miles → 19 records; Harrisburg `food_assistance`, 10 miles → Central Pennsylvania Food Bank – Harrisburg Branch. |
| Result integrity | **PASS:** PA coordinates, supported categories, radius, real-data kind, attribution and safe directions/website URLs checked against actual returned JSON. Philadelphia response supplied 10 website and nine phone actions. No eligibility, free-care or service verification claim is made. |
| Staged browser | **PASS:** real tiles, 19 markers, card→marker and marker→card selection. The initial map 401 was isolated to the staged referrer restriction; public-origin style already returned 200. |
| Public API, no authentication | **PASS:** complete HTTP 200 JSON for both required searches, again 19 and one records. |
| Public desktop/mobile | **PASS:** 1440×1000 and 390×844 checks, actual tiles/markers, both selection directions, map/list toggle, mobile marker selection returning to its card, Harrisburg map location. Mobile document width equals viewport width (390 px). No captured console errors. |
| Fresh Chrome Incognito | **PASS:** opened a new Incognito window, used only the public URL without owner login or bypass, received 19 records, saw real map tiles and verified matching card/marker selection. |
| Directions | **PASS:** the public food-bank directions URL opened Google Maps with the matching Central Pennsylvania Food Bank destination at 3908 Corey Road. Website/phone hrefs are source-derived and safe; no calls were placed. |
| Client secrets | **PASS:** environment boundary passed; built client contains the browser map key and excludes local server key, Redis URL and token. No private keys were added to frontend code. |

An initial new test assertion used an incorrect EVAL array index; it was corrected before the passing full suite. The original integration test also had incorrect key indexes: its first run used isolated global keys but documentation-range synthetic client identities under the normal prefix. Those short-lived client counters expired naturally; no production counters were reset. The final integration run isolates both key types and passed.

Approximately **13 application search submissions** were made across diagnosis, staging and public verification: four failed before outbound provider access, nine succeeded (at most 18 Geoapify backend calls; caching may reduce this). Redis-only diagnostics used 51 REST calls total across the one-command probe and two bounded integration runs. Map styles/tiles/glyphs/sprites were separate browser traffic from a small number of normal map loads and selection checks. No load test or intentional live-budget exhaustion was performed.

## Release provenance and limitations

- Verified local link and authenticated CLI: account `iampenuel`, team `penuels-projects-aa802b06`, project `ourground`, ID `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`, Node 24.x. Local Node: 24.22.1; CLI: cached 65.7.0. `npx --offline` could not resolve registry metadata, so the same installed CLI was invoked directly, with no upgrade.
- Baseline: `dpl_CcvFEr7rBPzwPdh2qvLmpH2Z2uAt`, `ourground-osaz7oip4-penuels-projects-aa802b06.vercel.app`. Its search was broken; it is not a known-good functional rollback.
- Diagnostic Production stages: `dpl_EMAqQ7SujW8XH9FaEcs6j3A1vCM4` (`URL_INVALID`) and `dpl_2oNwQTD6BTKGSqdiDic89de7ktCg` (`TOKEN_INVALID`). Neither was promoted.
- All stages used `deploy --prod --skip-domain --scope penuels-projects-aa802b06`. The public alias was confirmed unchanged during staging. Vercel updated its generated project alias, while custom-domain assignment remained skipped. The verified third stage was promoted without rebuilding; public alias inspection confirms the released deployment ID above.
- The separate Our Ground sourced directory remains unconfigured/unavailable and is honestly labelled in the UI. Geoapify discovery and map work independently. No database, account permissions or billing setup was changed.
- Existing large-chunk warnings remain. Vercel’s separate function transpiler emits non-blocking TS2688 for the frontend `vite/client` type entry; the baseline build has the same diagnostic. Explicit frontend/backend typechecks and `npm run build` pass, and hosted API execution was verified independently.
- The Vercel connector lacked team authorization; the existing authenticated CLI worked. CLI runtime log queries returned no entries; the authenticated dashboard supplied the decisive structured logs. No inference of health was drawn from empty logs.
- Existing uncommitted source was preserved (base commit `3897dea703a7175e8ec57e1d7ba0f358dafc0221`). No Git commit/push, GitHub reconnection, redesign, new project, plan change, or `.env.local` overwrite occurred. Deployment documentation and Phase 6H build output were reviewed; no Phase 6H prose report was present.

Sanitized evidence is in ignored `output/production-discovery-repair/`: passing tests/build, deployment metadata, staged/public response bodies, and screenshots `staged-map.jpg`, `public-desktop-map.jpg`, `public-mobile-map.jpg`, and `public-incognito.jpg`.
