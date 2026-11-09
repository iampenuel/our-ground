# Phase 5 — frontend performance diagnostics

2026-10-28 · Audit only · Local Node 24.19.0 · No code, dependencies, assets, environment, database or deployment changes.

## Finding and confidence

**Intermittent local serving stalls were reproduced independently of browser automation, but their root cause is not established.** Two unrestricted HTTP requests to the development root received no bytes before a 15-second timeout. Other requests completed in milliseconds. The existing production preview also had occasional roughly two-second responses, so the evidence does not isolate Vite transforms as the sole cause. The demo API was responsive in the sampled windows. Do not infer production database performance from this in-memory demo.

Three highest-value findings:

1. **REPRODUCED / MEASURED:** development root requests timed out twice at ~15 seconds, then returned in 4.005 seconds, 9.109 ms and 1.220 ms. This is a real local-serving problem, not merely an automation deadline. Production-preview first observed TTFB was 1.869 seconds, followed by four 1.1–1.5 ms repeats; a later concurrent probe again measured 1.936 seconds for its root. Root cause remains uncertain.
2. **MEASURED + source evidence:** demo health/search/detail requests were normally ~1–4 ms after an initial 8.7 ms direct health response. Search always resolves the location before querying resources, including filter, keyword and pagination changes. This is a concrete avoidable network dependency to examine with the real geocoder; it is not evidence that the current demo API caused the observed root-document stalls.
3. **MEASURED file weights + source evidence:** page photography is the larger known homepage payload opportunity (431,332-byte desktop hero; 989,630 bytes across three pathway images). The 549,755-byte Three.js demo chunk is isolated to `/demo`, and must not be blamed for the homepage without contradictory network evidence. Most editorial images lack width-based responsive candidates. No measured LCP or main-thread trace was obtained to quantify the effect.

## Method and evidence

Reused the already-running development frontend on `http://127.0.0.1:18417/` and explicitly fictional demo API on port 18787. They had been running about two hours when inspected. Served the **existing** `dist/` output on loopback port 18418 using installed Vite and Node 24, with the existing API proxy target. Did not rebuild, install packages or deploy. The artifact is a prior build, not a freshly certified reproduction of the working tree.

Evidence files:

