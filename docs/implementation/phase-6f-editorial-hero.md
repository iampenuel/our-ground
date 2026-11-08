# Phase 6F — Compact editorial hero

Implemented locally on 29 October 2026. The owner subsequently requested Phase 6F.1 while final validation was in progress; the next report records that refinement. The captures and measurements here document the intermediate Phase 6F production build, not the later refinement.

## Scope and image

Applied the apple-design skill’s restraint, readable hierarchy, clear feedback and accessibility principles. Existing-file changes: `src/landing.ts`, `src/landing.css`, `src/photography.ts`. Added `public/images/our-ground/hero-courtyard-realistic-desktop.webp`; archived the unchanged master PNG, unused portrait WebP and asset README in `docs/design/assets/courtyard-hero-refresh/`. This report is the remaining documentation addition. Other source files, previous photography, dependencies, backend, APIs and credentials were preserved.

The approved desktop WebP is 1672 × 941, 478,384 bytes, SHA-256 `5712899b71de7d1ace233752bf0d599b5fb527ffcd30ca08b62d778e3119d560`. It was copied byte for byte; no image processing or generation. The master remains outside public delivery. The portrait crop omits important group context, so the full landscape is used at every width, fluidly sized with intrinsic dimensions, eager loading and high fetch priority. This downloads one 478 KB WebP, including on mobile; no smaller landscape derivative was supplied or created.

## Composition comparison

The initial 1440px full-width cover candidate used a 1440 × 810 image plane inside a 600px banner, cutting approximately 210px vertically and enlarging the group. See `../../output/phase-6f/candidate-cover-1440.jpg` (path from repository root: `output/phase-6f/candidate-cover-1440.jpg`). The selected Phase 6F version used the complete 1066 × 600 photo, anchored right, with a feathered left edge and neutral charcoal gradient. The headline is warm white; exact copy and CTA destinations remain intact. The supporting People / Places / Possibilities row was moved outside the hero per the original 6F request; Phase 6F.1 explicitly reverses that decision.

Below 1024px, text and actions precede the complete landscape photo. Header behavior and gutters were unchanged. No application zoom or transforms were used.

## Before and after

All normal measurements use scroll zero, CSS viewport sizes, DPR 1 and visual viewport scale 1. The full JSON includes `currentSrc`, natural image dimensions, rendered dimensions, fit, position, headline line height and element bounds.

Before hero heights (including the then-inside supporting row): 1082.2 at 1665, 955.6 at 1440, 914.0 at 1366, 721.5 at 1024, 1102.9 at 768, 966.1 at 390 and 935.1 at 320. At 1440 the prior headline was 79.2px/78.408px; after it is 69.12px/70.5024px. The previous and new images differ; natural-width values from the old srcset are browser density-adjusted and should not be confused with encoded file dimensions.

| CSS viewport | Header px | Hero px | Headline | Rendered image px |
|---|---:|---:|---|---|
| 1665 × 900 | 81 | 600.0 | 72px | 1066.1 × 600.0 |
| 1440 × 900 | 81 | 600.0 | 69.12px | 1066.1 × 600.0 |
| 1366 × 768 | 81 | 573.7 | 65.568px | 1019.4 × 573.7 |
| 1024 × 768 | 81 | 544.0 | 56px | 966.6 × 544.0 |
| 768 × 1024 | 77 | 817.5 | 48px | 768.0 × 432.2 |
| 390 × 844 | 77 | 655.5 | 42.9px | 390.0 × 219.5 |
| 320 × 700 | 77 | 632.9 | 40px | 320.0 × 180.1 |

The after hero height excludes the adjoining purpose row. At 1440, header + hero = 681px, with the purpose row and beginning of the community section visible within 900px.

## Validation and evidence

- `npm test`: 63 passed, 0 failed, 0 skipped; 70.5 seconds, Node 24.19.0. Log: `output/phase-6f/test.log`.
- Build attempt 1: OS killed the process during frontend type checking, exit 137, no TypeScript diagnostic. Log: `output/phase-6f/build.log`.
- Build attempt 2: succeeded, frontend/backend type checks and production bundle. Used `GOMEMLIMIT=128MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=256 npm run build -- --outDir output/phase-6f/staged-dist`. Log: `output/phase-6f/build-retry.log`. Existing large demo/MapLibre chunk warnings remain outside scope.
- Production output was replaced only after successful completion, with old dist retained under `output/phase-6f/previous-dist`. All six `npm run check:preview` checks returned HTTP 200: frontend, API health direct/proxied, demo ZIP, fictional search and fictional-detail safeguards. No new live provider queries were made.
- All seven after screenshots were opened and inspected. No normal-size horizontal overflow; image loaded at its full natural 1672 × 941 dimensions. Source/render measurements are in `output/phase-6f/before-measurements.json` and `after-measurements.json`.
- Estimated contrast from decoded source pixels, actual DOM text-line rectangles, CSS mask and gradient compositing: minimum desktop headline 12.71:1, paragraph 5.68:1, secondary CTA 13.72:1. Narrow solid-background text exceeds 13:1. This is a conservative pixel-region calculation, not an automated whole-site accessibility certification. Data: `output/phase-6f/contrast.json`.
- A local 200% root-font fixture confirmed the hero grows and retains both actions at 1440, 390 and 320. At narrow widths, existing navigation and lower community cards overflow; the hero itself wraps its text and controls without clipping. This is an outstanding broader accessibility issue, not a claim of whole-page compliance. Supporting row overflow was also observed in the intermediate 6F layout and is addressed by bounded columns in 6F.1.
- Keyboard route checks and final console checks were still in progress when the owner supplied 6F.1; see the refinement report for final validation. No new animation was added; existing reduced-motion CSS was retained.

Screenshots: `output/phase-6f/before-1440.jpg`, `before-390.jpg`, `after-1440.jpg`, `after-390.jpg`, plus all seven widths and 200% text captures in that directory. Evidence is local and ignored by Git.

Verified intermediate local production URL: http://127.0.0.1:18418/ . This same URL will serve the subsequent successfully built refinement. No deployment or Git push.
