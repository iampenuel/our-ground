# Phase 4 — targeted visual polish

Implemented 28 October 2026. Local review only; no deployment or push.

## Scope and files

This pass refines the existing editorial system. Earlier uncommitted work was preserved. The phase-specific source diff is saved in `output/visual-polish/phase-only.diff`, against copies taken before this pass, rather than treating the entire working-tree diff as new work.

| File changed in this pass | Change |
| --- | --- |
| `src/design-tokens.css` | Shared content cap, header height, editorial display scale; system focus color in forced-colors mode. |
| `src/navigation.css` | Header uses the shared height token. |
| `src/landing.css` | Desktop hero spacing and alignment, card layout/states, compatible entry-page heading scale, Organizations split layout. |
| `src/info.ts` | About intro and supporting photographs; action grouped with its explanation. |
| `src/info.css` | About editorial columns, spacing and responsive stacking. |
| `src/participate.ts` | Organizations intro photograph and grouped copy/actions/access explanation. |
| `src/photography.ts` | Register the existing healthcare image with its intrinsic dimensions. |
| `src/support.css` | Warm surface on the specified directory callout. |
| `docs/design/community-facility-asset-brief.md` | Missing facility-image brief. |
| `docs/design/phase-4-visual-polish.md` | This handoff. |

No dependencies, framework, backend, database, authentication, permissions, records, map behavior or search semantics changed. Existing corrections and staff conflict handling were not edited. Generated screenshots, baseline copies, logs and inspection data are under `output/visual-polish/`.

## Desktop scale: measured before changing

The same Chrome window was inspected using native 100% and 90% browser zoom, confirmed by Chrome's zoom UI, then restored to 100%. Its content viewport changed from **1440 × 722 CSS pixels** to **1600 × 802 CSS pixels**. Browser exports are normalized to those CSS dimensions; they are not the physical display pixel dimensions. Device-pixel ratio was not used to infer zoom.

| Measurement | Before, 100% | Before, 90% in the same window | After, 100% |
| --- | --- | --- | --- |
| Container width | 1310.4 CSS px | 1320 CSS px, approximately 1188 at the original screen scale | 1188 CSS px |
| Left content inset | 64.8 CSS px | 140 CSS px, approximately 126 at the original screen scale | 126 CSS px |
| Header inner height | 88 CSS px | 88 CSS px, approximately 79.2 at the original screen scale | 80 CSS px, plus the existing 1px divider |
| Hero heading font | 83.52 CSS px | 92.8 CSS px, approximately 83.52 at the original screen scale | 79.2 CSS px |
| Hero height at the actual desktop viewport | 726.43 CSS px | 763.54 CSS px, approximately 687.19 at the original screen scale | 690.78 CSS px |

The old viewport-based heading largely cancelled the apparent zoom reduction. The preferred reference's more useful difference was its capped content area and larger gutters. The new `74.25rem` cap reproduces that containment at 1440px; the heading receives a selective, approximately 5% reduction at this width. Its three-line composition remains intact.

Header, hero copy, values and subsequent sections share the same grid. The photograph remains full bleed. The hero can grow with content: at 1440 × 900 it is 820px tall; on a shorter screen it scrolls naturally. Body/root text remains 16px, with existing 16–18px editorial copy. Principal controls retain their 44–52px target heights. There is no application zoom, shell scale, browser-zoom script or reduced root font size.

## Cards and interaction

Each card remains one semantic anchor, including its visual arrow. Titles start together, descriptions reserve consistent space, and the longer Organizations label can wrap. The three card heights match at each checked width: approximately 438.38px at 1440, 429.71px at 1024, 371.14px at 768, 450.65px at 390 and 399.62px at 320.