- [Baseline source fingerprints](../../output/phase-5-audit/baseline-files.json)
- [Initial restricted-shell attempts](../../output/phase-5-audit/http-samples.json) — **excluded from application latency conclusions**
- [35 unrestricted HTTP samples](../../output/phase-5-audit/http-samples-unrestricted.json)
- [10 development/production comparison attempts](../../output/phase-5-audit/preview-http-samples.json)
- [Concurrent six-request stall probe](../../output/phase-5-audit/stall-probe.json)
- [Public raster dimensions and sizes](../../output/phase-5-audit/asset-metadata.json)
- [Existing production bundle sizes](../../output/phase-5-audit/bundle-sizes.json)
- [Browser DOM/layout observations](../../output/phase-5-audit/browser-observations.json), individual `*-metrics.json` and `*-dom.txt` files in the same directory
- [Full-page route coverage and screenshots](../design/phase-5-image-inventory.md#route-coverage)

HTTP timings use curl's reported HTTP status, `time_starttransfer`, `time_total` and body bytes. Each endpoint was sampled five times. These are loopback HTTP timings without throttling; they are not browser navigation timing or public-network benchmarks. The first request in each series is **first observed**, not a guaranteed cold process/cache. Repeat HTTP clients did not maintain a browser cache. True cold startup, cleared browser cache and repeat browser paint measurements were not controlled successfully; no cold-versus-warm Core Web Vitals claim is made.

The restricted shell could not reach localhost (immediate curl exit 7), while the browser could load it. Repeating read-only checks outside that sandbox produced HTTP 200 responses. That connectivity restriction is a tool-environment issue. In contrast, later unrestricted curl exit 28 timeouts are included as reproduced serving stalls. Browser snapshots also sometimes returned empty documents or lost DOM locator access even when native accessibility showed content; these are recorded separately and are not converted into page timing values.

## HTTP results

Initial unrestricted five-sample series, all HTTP 200. Milliseconds below are TTFB; ranges describe attempts 2–5. Raw files retain total durations and response bytes.

| Endpoint / payload | First observed ms | Repeat range ms | Body bytes |
|---|---:|---:|---:|
| Development `/` | 4.989 | 1.428–1.485 | 644 |
| API direct `/api/v1/health` | 8.700 | 0.821–1.859 | 15 |
| Health through frontend proxy | 2.399 | 1.516–2.865 | 15 |
| Resolve known demo ZIP 17101 | 2.849 | 1.485–2.604 | 144 |
| Harrisburg resource query | 3.281 | 1.518–2.636 | 597 |
| Fictional pantry detail | 1.510 | 1.475–4.433 | 818 |
| Desktop hero WebP | 2.416 | 0.859–0.956 | 431,332 |

Later comparison demonstrates why the fast series alone is insufficient:

| Target | Attempt 1 | Attempt 2 | Attempt 3 | Attempt 4 | Attempt 5 |
|---|---|---|---|---|---|
| Development `/` | No bytes; timeout 15.009 s | No bytes; timeout 15.009 s | 200; TTFB 4.005 s | 200; 9.109 ms | 200; 1.220 ms |
| Existing production `/` | 200; TTFB 1.869 s | 200; 1.478 ms | 200; 1.356 ms | 200; 1.183 ms | 200; 1.137 ms |

Concurrent probe at approximately 17:22 local time:

| Request | HTTP | TTFB ms |
|---|---:|---:|
| Development root | 200 | 15.221 |
| Development `/src/main.ts` | 200 | 19.803 |
| Development `/src/support.ts` | 200 | 1,475.995 |
| Direct API health | 200 | 11.232 |
| Proxied resource search | 200 | 16.379 |
| Production-preview root | 200 | 1,935.888 |

This is consistent with variable local serving/transform/filesystem or scheduling latency, but does not identify which one. Timing windows were not a controlled randomized experiment, and no CPU or disk trace was captured during the stalls. A fast health endpoint does not test database readiness: [backend/app.ts:66](/Users/admin/Documents/Projects/our-ground/backend/app.ts:66) returns a basic health result, while actual resource queries exercise the repository.

## Investigation matrix

| Area | Status | Observed evidence / limit |
|---|---|---|
| Vite serving | REPRODUCED / MEASURED | Root stalls and variable module response as above. Existing launcher disables watcher; no source edits/HMR stress were introduced. |
| Server startup | NOT TESTED precisely | Existing servers reused; production preview launched and responded, but launch-to-ready was not measured reliably. No restart of user's servers. |
| Reconnect/HMR fault | SUSPECTED, unproven | Intermittent blank captures; no timestamped reconnect log linking them to a server stall. No evidence of repeated HMR loops. |
| Automation overhead | REPRODUCED limitation | DOM locator deadlines and blank snapshots; native AX sometimes recovered. Capture durations are not app navigation metrics. |
| Demo API | MEASURED | Health, resolve, search and detail fast in sampled windows; no configured PostgreSQL query or remote Supabase timing collected. |
| Sequential location resolution | Source-confirmed; impact NOT TESTED remotely | [support.ts:104](/Users/admin/Documents/Projects/our-ground/src/support.ts:104) awaits geocoding, then line 110 requests resources. Line 126's 250 ms keyword debounce triggers the same sequence. |
| DB pool/query queue | Source-confirmed; impact NOT TESTED | [postgres.ts:9](/Users/admin/Documents/Projects/our-ground/backend/postgres.ts:9) uses one connection; line 13 serializes submissions intentionally for Supavisor transaction compatibility. Search count and page queries are sequential. Do not remove this safety behavior without targeted backend evidence. |
| CSS effects | Source-reviewed | Gradients and a limited hero mask; no active full-page backdrop blur/glass. Card hover transform is localized, reduced-motion rules exist. No measured expensive-paint trace. |
| Image decoding / layout shifts | SUSPECTED opportunities, NOT MEASURED cost | Explicit image dimensions and fixed crop frames reduce obvious shift risk. Hero candidate and decode cost were not profiled. Layout screenshots do not measure CLS. |
| DOM size | MEASURED snapshot counts | Baseline pages are small (roughly 62–165 elements in saved snapshots); no obvious giant virtualized list or DOM explosion. Counts are state-dependent. |
| Event listeners / repeated rendering | Source-reviewed; heap NOT TESTED | Navigation has a few delegated document/media listeners; photo helper adds two listeners per image. Results replace children; no evident unbounded growth in this source review. No heap allocation or listener-growth trace. |
| Legacy animation | Source-confirmed | [globe.ts:183](/Users/admin/Documents/Projects/our-ground/src/globe.ts:183) schedules RAF continuously. Inactive/hidden state returns early; reduced motion stops rotation but still renders when active. Confined to `/demo`. |
| Extensions / DevTools | NOT ISOLATED | Browser debugging integration/extensions and an audit DevTools window were present. No clean-profile comparison; no user extensions/settings disabled. |
| Memory pressure | SUSPECTED, unproven | Host has 8 GiB RAM; snapshot showed 33% free and swap 7,407.88 MiB used of 8,192 MiB. Swap occupancy alone does not prove active swapping or cause. Need rates and a stall-correlated trace. |
| Multiple local processes | Observed | Existing frontend/API plus audit-only production preview. Existing API/Vite CPU snapshots ~0/0.1%; RSS ~4,240/22,064 KiB at one instant, not peak. No process was inferred unhealthy from idle RSS. |
| Previous build termination | Historical only | Phase 4 described a process exit 137. No OS kill record or memory trace here establishes OOM. No build retries performed in this audit. |

During final verification, one Python file read returned `OSError: [Errno 89] Operation canceled`, and another hash pass paused before eventually completing successfully. The affected filename was not captured in the first traceback, so this does not identify a specific file, disk fault or cloud-sync cause. It adds evidence of local audit-time I/O variability, not proof of the website stall's root cause. The completed pass verified all 83 baseline files unchanged.

## Browser measurements and blockers

| Measurement | Result |
|---|---|
| Viewport/zoom/page extent | MEASURED in baseline DOM snapshots: 1440×900, 768×1024, 390×844, scale 1 / zoom 1; no horizontal overflow in recorded baseline states |
| TTFB | MEASURED via unrestricted curl above; not browser navigation TTFB |
| Navigation timing, FCP, LCP, CLS | BLOCKED: supported browser DOM evaluation did not expose `performance`; native Chrome DevTools inspection did not yield usable entries and later native capture failed. No fabricated measurements or score |
| INP | NOT TESTED; no field session distribution or reliable lab interaction trace |
| Long tasks / JS execution / paint / decode duration | BLOCKED by the same profiling limitation; static source and bundle review only |
| Resource byte sizes | MEASURED on disk and selected HTTP bodies; compressed bundle values are local gzip calculations, not browser-observed transfer sizes |
| Browser network failures | Partial observations only: navigation/capture failures plus unavailable map state; no complete HAR or request-timing export. Intentional invalid location and unknown resource are expected errors, not outages |
| True cold / warm browser paint comparison | NOT TESTED reliably; existing processes/cache state were not reset |

Reference targets are **LCP ≤2.5 s, INP ≤200 ms, CLS ≤0.1**, evaluated appropriately at the 75th percentile for field experience; none are claimed results of this audit. [Web Vitals reference](https://web.dev/articles/vitals). A future clean-profile Performance-panel recording should identify LCP, long tasks, request initiators and expensive frames; use Lighthouse as a repeatable diagnostic alongside it rather than equating one score with observed reliability. [Chrome Lighthouse documentation](https://developer.chrome.com/docs/devtools/lighthouse/).

## Assets and route delivery

| Public raster | Native web dimensions | Bytes | Load behavior |
|---|---:|---:|---|
| Family desktop | 1672×941 | 431,332 | Eager, high fetch priority on `/` |
| Family mobile | 768×1365 | 278,364 | `<source media="(max-width:900px)">`; selected at 390px |
| Flowers | 1920×640 | 370,430 | Lazy homepage card; eager support hero |
| River landscape | 1912×797 | 399,504 | Lazy homepage card |
| Food | 1200×800 | 219,696 | Lazy homepage card; eager Organizations intro |
| Garden | 1200×800 | 258,198 | Lazy Give lower section; eager About intro |
| Healthcare | 1200×800 | 137,876 | Lazy About purpose section |
| Earth texture | 2048×1024 | 1,511,379 | Three texture on `/demo` |
| Region image | 1672×941 | 3,153,679 | Plain `<img>` exists even while region view is hidden; eligible for eager load |
| Globe fallback | 1672×941 | 1,849,499 | Conditional CSS background on WebGL failure; not observed fetched on baseline globe |
| Unused network Earth | 1651×953 | 281,420 | No current route consumer found |

[photography.ts:17](/Users/admin/Documents/Projects/our-ground/src/photography.ts:17) supplies width/height, async decoding and lazy defaults. The family is the only responsive source switch; the others have no width-based `srcset`/`sizes`. At 390px, saved DOM confirms the mobile family is selected and all three card source files retain their original widths. There is no evidence of both family files being fetched in a single stable baseline navigation; duplicate requests during resize were not measured. The same food/flowers used on another route is reuse, not proof of duplicate uncached transfer.

Desktop homepage raster sum, once all three cards are loaded: **1,420,962 bytes**. With the mobile family source: **1,267,994 bytes**. This is potential file payload, not a cold-navigation transfer measurement; browser lazy-loading thresholds/cache determine when and whether each is transferred. All three card files total **989,630 bytes**. Derivatives could reduce small-screen waste, but exact savings and perceived improvement require measurement and crop approval.

The desktop family image is a plausible LCP candidate because it occupies most of the first screen; on mobile the heading/photo order differs and a different element may win. Neither candidate is a measured LCP entry. Initial offscreen screenshot blank areas sometimes resolved after real scroll/focus even when DOM reported decoded images; do not count this capture limitation as confirmed asset failure.

Existing production JS file sizes (not complete per-route transfer totals; common chunks may be shared):

| Chunk | File bytes | Local gzip bytes | Route relationship |
|---|---:|---:|---|
| index | 5,848 | 2,452 | Shared bootstrap/navigation |
| landing | 3,113 | 1,260 | `/` |
| photography | 1,030 | 605 | Shared editorial helper |
| ui | 1,814 | 679 | Shared UI utilities |
| support | 9,455 | 3,608 | `/support` |
| resource-detail | 11,502 | 4,289 | Resource route |
| participate | 4,028 | 1,612 | Give / Organizations |
| info | 4,601 | 1,859 | About / recovery |
| account | 6,793 | 2,684 | Account |
| staff | 7,407 | 2,918 | Staff |
| backend-client | 215,333 | 54,901 | Supabase auth path |
| demo | 549,755 | 136,173 | Legacy `/demo` only |

Dynamic route dispatch is explicit in [main.ts:7](/Users/admin/Documents/Projects/our-ground/src/main.ts:7). The homepage does not import the globe/Three module. Public discovery uses `api-client.ts`; its auth SDK import occurs only for authenticated calls. The existing tokenless production build contains no resource-map chunk: the configuration gate was eliminated at build time. Therefore these bundle numbers **do not estimate a Mapbox-enabled release**. Do not cite a tokenless map bundle as zero-cost mapping.

The app uses system serif/sans stacks, with no external font download discovered. No analytics/ad SDK was found in active entry points. Configured maps and authentication would add provider network traffic; local browser extensions are separate. Dormant `landing-sections.ts` and the unused network image are not active homepage dependencies. Static review found no compelling reason to replace frameworks or install a performance package.

## Ranked recommendations — not implemented

| Priority / proposed work | Evidence and uncertainty | Exact affected file(s) | Expected benefit | Regression risk | Verification |
|---|---|---|---|---|---|
| P1: isolate intermittent local stalls before optimization | Two 15 s root timeouts; slow prod root also reproduced. CPU/disk/scheduling vs transforms unresolved | `vite.config.ts:4`; existing launcher `output/photo-integration/dev-preview.mjs`; runtime environment | Identify actual bottleneck instead of guessing | Restarting processes could disrupt owner preview; use separate controlled session with approval if needed | Timestamp 20+ direct API, dev root/module and preview requests; capture CPU, disk/swap rates and Vite logs during an outlier; compare clean browser session |
| P1: add bootstrap failure recovery in a later approved frontend fix | `#app` starts empty and dynamic route imports are fire-and-forget; no visible import-error handler. Not proven cause of stalls | `index.html:11`, `src/main.ts:7` | A chunk failure can offer retry/status rather than blank screen | Avoid masking exceptions or double-initializing route modules | Deliberately block a route chunk in a disposable test browser; confirm keyboard-readable retry and successful recovery |
| P1: profile, then supply responsive photo derivatives | Measured image sizes; no width candidates except family art direction | `src/photography.ts:3`, `src/landing.css:23`, future approved `public/images/our-ground/` derivatives | Lower transfer/decode demand on smaller screens | Poor crop, wrong `sizes`, double downloads, accidental upscale | Network trace at 1440/768/390 with cache disabled then warm; inspect currentSrc, bytes, LCP and crop; preserve mobile family choice |
| P2: avoid unnecessary repeat location resolution within a search flow | Every keyword/category/radius/page query first resolves same location | `src/support.ts:90`, `backend/runtime.ts:20` | Fewer remote geocoder round trips/billable calls when configured | Stale center, invalid location, geocoder licensing/caching terms | Count requests on filter/page changes; change location and verify fresh resolution; audit applicable storage terms before retaining results |
| P2: bound prolonged request states and preserve retry | UI fetch lacks its own elapsed-time limit; geocoder has 10 s timeout; actual hanging API not reproduced | `src/api-client.ts:6`, `src/support.ts:90`, `src/resource-detail.ts:83` | Predictable recovery during outage | Too-short timeout on slow connections, duplicate/retried writes | Simulated slow/read failure in test environment; verify abort, status, retry and no write replay |
| P2: defer legacy region raster and stop unnecessary globe frames | 3.15 MB hidden region image; RAF continues in active reduced-motion scene | `src/demo.ts:74`, `src/globe.ts:183` | Reduce `/demo` startup bytes and idle render cost | Blank stage transition or broken interaction | Record demo network before first region open; verify region/needs, keyboard controls and reduced-motion after change |
| P2: measure configured PostgreSQL search before altering serialization | Single connection and serial count/page SQL intentional; demo cannot expose load behavior | `backend/postgres.ts:9`, `backend/postgres.ts:38` | Find genuine database/query constraints | High if queue/pool safety removed without Supavisor-compatible design | Later staging query plan/latency/load tests on approved data; preserve authorization and spatial correctness |
| Optional: independent map loading/failure lifecycle review | Any map error triggers fallback; live provider not tested | `src/resource-map.ts:15`, `src/support.ts:63`, `src/resource-detail.ts:68` | Better retry/transient-error behavior when maps are configured | Repeated initialization or hiding a usable map | Token-enabled tests for offline, invalid style, denied token and transient tile error; list remains usable |

No optimization was implemented. No new test/build claim is made: prior phase results remain historical. This audit validated documentation, files and read-only behavior rather than rerunning a build that would replace `dist/`. Before release decisions, obtain a clean browser trace and production-mode API measurements; the current evidence supports a focused investigation, not a proven single root cause.

Final documentation validation: 31 manifest records, all required fields, source-file/line and local-link checks, 30 baseline viewport captures plus 10 supplemental screenshots; no validation errors. [Verification artifact](../../output/phase-5-audit/verification.json). Only the temporary audit production-preview process was stopped; the original frontend and demo API were left running.
