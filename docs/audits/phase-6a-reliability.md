# Phase 6A — local reliability

28 October 2026. Local implementation and verification only. No deployment, push, installation, cloud resources, billing, secrets, migrations or live AI calls.

## Status

- **IMPLEMENTED:** Node 24 selection/guard, fixed-port local launch commands, bounded demo readiness checks, startup/recovery documentation and four regression tests.
- **TESTED:** 27/27 automated tests; production build; development and built-preview search/details; required public routes and responsive layouts.
- **PROPOSED:** Use the prebuilt, warmed preview for the presentation, with a browser walkthrough immediately beforehand. This avoids development transforms during the presentation; it does not guarantee a stall-free machine.
- **BLOCKED:** Root cause of Phase 5's >15-second HTTP stalls remains unproven. Live PostgreSQL, Supabase, Mapbox and Google/Gemini verification lacks configuration. Public deployment awaits separate authorization.

Read the Apple Design skill, Phase 4 polish report, Phase 5 image inventory/performance/maps reports, and backend setup/architecture before this pass. Applied restraint: no UI redesign or speculative animation, framework, bundling or backend changes.

## Local services and environment

Neither previous preview service was running at the initial check. The shell selected **Node 20.20.0**, while the installed supported runtime was **Node 24.19.0**. Services were restarted explicitly in fictional mode with Node 24. Later, only the three task-owned servers were stopped and replaced to test the new launch commands.

Final listeners, all bound to IPv4 loopback:

| Service | PID at verification | Verified address | Command |
|---|---:|---|---|
| Vite development | 34449 | http://127.0.0.1:18417/ | `npm run dev:local:web` |
| Fictional in-memory API | 34430 | http://127.0.0.1:18787/api/v1/health | `npm run dev:local:api` |
| Built local presentation preview | 34470 | http://127.0.0.1:18418/ | `npm run preview:local` |

PIDs are observations, not permanent identifiers. All three are left running. The API's useful health path is `/api/v1/health`, not `/`.

Presence-only inspection of Vite development and production environments found these seven values absent: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `MAPBOX_ACCESS_TOKEN`, `VITE_MAPBOX_PUBLIC_TOKEN`. No values were printed. `.env.local` was absent. Fictional ZIP/city resolution and list search work without those services; authentication and map rendering correctly show unavailable states.

## Bounded HTTP measurements

Six rounds, nine independent URLs per round, **54 requests**, at approximately **2026-10-28 22:58:15–22:58:18 UTC**. Each curl had a 5-second timeout and an outer 7-second process bound. Requests within a round ran concurrently. Every request returned **200**, curl exit 0; no timeout or HTTP error occurred. Raw timestamps, status, TTFB, total duration, bytes and errors: [http-samples.json](../../output/phase-6a/http-samples.json). Script: [probe.py](../../output/phase-6a/probe.py).

| Endpoint | TTFB min / median / max, ms | Maximum total, ms |
|---|---:|---:|
| Development `/` | 5.53 / 9.70 / 1967.19 | 1967.35 |
| Development `/src/main.ts` | 1.81 / 5.44 / 2018.52 | 2018.60 |
| Development `/src/support.ts` | 3.80 / 9.81 / 2017.11 | 2017.20 |
| Existing built preview `/` | 3.07 / 15.47 / 1152.27 | 1152.41 |
| Direct API health | 1.82 / 5.39 / 34.83 | 34.94 |
| Proxied API health | 3.43 / 15.38 / 28.18 | 28.28 |
| Demo location resolution, ZIP 17101 | 3.07 / 6.83 / 24.31 | 24.39 |
| Harrisburg food-resource search | 2.39 / 5.06 / 27.48 | 27.53 |
| Desktop hero WebP, 431,332 bytes | 1.45 / 4.98 / 26.84 | 1982.86 |

These are local HTTP observations, **not browser LCP/INP/CLS or field performance**. The first round was after service startup, not a controlled cold disk/browser cache experiment. Its slower development modules and preview root contrast with subsequent millisecond responses. The first image response began quickly but its body finished roughly two seconds later. Concurrent requests, OS scheduling and I/O can affect these observations; this does not isolate a cause.

The first standard Vite startup reported **49,767 ms**. After warm restart through the new launcher, Vite reported **202 ms**. The launcher retains Vite's normal watcher and does not claim to fix the startup delay. The production comparison initially used the existing build; the subsequent build was separately verified.

