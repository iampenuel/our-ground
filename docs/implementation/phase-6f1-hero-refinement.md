# Phase 6F.1 — Hero refinement

Local implementation on 29 October 2026. No deployment, push, generated imagery, dependency changes, backend changes or provider configuration changes.

## Owner feedback and scope

The owner requested a softer gradient, a closer relationship between copy and the people/table/chair, and removal of the white People / Places / Possibilities band. This refinement uses the currently approved framed-wall courtyard WebP and preserves the headline, paragraph, CTA wording/destinations, shared navigation, other homepage sections and all other routes.

Applied the already-read `.agents/skills/apple-design/SKILL.md`: restraint, clear hierarchy, readable text, predictable focus and purposeful interactions. The new instruction supersedes Phase 6F’s placement of the supporting row outside the hero.

Exact Phase 6F.1 files changed:

- `src/landing.ts`: moves the existing supporting row into the hero as a named group and preserves a word space when its line break is hidden on mobile; wording and destinations are unchanged.
- `src/landing.css`: hero-only gradient, image framing, row placement and responsive rules.
- `docs/implementation/phase-6f1-hero-refinement.md`: this report.

The preceding Phase 6F record was also written to `docs/implementation/phase-6f-editorial-hero.md` to retain that phase’s intermediate measurements, test/build history and known limits. Its earlier asset and photography-helper changes are listed there. No image files or photography configuration were changed for 6F.1. Local evidence and an ignored text-enlargement fixture remain in `output/`.

## Gradient and framing

Replaced the almost-solid left plateau with a continuous neutral charcoal wash that falls progressively across the photograph. A feathered image edge begins farther left; a separate bottom wash supports the small lower-row text. Both treatments are CSS, not baked into the image. No blur, generated fill, retouching or green overlay was introduced. The bottom treatment is concentrated near the table and row rather than the faces.

The photograph now occupies `min(92%, 1400px)` of the desktop hero, anchored right with `object-fit: cover` and `object-position: right 45%`. This brings wall detail and the chair/table closer to the text. At 1440px, its box moves from x=373.9 to x=115.2 and from 1066.1px to 1324.8px wide. The image plane is approximately 1324.8 × 745.6 inside the 640px hero: a limited vertical crop of about 47.5px above and 58.1px below. All four people, the child’s chess interaction, framed wall, greenery and useful table context remain visible. Source proportions are preserved. The largest ordinary desktop image plane is 1400px wide, below the supplied 1672px source width; no source-resolution upscaling.

The main composition and supporting row share one 640px hero at all tested desktop widths. This is smaller overall than Phase 6F’s 600px hero plus a separate 121px purpose row at 1440px. At 1440 × 900, the header plus complete refined hero ends at y=721 and the next editorial section is visible.

## Supporting row and mobile

People / Places / Possibilities uses warm-white body text and near-white labels within the same hero. On desktop, the photograph and bottom wash continue behind it. There is no separate white slab or isolated panel.

Below 1024px, copy and both actions come first, followed by the complete landscape photograph. Its lower edge fades into the same charcoal base, which continues behind the supporting row. The image does not become a portrait crop. Narrow rows use bounded columns and word wrapping; Possibilities spans both columns. The hero ends after the row and transitions directly to the unchanged paper-colored community section.

The exact existing WebP is still loaded eagerly at high priority with intrinsic 1672 × 941 dimensions. It is one 478,384-byte image, including on mobile. No smaller landscape derivative was supplied; the supplied portrait removes group context, so it remains unused. No duplicate desktop/mobile download is introduced.

## Measurements and visual checks

Normal checks used scroll zero, browser visual scale 1, DPR 1 and the following actual CSS viewport sizes. Image boxes reflect the container, not the cropped image plane.

| CSS viewport | Header px | Complete hero px | Image box px | Horizontal overflow |
|---|---:|---:|---|---|
| 1665 × 900 | 81 | 640.0 | 1400.0 × 640.0 | No |
| 1440 × 900 | 81 | 640.0 | 1324.8 × 640.0 | No |
| 1366 × 768 | 81 | 640.0 | 1256.7 × 640.0 | No |
| 1024 × 768 | 81 | 640.0 | 942.1 × 640.0 | No |
| 768 × 1024 | 77 | 946.7 | 768.0 × 432.2 | No |
| 390 × 844 | 77 | 845.9 | 390.0 × 219.5 | No |
| 320 × 700 | 77 | 823.2 | 320.0 × 180.1 | No |

The original typography remains: at 1440px, headline 69.12px with 70.5024px leading; body 17px. At 1024px, CTAs wrap into two rows without clipping. Mobile headline sizes remain 42.9px at 390 and 40px at 320. Header gutters and behavior are unchanged.

