# Phase 6E — Approved courtyard hero and shared header

Completed locally on October 29, 2026. No deployment or push.

The exact approved courtyard image replaces the homepage mountain-meadow hero. The redundant hero eyebrow is removed. Copy and CTA wording/destinations remain unchanged. The header and hero now share a wider, symmetric edge grid. The application content container and Phase 6D discovery implementation are unchanged.

## Files changed

Existing source files modified:

- `src/landing.ts`: selects the courtyard photograph, removes the eyebrow, and uses the existing dark/light button treatments.
- `src/landing.css`: scopes the new image framing, copy placement, contrast wash, purpose statements, and responsive composition to the homepage. Existing Give Support and Organizations selectors remain unchanged.
- `src/navigation.css`: adds `--og-edge-gutter` and applies it to the shared header and mobile menu. Navigation destinations, interaction code, typography, and active states remain unchanged.
- `src/photography.ts`: adds the courtyard asset and responsive `<picture>` source selection. Existing image configurations remain available.

Files added:

- `public/images/our-ground/hero-courtyard-approved-desktop.webp`
- `public/images/our-ground/hero-courtyard-approved-1200.webp`
- `public/images/our-ground/hero-courtyard-approved-mobile.webp`
- `docs/design/assets/approved-courtyard-hero/source/hero-courtyard-approved-master.png`
- `docs/design/assets/approved-courtyard-hero/manifest.json`
- `docs/design/assets/approved-courtyard-hero/README-HERO-INTEGRATION.md`
- This report, `docs/implementation/phase-6e-hero-header.md`.

The provided ZIP, extracted folder, and manifest were inspected. All four integrated image files match the supplied SHA-256 hashes byte for byte. No image was regenerated, filtered, re-encoded, or enlarged. The supplied README and manifest were archived unchanged. The PNG master is outside `public` and is absent from the production `dist` assets.

A comparison against the 105-file pre-change snapshot found changes only in the four source files listed above. Existing backend, API, mapping, authentication, search, package/dependency files, and photography assets were preserved. Generated screenshots, measurements, logs, and build backups are in the ignored `output/phase-6e/` directory.

## Approved assets

| File | Dimensions | Exact bytes | Approximate size |
| --- | --- | ---: | ---: |
| `hero-courtyard-approved-desktop.webp` | 1672 × 941 | 398,906 | 389.56 KiB |
| `hero-courtyard-approved-1200.webp` | 1200 × 675 | 201,994 | 197.26 KiB |
| `hero-courtyard-approved-mobile.webp` | 960 × 720 | 193,030 | 188.51 KiB |
| `hero-courtyard-approved-master.png` | 1672 × 941 | 3,705,799 | 3.53 MiB |

Desktop uses width-descriptor `srcset` entries for 1200 and 1672 pixels, with an accurate `sizes` attribute. At widths up to 900px, `<source>` selects the supplied 960 × 720 mobile crop. The primary hero is eager, asynchronously decoded, and `fetchpriority="high"`. Intrinsic dimensions and matching CSS aspect ratios reserve image space before loading. No global preload was added that would fetch homepage photography on unrelated routes.

The production browser successfully loaded `hero-courtyard-approved-desktop.webp` at the desktop test widths and `hero-courtyard-approved-mobile.webp` at 768, 390, and 320px. A separate fresh 390px page load also selected and completed the mobile WebP with eager/high priority. During the resize sequence, the browser retained the cached larger desktop candidate; the 1200px alternative remains available to normal responsive selection. Source-selection evidence is in `after-measurements.json` and `fresh-mobile-load.json`.

## Grid and composition

The former 1188px maximum container concentrated the header in the center of wide screens. The new header width is `calc(100% - var(--og-edge-gutter) * 2)`, using `clamp(1.25rem, 4.166667vw, 4rem)`. Existing navigation gaps remain bounded at 20–40px. No transforms, negative margins, CSS zoom, or page scaling are used.

| Viewport | Previous left/right gutter | Updated left/right gutter | Hero and purpose-statement left edge |
| --- | ---: | ---: | ---: |
| 1665 × 900 | 238.50px | 64px | 64px |
| 1536 × 960 | 174px | 64px | 64px |
| 1440 × 900 | 126px | 60px | 60px |
| 1024 × 768 | 46.08px | 42.67px | 42.67px |
| 768 × 1024 | 34.56px | 32px | 32px |
| 390 × 844 | 20px | 20px | 20px |
| 320 × 700 | 20px | 20px | 20px |

Measurements differ by less than 0.01px between some left/right edges due to browser subpixel rounding.

Desktop preserves the entire supplied photograph at its natural aspect ratio. Text sits on the cream wall; faces and the chess interaction remain unobscured on the right. The headline remains at its previous 85.95px, 82.08px, and 79.2px sizes at the three large desktop widths. At 1024px it reduces to 57.34px to fit the wall. The photo determines the hero image row's height; it is not forced into a cropped viewport-height background.

The People / Places / Possibilities statements sit on a plain paper band beneath the photograph, aligned to the same left edge. This prevents text from competing with the darker plants at the bottom of the image. Other homepage sections retain their existing content grid.

Below 1024px, the copy and actions come first, followed by the photograph and then the purpose statements. Between 901 and 1023px the full desktop composition remains available below the copy; at 900px and below, the approved 4:3 mobile crop is used without additional cropping. Its rendered height is 576px at 768px width, 292.5px at 390px, and 240px at 320px. Both mobile CTA buttons are visible within the initial viewport, with 52px-high targets. There is no text over the mobile photograph.

## Contrast and accessibility

