# Our Ground — Approved Visual References

Design direction: Documentary Editorial Modernism x Cartographic Utility.

## Source-of-truth hierarchy
1. These two approved reference PNGs define visual composition, brand atmosphere, content hierarchy, and photographic feel, **not working behavior or factual data**.
2. Existing API contracts and validated records define available data and live product claims.
3. This document guides implementation decisions where not specified in the references.

## Design principles
- Editorial, confident type; warm cream/white negative space; charcoal ink.
- Mature river blues, landscape greens and restrained sunflower gold, largely carried by photography, not UI decoration.
- Credible documentary photography with real-life anatomy/skin and natural sharp subject detail.
- Family-in-open-meadow hero, wildflowers for find-support section, scenic landscapes and grounded community giving imagery.
- No neon, glows, artificial stats, unearned verification badges, irrelevant globe animation, low-contrast microtext, or fictional live availability.
- Homepage: purpose and clear destinations for Find Support, Give Support, and Organizations.
- Resident discovery: accessible filter/search plus independently usable results list and live map when available.
- Resource details: practical facts first (contact, hours, eligibility, directions, source status) and clear uncertainty.
- Use Apple Design skill for interaction discipline (immediate feedback, reversible navigation, reduced motion), not as a mandate for glass or parallax.

## Important asset warning
These PNG files are **reference contact sheets**, NOT production background images. Do not crop tiny tiles and upscale them. Store separately generated high-resolution photos as individual .webp files under public/images/our-ground/ once approved. Render maps, buttons, typography, forms, icons, and pins in actual code.

## Existing engineering boundaries
- Keep Vite and TypeScript; retain existing REST API and service routing.
- Don't disable anonymous search or safety behaviors for fictional data.
- Keep real Supabase, OAuth, Mapbox integration verification distinct from demo data behavior.
- No user-identifiable or sensitive health information in demo assets.
