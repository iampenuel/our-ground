# Codex — Integrate the Our Ground standalone photographs

Read `.agents/skills/apple-design/SKILL.md`, the existing design brief, this pack's README, and `asset-manifest.json` before editing. Preserve the approved UI and completed Phase 1–2 work.

## Scope

Integrate these seven existing files in `public/images/our-ground/`. Do not regenerate a website screenshot, copy a contact sheet into CSS, extract thumbnails, install a new framework, or change backend functionality.

| Area | Asset |
|---|---|
| Desktop homepage hero | `hero-family-desktop.webp` |
| Mobile homepage hero | `hero-family-mobile.webp` |
| Find Support header | `flowers-search.webp` |
| Mission/story and lower landscape banner | `landscape-story.webp` |
| Generic food-support tile | `food-support.webp` |
| Generic healthcare tile | `healthcare-support.webp` |
| Giving/organization storytelling | `community-giving.webp` |

These are generated illustrations, not authentic photographs of any listed provider. Do not identify them as evidence of real services, specific locations, or real beneficiaries. Preserve existing fictional-demo labels. Do not introduce unimplemented housing or other categories just because an earlier mockup showed them.

## Resolution and responsive behavior

Read actual pixel sizes from the manifest. The desktop hero is native 1672 × 941, not native 2560px or 4K. The landscape export is 1912 × 797. Do not silently upscale either to claim a higher-resolution source. The portrait family asset is a separate coordinated image, not a literal crop of the desktop source.

Use a responsive `<picture>` for the family hero, not two simultaneously downloaded full-size backgrounds. Preserve the family on the right in desktop framing. In mobile framing, keep faces unobscured and move the copy above the photo when necessary. Test actual cropping rather than assuming `object-fit: cover` always works.

## Required behavior

Replace temporary photo placeholders only where the corresponding asset is successfully loaded. Preserve sensible image-error handling. Keep all text, search, buttons, and maps as native HTML/CSS/components. Do not add heavy blur, animation, orange grading, or fake moving imagery. Use only restrained overlays for readable copy. Avoid making decorative headers so tall that search is pushed out of the first viewport.

## Verification

Inspect at 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844, and 320 × 700. Check image loading, focal points, text contrast, keyboard behavior, reduced motion, and no horizontal overflow. Inspect at 100% zoom. Run `npm test` and `npm run build`. Record actual results; do not claim real database, authentication, or map verification from these image changes.

Deliver screenshots and a concise report of integrations and remaining discrepancies. Do not deploy. Do not redesign unrelated routes.

## Project decisions for this integration

The supplied guidance above was adopted after comparison with the Phase 3 request; no prior project photo-integration file existed. The direct request authorizes selective use, so the healthcare asset is imported and verified but remains unused until an appropriate generic editorial section exists. Resource cards and details keep their neutral category treatment.

The homepage uses the family pair, wildflowers, food-sharing and river imagery. The existing giving context section uses the community-garden image with an explicit illustrative caption. The organization entry page remains focused on access and instructions without an added banner. See `phase-3-photo-integration.md` for exact mappings, crop decisions and validation.

Original package documentation and the unchanged manifest live together in `assets/website-photo-pack/`. Manifest paths beginning `source-images/` refer to the original ZIP and temporary staging directory, not browser assets. Only the seven WebPs were copied into `public/`; the PNG masters and package previews are not served.
