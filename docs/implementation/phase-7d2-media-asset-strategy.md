# Phase 7D.2 — Institution media strategy

The old detail hero displayed a dashed box, plus icon and “Temporary photo placeholder.” It implied unfinished content and supplied no useful visual hierarchy. It has been removed.

## Selection and truthful presentation

`src/institution-media.ts` provides one deterministic renderer for detail pages and result cards. Its order is reviewed approved institution image → reviewed official logo → reviewed official website image → category illustration → neutral monogram if the image cannot load. A reviewed entry binds source namespace, exact source identifier, name, full recorded address, city/state and official website domain. Duplicate bindings, changed identities or domain conflicts fail closed. Similar names never attach imagery. Fictional records cannot gain official identity media.

The review manifest is currently **empty**. No existing record had an approved institution-specific asset, and research did not establish reusable official media. The Saint John's official page returned 403 during source inspection; this was not bypassed. Mazzoni's publicly indexed branding material did not establish permission for this use. No automatic logo service, website crawler, arbitrary URL-fetch endpoint or hotlinking was added. No AI was used to create logos, and no institutional mark was invented.

The active fallbacks use byte-identical existing About images:

- Healthcare: `/images/our-ground/healthcare-support.webp`.
- Food: `/images/our-ground/community-giving.webp` (the approved About lead/giving image).

These existing editorial images are AI-generated illustrations, **not photographs of the named organization, its staff or clients**. Details explicitly say “Category illustration · not this provider” and link to the existing imagery disclosure. Compact cards say “Illustration”; the visible source-label/disclosure system explains their category role. No public asset was regenerated or modified.

## Frame and loading rules

Every media frame has a stable 1:1 ratio, calm neutral surface and consistent radius. Images crop with `object-fit: cover`; logos use `object-fit: contain`, intrinsic aspect ratio and a maximum 72% of the frame in either dimension, leaving at least 14% space per side. Intrinsic `width:auto; height:auto` prevents low-resolution marks from being enlarged. Original color is retained. There are no glows, gradients, fake upload borders, SVG injection or color filters.

Only reviewed local `.webp`,`.png` or`.jpg` paths under `/images/institutions/` can be institution assets. A review needs an official HTTPS source, checked date, dimensions and rights note. No remote image URL or executable SVG is accepted. Detail images load eagerly; card images load lazily with async decode, fixed dimensions and no-referrer. Source links use noopener/noreferrer. Rendering never waits for a website fetch.

A failed reviewed image makes at most one same-origin category fallback attempt. A failed category image hides the broken element and exposes a neutral escaped initial. It does not loop, retry a third-party host, invent a logo or shift the layout. Existing public-asset cache behavior remains; there is no new unbounded network or data cache.

## Adding a real logo later

1. Establish the correct institution and location from its exact recorded identity and official domain; resolve conflicts first.
2. Obtain an approved asset or establish permitted reuse from an authoritative source. Record the source, date and permission/rights basis. A public image URL alone is insufficient.
3. Inspect and store a bounded local raster, retain original aspect/colors, record dimensions and content hash. Keep source imagery out of live browser requests.
4. Add the reviewed binding plus assets to `institutionMediaReviews`; choose a versioned local filename. Do not add fuzzy matches or infer a provider photo from a category image.
5. Run the media identity, path/URL, fictional-record and fallback tests. Check wide/tall and low-resolution logos at card/detail sizes before release.

## Actual validation

Five deterministic media tests pass as part of 320 total tests. The compiled Chrome fixture demonstrates approved-image priority, wide/tall logo containment, official-image priority, both category fallbacks, broken-image fallback and final monogram. Its geometric patterns are **explicit technical fixtures, not real organization logos**, created only in the temporary fixture build and excluded from production assets. Actual HRSA detail/card pages show approved category imagery in the built preview. Screenshots and evidence are [packaged locally](../../output/phase-7d2-7f/README.md).

A real third-party logo display remains **unverified/unpopulated pending an approved asset**. The renderer and safe fallback experience are implemented; this report does not relabel a synthetic test as an official institution asset.
