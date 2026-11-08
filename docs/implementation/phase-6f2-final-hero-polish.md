# Phase 6F.2 — Final hero polish

Implemented locally on 29 October 2026. No deployment or Git push.

## Owner feedback

The owner approved the existing image, white serif text, gradient direction and integrated supporting row, and requested three final adjustments: remove the remaining white strip, lower the main text slightly and tighten the supporting row. This pass applies the previously read apple-design skill’s restraint, clear hierarchy and accessibility principles without changing the composition’s identity.

## Exact files changed

- `src/landing.css` — the only implementation file changed in Phase 6F.2.
- `docs/implementation/phase-6f2-final-hero-polish.md` — this report.
- `docs/implementation/phase-6f1-hero-refinement.md` — appended the preceding phase’s final successful preview verification when this new request arrived; no earlier implementation was rewritten.

Generated builds, logs, measurements and screenshots are under ignored `output/phase-6f2/`. A baseline hash comparison of 94 non-image implementation/configuration files found only `src/landing.css` changed. No image file, markup/copy, navigation code, dependencies, other route styling, backend, API, authentication, database, credential or map configuration was changed in this phase.

## White strip and clean ending

Browser inspection established that People / Places / Possibilities already lived inside the dark hero. The remaining empty paper-colored strip came from the following `.og-community` section’s top padding: 72px on desktop and 56px below 900px.

Removed that top padding at both breakpoints. The hero’s existing background and image treatment now extend through a 672px desktop hero (previously 640px), including the supporting row and its closing space. It ends directly at the next section’s content, with no empty white spacer between them. The next section retains its existing paper background, headings, copy and links; its content has not been turned into a new dark panel.

## Vertical balance

Increasing the desktop hero’s minimum height by 32px lets the existing grid position the headline, paragraph and CTA group about 18.2px lower. No transform, absolute text offset, browser zoom or fixed clipping height is used. The text group can still grow with enlarged text. At 1440 × 900, the 81px header plus complete 672px hero ends at y=753, leaving the next section visible.

The existing mobile/tablet `min-height: 0` rule remains, so the headline, paragraph and CTA positions are unchanged below 1024px. Reading order remains copy/actions, full landscape photo, supporting row, then community content.

## Supporting row

- Desktop row width: 624px → 560px.
- Column gap: 24px → 20px; proportions refined from 1 / 1 / 1.5 to 1 / 1 / 1.3.
- Body type: 17px → 16px on desktop, with 1.35 leading and a 14rem maximum text measure.
- Warm-white body text and near-white labels are retained.
- Mobile keeps two bounded columns, with Possibilities spanning both; its narrower text measure wraps cleanly rather than stretching across the full row.

All wording, deliberate line breaks, CTA labels and link destinations remain unchanged.

## Browser validation

Inspected at 100% visual viewport scale and scroll zero. Actual CSS dimensions were measured independently of screenshot pixels.

| CSS viewport | Complete hero height | Main text vertical change | Row width | Horizontal overflow |
|---|---:|---:|---:|---|
| 1440 × 900 | 672.0 | +18.2px | 560px | None |
| 1280 × 800 | 672.0 | +18.2px | 560px | None |
| 1024 × 768 | 672.0 | +18.2px | 560px | None |
| 768 × 1024 | 942.3 | +0.0px | 560px | None |
| 390 × 844 | 865.1 | +0.0px | 350px | None |
| 320 × 700 | 842.4 | +0.0px | 280px | None |

At every requested width the supporting row stays inside the hero, its text remains readable, both CTAs fit, the image proportions remain intact and the next section has 0px top padding. The existing 92%-width / 1400px-capped desktop framing and neutral gradient are unchanged. The modest increase in hero height changes the cover crop slightly without upscaling beyond the 1672 × 941 source; faces, chess interaction and wall details remain visible. Mobile still uses the complete landscape image.

Contrast was recalculated using DOM text-line bounds, decoded image pixels, object-fit cropping, mask and CSS gradient compositing. Minimum estimated ratios across inspected text regions: headline 8.97:1, paragraph 5.70:1, secondary CTA 10.02:1, lower labels 8.18:1, lower body 9.82:1. These exceed the relevant 3:1 / 4.5:1 targets. This is evidence for the hero, not a whole-site accessibility certification.

Keyboard checks confirm Enter opens the mobile menu, Escape closes it, and Tab reaches the primary CTA with a visible 3px light-gold outline. At 200% root font size, hero descendants remain within the viewport at 320px, 390px and 1440px, and both buttons retain their content without clipping. No animations were added; existing reduced-motion rules are unchanged. No OS reduced-motion toggle was performed because the available browser controls do not expose it.

The existing whole-page 200% text-only overflow in mobile navigation/lower community cards remains documented in the prior phase; this CSS-only hero pass neither changes those components nor claims to resolve that separate issue.

Development and final production homepage console errors: none. All six final production screenshots and the scrolled mobile transition were opened and visually inspected. The production measurements match the development layout, with the approved image loaded and no horizontal overflow at any requested size.

## Tests and build

- `npm test`: **63 passed, 0 failed, 0 skipped**, 103.79 seconds on Node 24.19.0. Log: `output/phase-6f2/test.log`.
- Build attempt 1: OS killed frontend type checking, exit 137, no TypeScript diagnostic. Log: `output/phase-6f2/build.log`.
- Build retry: **passed**, including public environment checks, frontend/backend TypeScript checks and a 92-module production bundle (1m 55s). Existing demo/MapLibre large-chunk warnings remain outside this CSS-only scope. Uses the established memory-aware procedure with Go memory target 96 MiB, one Go worker, `GOGC=10` and Node heap 192 MiB. The temporary dev server and inspection tab were stopped before building. Log: `output/phase-6f2/build-retry.log`.
- Production output was replaced only after the successful build, retaining the prior dist under `output/phase-6f2/previous-dist`. All six `npm run check:preview` checks passed after startup: frontend, direct API health, proxied API health, demo ZIP resolution, fictional resource search and fictional-detail safeguards. Each returned HTTP 200. Log: `output/phase-6f2/preview-check.log`.

## Visual evidence and preview

| View | Before | Final after |
|---|---|---|
| Desktop 1440px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f2/before-1440.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f2/after-1440.jpg) |
| Mobile 390px | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f2/before-390.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f2/after-390.jpg) |

Additional final screenshots cover 1280, 1024, 768 and 320px, plus a [scrolled mobile view of the supporting row and clean transition](/Users/admin/Documents/Projects/our-ground/output/phase-6f2/after-390-transition.jpg). Measurements, text rectangles, contrast calculations and enlarged-text checks are saved alongside them.

Local preview: **[http://127.0.0.1:18418/](http://127.0.0.1:18418/)**. The successfully built output was verified at this exact URL. Production preview and local API remain running for review. No provider searches, deployment, billing changes or Git push were performed.
