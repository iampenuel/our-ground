# Our Ground — verified healthcare & community image pack

**Two preferred production images, two wide alternatives, and responsive WebP derivatives.**
The full archive also includes four PNG masters. All source image sizes are preserved;
no upscaling has been performed. Check `image-manifest.json` for dimensions, SHA-256
hashes, and intended page placement.

## Primary approved placements

| Page | Preferred image | Real source dimensions | Purpose |
|---|---|---|---|
| `/give` | `community-health-outreach-editorial.webp` | 1536 × 1024 | Intro image (community healthcare outreach) |
| `/organizations` | `community-resource-exterior-editorial.webp` | 2048 × 1377 | Intro image (unbranded neighborhood resource center) |

For responsive layouts, prefer the `-1200.webp` and `-780.webp` derivatives where
appropriate; inspect the actual composition and ensure the full-size image is not
upscaled or stretched. The `*-wide-alt.webp` files are real, non-upscaled crops of
the two-panel source collage, not native full-size photographs. They are **optional**
and should not replace the two standalone primary images by default.

## Exact folder destinations

- Copy `public/images/our-ground/*.webp` into the Vite project's matching folder.
- Copy `docs/design/assets/phase-6-image-pack/` documentation into its matching folder.
- Full package only: `originals/*.png` are the PNG masters; **do not** serve them
  instead of optimized WebPs by default.
- `preview.jpg` is review-only, not a web image.

Extract into a temporary staging folder first and review file collisions before
copying into the repository. Do not overwrite the root project README or replace
existing approved photography. Preserve Git status/history. Verify hashes with
`image-manifest.json` before and after copying.

## Our Ground's AI and imagery transparency

The two primary images and both wide alternatives are **AI-generated, illustrative
editorial scenes**, not actual facilities, healthcare providers, individuals,
partnerships or outreach events.

The owner prefers a **single accessible site-wide AI and imagery disclosure**
(e.g. `/about#ai-and-imagery`) linked discreetly from the footer, instead of a
repeated bulky label under every generic editorial picture. See `AI-AND-IMAGERY-HANDOFF.md`
for precise implementation requirements. The central disclosure must be easy to
find and truthful. Where an image could falsely imply a specific provider's
identity, actual location, service, verification or event, use genuine authorized
provider photography or keep a neutral placeholder. Do not use synthetic images
as provider listing photos.

The Gemini grounded resource assistant is **planned, not implemented** unless
later code and tests prove otherwise; the disclosure must distinguish current
AI-generated editorial images from future AI-assisted resource explanations.

## Quality and provenance

- Primary healthcare original: 1536 × 1024 PNG; corresponding source-size WebP.
- Primary building original: 2048 × 1377 PNG; corresponding source-size WebP.
- Wide alternates: 1536 × 508 and 1536 × 511, cropped from the provided composite,
  with no reconstruction of missing pixels.
- All photos are synthetic and intended for generic storytelling only.
- Existing sourced/fictional resource labels, availability warnings and audit trails
  must not be removed merely to centralize **photography** disclosure.