Hero text uses the existing charcoal `#202824`. The old black gradients and white-on-landscape treatment were removed. A faint cream wash is limited to the left 34% of the photograph and fades completely by 43%, before the people. It is 8% opacity on wide desktops and 30% at 1024–1334px, where paragraph wrapping crosses deeper wall shadows. It is absent in the text-first layout. No blur, vignette, glass, text shadow, or color-grading filter was added.

The wash was chosen after sampling source-image pixels under the browser's actual text-line bounding rectangles. Without it, the paragraph's conservative minimum was 4.31:1 on large desktops and 3.08:1 at 1024px. Final sampling includes every source pixel in each line rectangle, including spaces, with the CSS wash composited in sRGB:

- Large desktop headline minimum: **3.995:1**, above the 3:1 AA requirement for large text.
- Large desktop paragraph minimum: **4.831:1**, above 4.5:1.
- 1024px headline/paragraph minima: **5.682:1 / 5.256:1**.
- Additional intermediate widths from 1050 to 1366px passed; the lowest intermediate paragraph minimum was **4.931:1** within the stronger-wash range.
- Charcoal on the mobile paper surface: **14.08:1**. White on the primary deep-green button: **13.35:1**. Muted purpose labels on paper: **5.99:1**.

This is a targeted contrast check, not a claim of a full-site accessibility audit. Evidence is in `contrast-sweep-layouts.json` and `contrast-final.json`.

Keyboard checks passed: menu activation with Enter, Tab to Find Support, Escape closure with focus restored to the menu summary, desktop Tab from the wordmark to Find Support with a visible 3px blue outline, and the skip link moving focus to `main`. Existing reduced-motion CSS still disables transitions and button transforms; the new hero has no animation. Reduced-motion behavior was checked in source; an OS-level preference toggle was not performed.

The centralized `/about#ai-and-imagery` disclosure remains reachable and explicitly describes editorial images as AI-generated illustrations. The courtyard image has no fabricated event caption or provider attribution. Existing fictional-demo and provider safeguards remain unchanged.

## Actual validation

- **`npm test`: passed — 63 tests, 0 failed, 0 skipped.** Node 24.19.0; duration 84.11 seconds. Log: `output/phase-6e/test.log`.
- **`npm run build`: passed on the second attempt.** The first attempt exited 137 when the OS killed the TypeScript checking process, without a compiler diagnostic. Both frontend and backend typechecks passed on the retry; Vite completed in 1m 49s. Logs: `build.log` and `build-retry.log`.
- The existing memory-aware environment was used: `GOMEMLIMIT=128MiB GOMAXPROCS=1 GOGC=20 NODE_OPTIONS=--max-old-space-size=256`, with Node 24 on PATH. Build output was staged under `output/phase-6e/staged-dist`, then moved to `dist` only after successful completion. The prior build is retained at `output/phase-6e/previous-dist`.
- The production preview was restarted on the existing port. **`npm run check:preview`: all six checks passed**, including frontend, direct/proxied API health, demo ZIP resolution, fictional resource search, and fictional detail safeguards (HTTP 200, 18–58ms).
- All seven requested production viewports were visually inspected. Browser visual scale and CSS zoom were 1. No horizontal overflow, image stretching, missing image, face overlap, or new production console errors were observed.
- Desktop (1440px) and mobile (390px) shared-header checks passed on `/give`, `/organizations`, `/about`, `/account`, `/support`, a fictional `/resources/:id`, guarded `/staff/services/:id`, `/demo`, the `/discover` redirect, and the not-found page. The homepage was checked at all seven widths. Links and active states remained correct.
- Actual interactions verified the homepage Find Support and Give Support CTAs, the mobile Organizations link, the home wordmark, and the AI imagery disclosure link.
- Authenticated editing was not exercised; the existing local account/staff guard was preserved. No live provider searches were needed for this visual phase, and no database writes were performed.

## Screenshots

All screenshot links below point to local review artifacts, not production assets.

| View | Before | After |
| --- | --- | --- |
| Desktop 1665 × 900 | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6e/before-1665.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-1665.jpg) |
| Desktop 1440 × 900 | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6e/before-1440.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-1440.jpg) |
| Mobile 390px, full page | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6e/before-390.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-390-full.jpg) |

Additional production screenshots:

- [1536 × 960](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-1536.jpg)
- [1024 × 768](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-1024.jpg)
- [768 × 1024](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-768.jpg)
- [390 × 844](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-390.jpg)
- [320 × 700](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-320.jpg)
- [320px full page](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-320-full.jpg)
- [Full desktop page](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-1665-full.jpg)
- [Lower purpose statements](/Users/admin/Documents/Projects/our-ground/output/phase-6e/after-1665-purpose.jpg)
- [Mobile menu](/Users/admin/Documents/Projects/our-ground/output/phase-6e/mobile-menu.jpg)

## Preview and remaining limits

Verified production preview: **[http://127.0.0.1:18418/](http://127.0.0.1:18418/)**. The local preview and API are left running for review.

No blocking Phase 6E visual issue remains at the requested sizes. The approved master is only 1672 pixels wide: photography is capped at that width on larger screens to avoid upscaling, leaving paper edges beyond that size. A higher-resolution approved original would be needed for truly full-bleed ultra-wide or native 2× desktop imagery. No resolution has been invented.

Vite still reports existing large chunks for the demo (549.75 kB) and MapLibre (1104.23 kB); these are outside this targeted phase and were not altered. The intermittent OS termination during the first build is recorded above; the successful staged build is the one currently served.

Phase 6E stops here. No Maps, provider, Gemini, deployment, credentials, or billing work was performed.