Fine-pointer hover scales only the clipped photograph to 1.02 and moves the arrow by 3px, with a restrained border/surface change over 180ms. Actual Chrome hover was inspected; an intermediate frame measured image scale 1.01965 and arrow travel 2.95px. All three card rectangles remained exactly unchanged. Text and neighboring layout stay still. Native CSS transitions reverse when the pointer leaves.

Keyboard focus has a visible 3px river-blue outline outside the photograph's clipping region. Pressed feedback changes the border/arrow surface immediately, without a navigation delay or pointer-down handler. Ordinary card activation to Give Support and Organizations was exercised. A held-pointer screenshot attempt timed out in browser tooling, so no claim is made that a pressed-state recording was captured.

Decorative hover is limited to `(hover: hover) and (pointer: fine)`. Reduced-motion emulation in Chrome confirmed `0s` transitions and `none` for image and arrow transforms. Forced-colors emulation confirmed system colors and automatic color adjustment; focus uses `Highlight`. Physical touchscreen and screen-reader testing were not performed. No supported interaction-recording API was available; the hover evidence is live browser inspection plus measured state, not a claim inferred from static screenshots.

The blue pointer halo seen in some Chrome captures belongs to the automation cursor. No app-owned halo was found on these components. Keyboard focus remains intentionally visible.

## Editorial images and warm callout

About places `community-giving.webp` beside the intro, with its Find Support action directly beneath the explanation. `healthcare-support.webp` sits beneath the left-hand heading in the three-audience section. The existing numbered explanations, links and limitations remain intact.

Organizations uses `food-support.webp` beside its introduction. The two actions and access explanation remain together. Assigned-access requirements and the absence of public onboarding are stated explicitly. These sections stack below 900px, with copy/action before the image. The 3:2 frames preserve the supplied community-photo compositions; intrinsic dimensions reserve space. Intro images load eagerly and the supporting About image loads lazily.

Images retain their generic illustrative captions and are not presented as evidence of real providers. All seven production image files still match the manifest hashes; no images were enlarged, sharpened, recolored or regenerated.

Only the specified Support callout changes from `--og-blue-soft` to the existing warm `--og-surface-soft` (`#eeeee6`). Its existing `#dedfd6` border, charcoal text, copy, link and responsive behavior remain. Blue links and meaningful map colors remain.

No standalone approved facility photograph was found. The labeled thumbnail was not used. See [the facility asset brief](community-facility-asset-brief.md), requesting a suitable source of at least 1600 × 1200 pixels. This does not block the current community-image composition.

## Validation and limits

- **Automated tests:** `npm test` passed again after the last CSS/markup refinements: 23 tests, 0 failures, 0 skipped, 52.96 seconds. Recorded in `output/visual-polish/npm-test-final.log`.
- **Production build:** `npm run build` passed under Node 24.19.0, including environment checks, TypeScript checks and the Vite production build (76 modules). The first attempt was terminated with exit 137 during type checking; retry with a bounded Node heap passed. The existing legacy demo chunk warning remains: 549.75kB minified / 138.38kB gzip. No configuration was changed to hide it.
- **Responsive checks:** Homepage, About, Organizations, Support and Give were checked at 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 and 320 × 700. No horizontal overflow or clipped principal controls was found. Cards maintain consistent heights. Family faces, child and raised arms remain visible in the responsive image composition.
- **Actual desktop:** Checked at 1440 × 722, and at 1440 × 778 while the debugging infobar was absent. The browser was restored to 100% after zoom testing.
- **200% enlargement:** Chrome's toolbar explicitly reported 200%; its content viewport became 720 × 361. All five routes reflowed without horizontal overflow or off-screen text/control bounds. The collapsed menu opened and its Account link worked. This tests browser text enlargement/reflow, not every operating-system font setting.
- **Keyboard:** Visible card focus; mobile Menu opens with Enter, Escape closes it and returns focus to Menu. Principal navigation and account entry work.
- **Contrast:** Visual inspection was supplemented with a conservative calculation using the actual source image, observed `object-fit` geometry, computed neutral overlays and DOM text-line rectangles, including whitespace. The lowest estimated normal-text contrast was **4.65:1 at 1024px**; at the shorter actual desktop it was **4.78:1**. The display heading was at least **5.71:1**. At tablet/mobile sizes copy is on solid paper: muted body text is **5.99:1**; primary-button text is **13.35:1**. These are estimates from the rendered geometry/source pixels, not a complete accessibility certification. Details: `contrast-geometry.json`, `stable-button-colors.json`, `contrast-results.json` and `check-contrast.py` in the output directory.
- **Smoke flows:** Homepage → Find Support → Harrisburg demo result → fictional resource detail → return to the filtered search; homepage Give Support and Organizations cards; About audience links; Organizations sign-in → Account; directory callout → About. Fictional demo labels and unavailable contact/direction safeguards remain visible. No correction or staff write was submitted.
- **Runtime:** Final fresh-page browser checks reported no console errors and loaded image resources. Browser automation intermittently timed out or showed a failed/unfinished load during capture; fresh loads recovered, and local HTTP checks continued to respond. Draft captures with unfinished image painting are not the curated review set below.
- **Live integrations:** Local fixtures do not verify Google, Supabase or Mapbox. The current preview has the existing sign-in-unavailable and map-unavailable states. No live-provider configuration was changed.