After that build, the first browser visit to port 18418 briefly showed an empty application surface. Reload recovered. Direct requests to the actual new entry JS and CSS at **23:12:58–23:12:59 UTC** returned 200 in **1306.38 ms** and **1160.14 ms** total; neither timed out. [Asset samples](../../output/phase-6a/preview-assets.json). Initial route snapshots taken before dynamic imports completed were also incomplete; bounded heading waits and fresh full accessibility snapshots subsequently verified every required production route. The initial blank view is retained as a reported limitation, not used as a passed render check.

## System and build evidence

- **Memory/swap:** the machine has 8 GiB RAM. During the roughly three-second probe, used swap rose from 5697.81 MiB to 5726.19 MiB. VM counters increased by 818 swap-in pages and 1816 swap-out pages (16 KiB pages: about 12.78/28.38 MiB). This is real system paging activity, but not proof that it caused a particular HTTP delay.
- **CPU/RSS:** before/after snapshots showed API CPU 0–1%, Vite 0–3%, preview 0–0.4%; respective resident sizes were approximately 45–47, 64–67 and 48–57 MiB. These sparse snapshots can miss short bursts. [System samples](../../output/phase-6a/system-samples.json).
- **Filesystem:** six reads each of HTML, Support source and the hero file measured approximately 0.06–1.05 ms after serving began. No slow read was reproduced by this small warm-read sample. It does not rule out earlier cold-file delays. [File-read samples](../../output/phase-6a/file-read-samples.json).
- **Scheduling:** a one-second macOS API process sample captured an idle event loop waiting in `kevent`, not a blocked startup stack or CPU hotspot. [Process sample](../../output/phase-6a/api-startup-sample.txt). No root cause can be inferred from it.
- **Transforms:** the production Vite build succeeded in 73.8 seconds for its bundling stage. Vite reported CSS transform callbacks totaling 53.7 seconds and CSS post-processing callbacks totaling 18.5 seconds; callback timing includes awaits. This implicates time spent in those build callbacks, not necessarily CPU execution or the earlier HTTP stalls. The build ran while tests were completing, so this is not an isolated benchmark.
- **Browser overhead/waterfall:** functional checks used the in-app browser, without opening DevTools or changing the user's extensions. No trustworthy extension A/B comparison, request waterfall or browser timing trace was obtained from the available browser surface. DOM image completion, visual captures, console inspection and direct asset timings provide narrower evidence. No invented waterfall or Core Web Vitals values are reported.
- **Three.js:** the existing 549.75 kB minified / 138.38 kB gzip legacy demo chunk warning remains. There is no measurement tying it to the homepage/API stalls; no demo rewrite or chunk-limit suppression was made.

## Implemented changes and limits

| File | Phase 6A change |
|---|---|
| `.nvmrc` | Select Node major 24. |
| `package.json`, `package-lock.json` | Require `24.x`; add local operational scripts and guard principal commands. Lockfile dependency versions unchanged. |
| `scripts/check-node.mjs` | Fail early with a clear Node-version recovery instruction. The observed Node 20 command exits 1 as intended. |
| `scripts/local.mjs` | Fixed loopback ports, strict frontend port selection, existing Vite environment-boundary validation, explicit demo flag, foreground child lifetime/signal forwarding. |
| `scripts/local-readiness.mjs` | Six concurrent read-only checks with five-second deadlines: HTML, direct/proxied health, demo ZIP resolution, fictional search and detail/contact safeguards. |
| `tests/local-readiness.test.mjs` | Three tests covering Node mismatch, successful readiness, and HTML-swallowed API/unsafe fictional contacts/timeouts. |
| `tests/vercel-adapter.test.mjs` | Actual existing function exports tested in an isolated Node test process with demo dependencies; no DB/network credentials. |
| `README.md` | Replace ambiguous startup instructions with supported fixed-port workflow and report links. |
| This report; `docs/deployment/vercel-readiness.md`; `docs/architecture/google-maps-gemini-plan.md` | Requested handoff and future architecture. |

The launcher explicitly chooses demo mode when the owner runs the demo command. It never switches a failed PostgreSQL request into demo data. Existing real-data commands and backend behavior remain. There is no automatic restart/process manager and no port auto-increment. Readiness checks validate responses, not complete browser rendering; manually visit the pages before presenting. The demo check deliberately fails against a real-data-only API, rather than mislabeling it as the fictional presentation environment.

The 71-file pre-edit hash baseline shows only `package.json` and `package-lock.json` changed in that set; all 69 other sampled files, covering frontend/backend/API/shared/public assets and existing deployment configuration, match. Existing uncommitted team changes remain. Baseline and initial Git status are saved under `output/phase-6a/`. Generated build/test logs and screenshots are local ignored artifacts.