Before screenshots are copied from the prior production build; final after screenshots come from the newly built production preview. Full measurement JSON is retained beside them.

| View | Before | After |
|---|---|---|
| 1440px desktop | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f1/before-1440.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f1/after-1440.jpg) |
| 390px mobile | [Before](/Users/admin/Documents/Projects/our-ground/output/phase-6f1/before-390.jpg) | [After](/Users/admin/Documents/Projects/our-ground/output/phase-6f1/after-390.jpg) |

All seven final browser screenshots were opened and visually inspected. All seven widths are saved as `output/phase-6f1/after-{width}.jpg`; a full mobile page and a hero-to-next-section detail are also captured for the lower row review.

## Accessibility and safeguards

Estimated contrast uses actual DOM text-line rectangles, decoded approved-image pixels, object-fit cropping, the mask and both CSS overlays. Conservative minima across the sampled text regions: headline 8.96:1, paragraph 5.86:1, secondary CTA 9.96:1, lower labels 5.75:1 and lower body text 7.99:1. Mobile text is on solid charcoal and exceeds 13:1. These exceed 3:1 large-text and 4.5:1 normal-text targets. The calculation is evidence for this composition, not whole-site accessibility certification. See `output/phase-6f1/contrast.json` and `contrast-check.py`.

Keyboard verification: Enter opens the native mobile menu; Escape closes it; Tab reaches the primary hero CTA; its focus outline is visible (3px light gold). Enter follows Find Support, and Give Support reaches its existing page with the limitation note intact. No form or live provider search was submitted.

At 200% root-font size, 1440px, 390px and 320px hero content grows naturally. No hero descendant overflows horizontally; button scroll dimensions match their visible dimensions, and both actions remain reachable. The supporting row now wraps within bounded columns. Pre-existing mobile navigation and lower-page card overflow at this unusually narrow 200% text-only setting remains outside the requested hero scope; no claim of whole-page 200% compliance is made.

The hero has no motion. Existing global `prefers-reduced-motion` rules still disable animation/transitions and pathway transforms. This was checked in source; the available browser controls do not expose reduced-motion emulation, so an OS preference toggle was not performed.

A baseline hash check of 94 non-image implementation/configuration files found changes only in the two listed homepage files. The hero image SHA-256 remains `5712899b71de7d1ace233752bf0d599b5fb527ffcd30ca08b62d778e3119d560`.

The centralized `/about#ai-and-imagery` link, fictional-demo safeguards, authentication and discovery implementations are unchanged. No new Geoapify or Google live queries were made for this phase.

## Tests, production preview and limits

- `npm test`: 63 passed, 0 failed, 0 skipped, 69.56 seconds, Node 24.19.0. Log: `output/phase-6f1/test.log`.
- Build attempt 1: OS killed frontend type checking, exit 137, without a TypeScript diagnostic. Log: `output/phase-6f1/build.log`.
- Build attempt 2: succeeded, including environment checks, frontend/backend type checks, 92 modules and a production bundle completed in 1m 30s. The existing large demo/MapLibre chunk warnings remain. The subsequent whitespace-only correction did not change behavior; the existing test run was not repeated. The final production build/type checks were rerun. Uses the established memory settings (`GOMEMLIMIT=128MiB`, `GOMAXPROCS=1`, `GOGC=20`, Node heap 256 MiB) and a staged output directory. Log: `output/phase-6f1/build-retry.log`.
- Final copy build attempt 3: also OS-killed during frontend type checking, exit 137. Log: `output/phase-6f1/build-final.log`.
- Attempt 4: succeeded, including all environment/type checks and the 92-module production bundle (1m 11s), with the temporary development server stopped, inspection tabs closed, Go memory target 96 MiB, `GOGC=10`, one Go worker, and Node heap 192 MiB. Log: `output/phase-6f1/build-final-retry.log`.
- The second build was promoted only after success. All six preview checks passed (frontend, direct/proxied API health, demo ZIP, fictional search, fictional-detail safeguards), and the production homepage had zero console errors. The successful final copy build was then promoted, with the preceding output retained locally. Final health check `preview-final-ready.log`: all six checks passed. An earlier check ran before the restarted server began listening and failed for that reason (`preview-final-check.log`); it is retained. The final browser DOM confirmed “A healthier, more connected tomorrow.” with its restored space. Phase 6F.2 was then requested; its before captures document this exact production state.

The development server emitted repeated spurious file-change restarts during validation. For inspection, its watcher was disabled using runtime options only; it was then stopped to reduce memory pressure during the final build. No repository configuration or environment file was edited. Production review is independent of development HMR; the production preview and API are the services retained for review.

Local review URL: [http://127.0.0.1:18418/](http://127.0.0.1:18418/). The final built output is served at this URL; verification is recorded above. The API and production preview remain running for the owner.
