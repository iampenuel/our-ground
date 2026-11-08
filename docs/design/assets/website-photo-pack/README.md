# Our Ground — Website Photo Pack

Seven individual image assets for the approved Our Ground visual direction. These are standalone generated photographs, not enlarged tiles extracted from a contact sheet.

## Install

Copy the contents of `public/images/our-ground/` into the same path in your existing `our-ground` project. Keep the PNG masters in `source-images/` outside the site's public directory; they are supplied for editing and inspection, not to be loaded automatically by the website.

The filenames match the existing Codex handoff. This archive does not contain application code or modify any routes, authentication, database configuration, or services.

## Actual resolution — no hidden upscaling

| Web file | Standalone source | Web export | Intended use |
|---|---|---|---|
| `hero-family-desktop.webp` | 1672 × 941 | 1672 × 941 | Homepage desktop hero |
| `hero-family-mobile.webp` | 941 × 1672 | 768 × 1365 | Homepage mobile hero |
| `landscape-story.webp` | 1912 × 823 | 1912 × 797 | Mission, story, or exploration banner |
| `flowers-search.webp` | 2172 × 724 | 1920 × 640 | Find Support header |
| `food-support.webp` | 1536 × 1024 | 1200 × 800 | Food category or general food-support editorial imagery |
| `healthcare-support.webp` | 1536 × 1024 | 1200 × 800 | Healthcare category or general healthcare editorial imagery |
| `community-giving.webp` | 1536 × 1024 | 1200 × 800 | Giving and organization editorial sections |

The desktop family master was generated at 1672 × 941, not at the earlier requested 2560 × 1440. It is delivered at its actual resolution rather than enlarged and mislabeled. The landscape master is 1912 × 823; its wide export is 1912 × 797, slightly below the earlier 1920 × 800 target. Other web exports meet the requested sizes and are downsampled from larger sources. These are not native 4K files.

The mobile image is a separately generated portrait adaptation. It is visually coordinated with the desktop scene but is not an exact crop of the same pixels. Use responsive art direction deliberately.

Inspect full images at 100% before choosing display scale. A full-width 1440px hero is within the desktop source's horizontal pixel count at 1×; high-density or larger displays may need a larger original in a future photography pass. Do not create a `2x` or `4k` variant by merely enlarging this file.

## What is in the pack

- `public/images/our-ground/`: seven WebP production-path files.
- `source-images/`: seven unchanged individual PNG masters.
- `asset-manifest.json`: actual sizes, hashes, provenance, suggested alternative text, and focal points.
- `docs/design/photo-integration.md`: concise Codex instructions.
- `preview.jpg`: index of the actual WebP exports, for orientation only.
- `preview.html`: offline gallery with links to full files and source PNGs.

## Photography and truthfulness

All scenes are synthetic photographic illustrations. They must not be presented as photos of Philabundance, another named organization, a specific medical provider, real patients, verified service delivery, or an actual Pennsylvania location. This pack provides atmosphere and generic category imagery, not evidence that a provider exists or offers a service.

Use them for the homepage, story sections, and generic category images. Real provider profile photography must come from an appropriate source, or be visibly identified as illustrative. Do not add names, logos, service availability, hours, donation totals, or verification badges based on these images.

Maps, icons, typography, buttons, overlays, and resource cards must remain real code. No generated map texture is included. Preserve the product's actual data and safety behavior.

## Image handling

- Use `hero-family-desktop.webp` at desktop and `hero-family-mobile.webp` for a deliberately art-directed mobile layout.
- The desktop family is toward the right. Place headline copy to the left without covering faces.
- Preserve the mobile family. Place copy in the upper area or in an adjoining light section, rather than forcing text across the child's face.
- Use CSS overlays only where needed for text contrast. Do not blur the entire photograph or apply an extra orange/green filter.
- Load the primary hero eagerly, avoid lazy-loading the above-the-fold hero, and lazy-load noncritical below-the-fold photographs.
- Set image dimensions/aspect ratios in the layout to avoid image-related layout shifts.
- For purely decorative images use empty alt text. For content images, adapt the suggested alt text in the manifest to the actual page context.
- Do not publish the preview/contact sheet as a site asset. It is an index, not a source to crop.