## Exact startup and recovery

In each terminal:

```sh
cd /Users/admin/Documents/Projects/our-ground
nvm use
node --version
```

Expect Node 24.x. If nvm is not loaded in this machine's shell, prepend the already installed runtime for that terminal:

```sh
export PATH="/Users/admin/.nvm/versions/node/v24.19.0/bin:$PATH"
```

1. API terminal: `npm run dev:local:api`.
2. Development terminal: `npm run dev:local:web`.
3. Check terminal: `npm run check:local`, then open **http://127.0.0.1:18417/**.

For the presentation, keep the API terminal running:

```sh
npm test
npm run build
npm run preview:local
```

Leave that preview command running in its terminal. In another terminal run `npm run check:preview`, then open **http://127.0.0.1:18418/**. The built preview has no HMR; rebuild after approved source changes. Its public variables come from the production build environment, while the demo API launcher uses development environment loading. If configuring auth later, both must reference the same intended Supabase project.

Before the presentation, visit Home → Find Support → 17101 → fictional pantry → Give Support → Organizations → About → Account. Check that photos and headings have finished painting. Explain the fictional labels, unavailable map and unavailable sign-in honestly. Prewarming is an operational mitigation, not a repair of the unresolved stalls.

If a process exits, rerun **only that process's command** and rerun the appropriate readiness check. If a port is occupied:

```sh
lsof -nP -iTCP:18417 -iTCP:18418 -iTCP:18787 -sTCP:LISTEN
```

Identify its owner/command; reuse the intended running server or stop it with Ctrl-C in its own terminal before restarting. Do not kill unrelated listeners or start duplicates. On timeout, inspect both terminals, allow startup to finish and retry once. If the issue persists, retain timestamps/logs and report the failure; do not clear caches, reinstall, or switch real data to demo as an unexplained cure. Closing the server terminals or sleeping/shutting down this machine interrupts the local preview.

## Verification results

**TESTED:** `npm test` under Node 24.19.0: **27 passed, 0 failed, 0 skipped**, 84.43 seconds. Original 23 preserved; four added tests explain the increase. The existing environment-guard subprocess test took 41.88 seconds; the new adapter test, including module import, took 84.28 seconds. These startup costs are recorded, not attributed to network or database work. [Test log](../../output/phase-6a/tests.log).

**TESTED:** `npm run build` exited 0; public environment check, frontend/backend TypeScript checks and Vite build passed. Existing demo bundle warning and slow CSS callback diagnostics remain. [Build log](../../output/phase-6a/build.log).

**TESTED:** Both fixed-port readiness commands exited 0 after the controlled restart. All twelve checks returned HTTP 200. Development checks took 14–49 ms; preview checks took 32–68 ms. [Development](../../output/phase-6a/readiness-dev.log), [built preview](../../output/phase-6a/readiness-preview.log).

Browser verification covered Home, Find Support, fictional resource detail, Give, Organizations, About and Account at **1440×900 and 390×844**; Home/Support also at **768×1024**. Measured document widths matched the viewport in all 16 checks. Search was exercised with ZIP 17101, then its actual result link opened the detail. Fictional/no-visit copy and disabled contact/directions remained; Support/detail map-unavailable states and account-not-configured state rendered. All seven built-preview routes were also verified, including direct deep links. No report, staff save or authentication attempt was submitted. [Browser evidence](../../output/phase-6a/browser-checks.json), [production checks](../../output/phase-6a/production-browser-verified.json).

Review captures: [desktop built preview](../../output/phase-6a/screenshots/preview-home-1440.jpg), [mobile built preview](../../output/phase-6a/screenshots/preview-home-390.jpg), [desktop search](../../output/phase-6a/screenshots/support-results-1440.jpg), [mobile detail](../../output/phase-6a/screenshots/detail-390.jpg). Other route captures are alongside them. No visual modifications were made in this phase.

The built preview's mobile menu also opened with Enter and closed with Escape, restoring focus to Menu. [Keyboard evidence](../../output/phase-6a/keyboard.txt). Reduced-motion CSS was preserved; Phase 4's emulation results remain prior evidence, not a newly repeated emulation test. Temporary browser viewport overrides were reset after inspection.

## Remaining decisions

Owner approval is needed for any actual Vercel deployment and its presentation data mode. Live-data/auth configuration and hosted smoke tests remain outstanding; see [deployment readiness](../deployment/vercel-readiness.md). Google Maps and Gemini are future work only; see [the selected-provider plan](../architecture/google-maps-gemini-plan.md). Current local URLs are verified and left running, with the observed intermittent-load limitation disclosed above.