## Review captures

The following are actual browser captures, not mockups. `final-*.jpg` is the curated review set. Baselines and intermediate validation attempts are retained under `screenshots/working/`. Browser screenshots are JPEG; older working filenames used a `.png` extension despite their JPEG encoding.

| View | Capture |
| --- | --- |
| Homepage, 1440 × 900 at 100% | [Desktop](../../output/visual-polish/screenshots/final-home-desktop.jpg) |
| Homepage, 390 × 844 at 100% | [Mobile](../../output/visual-polish/screenshots/final-home-mobile.jpg) |
| Homepage, 1024 × 768 / 768 × 1024 / 320 × 700 | [1024px](../../output/visual-polish/screenshots/final-home-1024.jpg), [768px](../../output/visual-polish/screenshots/final-home-768.jpg), [320px](../../output/visual-polish/screenshots/final-home-320.jpg) |
| Cards, resting | [Resting](../../output/visual-polish/screenshots/final-cards-resting.jpg) |
| Cards, actual pointer hover | [Hover](../../output/visual-polish/screenshots/final-cards-hover.jpg) |
| Cards, keyboard focus | [Focus](../../output/visual-polish/screenshots/final-cards-focus.jpg) |
| About introduction | [Intro](../../output/visual-polish/screenshots/final-about-intro.jpg) |
| About three-audience section | [Audiences](../../output/visual-polish/screenshots/final-about-audiences.jpg) |
| Organizations introduction | [Organizations](../../output/visual-polish/screenshots/final-organizations-intro.jpg) |
| Revised directory callout | [Warm callout](../../output/visual-polish/screenshots/final-warm-callout.jpg) |

The imagery is still the supplied illustrative photography rather than provider-specific documentary evidence. A larger original family hero would improve sharpness on high-density desktop displays; the current 1672 × 941 source was preserved. Platform serif rendering also varies across operating systems. These are remaining visual limits, not reasons to upscale a thumbnail.

The local frontend remains at **http://127.0.0.1:18417/**, with the in-memory demo API on loopback port 18787. Both are kept running for review. Final checks returned HTTP 200 for the frontend and `{"status":"ok"}` from both the proxied and direct API health endpoints. No public deployment was made.

## Guidance applied

Read the local [Apple Design skill](../../.agents/skills/apple-design/SKILL.md), project design documentation, image manifest and approved references. The implementation follows restrained grouping/alignment and brief, purposeful feedback from Apple's [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) and [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) guidance. Validation considered W3C [Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) and [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). No optional inspiration-site animation was claimed as inspected or copied.
