# Phase 6F.3 — Hero height and section transition

Implemented locally on 29 October 2026. No deployment or push.

## Owner feedback and scope

Preserve the approved courtyard photograph, white editorial typography, gradient, CTAs, supporting row and navigation. Make the first desktop viewport belong entirely to the hero, then give the following cream section deliberate breathing room. Applied the apple-design skill’s restraint, hierarchy and accessibility principles.

## Exact files changed

- `src/landing.css` — viewport-aware desktop hero minimum height, supporting-row bottom padding, and following-section top padding.
- `src/landing.ts` — homepage-local measurement of the actual header border-box height, kept current with ResizeObserver.
- `docs/implementation/phase-6f3-hero-section-transition.md` — this report.

Build output, baseline snapshots, logs, measurements and screenshots are in ignored `output/phase-6f3/`. Prior production output is retained there when the successful replacement is promoted.

## Height and spacing

The old desktop hero minimum was 672px. The measured desktop header is 81px (80px content plus its existing 1px border); the tablet/mobile header is 77px. The homepage now supplies the measured height through `--og-home-header-height`, and desktop hero minimum height is `calc(100svh - var(--og-home-header-height, calc(var(--og-header-height) + 1px)))`. The existing shared header token plus its border is the initial fallback, not a guessed fixed header height. Header styles and layout are unchanged.

The hero remains content-sized above that minimum. There is no fixed-height clipping, spacer, scroll trap or nested scrolling. At widths below 1024px, the existing content-driven `min-height: 0` layout remains intact.

The supporting row remains inside the existing photographic hero, with its original copy, type and alignment. Desktop bottom padding increases from 32px to 48px. Existing tablet 32px and mobile 24px bottom padding remain unchanged.

The following section’s top padding changes from 0 to `clamp(4.5rem, 6vw, 6rem)` on desktop (72–96px), 48px below 901px and 40px below 601px. This is negative space inside the cream section after the hero boundary, not a blank band inside the hero. The section’s text, typography, photography, cards and links remain untouched.

The image asset, object positioning, mask and gradient declarations are unchanged. Existing cover behavior accommodates the taller desktop hero without aspect-ratio distortion; tablet/mobile retain the complete landscape image.

## Validation

A baseline comparison of 86 implementation, backend, API, script and test files found only `src/landing.ts` and `src/landing.css` changed. The complete pre-existing homepage markup is unchanged.

- `npm test`: **63 passed, 0 failed, 0 skipped**, 75.34 seconds on Node 24.19.0. Log: `output/phase-6f3/test.log`.
- Build attempt 1: OS killed frontend type checking, exit 137, with no TypeScript diagnostic. Log: `output/phase-6f3/build.log`.
- Build retry: **passed**, including public environment checks, frontend/backend type checks, and 92 bundled modules. Vite bundle duration: 1m 25s. Log: `output/phase-6f3/build-retry.log`. Existing demo/MapLibre large-chunk warnings and build plugin timing warnings remain; they are outside this spacing correction.
- Used the established memory-aware settings: Node heap 192 MiB, Go memory target 96 MiB, one Go worker, `GOGC=10`. The temporary development server and inspection tab were stopped before building.
- Successful output replaced `dist` only after the build passed. Previous output is retained in `output/phase-6f3/previous-dist`.

The first shell `check:preview` attempt could not access localhost from its network sandbox; the authorized run outside that sandbox passed all six checks with HTTP 200: frontend, direct/proxied health, demo ZIP resolution, fictional search and detail safeguards. Logs: `preview-check.log` and `preview-check-retry.log`. No live provider search or database change was performed.

## Rebuilt production measurements

All measurements below are CSS pixels at scroll zero, browser device scale 1 and visual viewport scale 1 (100% zoom). The header and hero were measured from rendered border boxes, not inferred from screenshot size.

| Viewport | Header | Hero before → after | Hero boundary after | Next-section top padding before → after |
|---|---:|---:|---:|---:|

| 1665 × 900 | 81 | 672.0 → 819.0 | 900.0 | 0 → 96px |
| 1536 × 900 | 81 | 672.0 → 819.0 | 900.0 | 0 → 92.16px |
| 1440 × 900 | 81 | 672.0 → 819.0 | 900.0 | 0 → 86.4px |
| 1280 × 800 | 81 | 672.0 → 719.0 | 800.0 | 0 → 76.8px |
| 1024 × 768 | 81 | 672.0 → 687.0 | 768.0 | 0 → 72px |
| 768 × 1024 | 77 | 942.3 → 942.3 | 1019.3 | 0 → 48px |
| 390 × 844 | 77 | 865.1 → 865.1 | 942.1 | 0 → 40px |
| 320 × 700 | 77 | 842.4 → 842.4 | 919.4 | 0 → 40px |

At all five desktop sizes, header + hero exactly equals viewport height. No next-section text appears in the initial screen. The supporting row remains inside the hero, with comfortable bottom space and no overlap or clipped copy. At tablet/mobile sizes, hero heights and reading order remain unchanged; the page scrolls naturally to reveal the remaining hero content and subsequent cream section. At 768 × 1024, the content-driven hero ends at y=1019.3, allowing about 5px of the following cream section at the fold but no next-section text; a rigid tablet viewport height was intentionally avoided.

All eight final screenshots were opened and visually inspected. No horizontal overflow was measured. The photo preserves its aspect ratio and all important subjects; existing desktop cover framing naturally adjusts to the increased hero height, with no new crop rule or image enlargement beyond source dimensions at the requested sizes. The gradient reaches the clean horizontal hero boundary with no cream/white band inside it. Scrolled desktop and mobile screenshots confirm the following section’s separate breathing room.

The homepage console recorded **zero errors** through resizing, scrolling and keyboard checks. Enter opens the mobile menu, Escape closes it, and Tab reaches the primary CTA with its existing visible 3px light-gold outline. Header measurement updates from 81px to 77px across responsive breakpoints. No animation or reduced-motion rules changed. The prior report’s separate 200% text-only overflow concerns outside the hero were not re-audited or changed by this pass.

## Before/after screenshots

| CSS width | Before | After |
|---|---|---|
| 1665px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-1665.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-1665.jpg) |
| 1536px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-1536.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-1536.jpg) |
| 1440px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-1440.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-1440.jpg) |
| 1280px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-1280.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-1280.jpg) |
| 1024px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-1024.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-1024.jpg) |
| 768px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-768.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-768.jpg) |
| 390px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-390.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-390.jpg) |
| 320px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/before-320.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-320.jpg) |

Transition views after scrolling:

- [Desktop boundary and next section](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-1440-transition.jpg)
- [Mobile supporting row and next section](/Users/admin/Documents/Projects/our-ground/output/phase-6f3/after-390-transition.jpg)

Raw measurement files: `output/phase-6f3/before-measurements.json` and `after-measurements.json`. Screenshots are actual browser captures, not mockups.

## Verified preview

**[http://127.0.0.1:18418/](http://127.0.0.1:18418/)** serves the successful rebuilt output. The production preview and existing local API remain running for review. No deployment, push, dependency installation, backend/authentication/map change, image replacement or unrelated redesign was performed. Work stops after this correction.
