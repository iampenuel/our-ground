# Phase 5 — complete image inventory

Audit date: 2026-10-28. Audit/documentation only. No application, CSS, asset, environment, database, or deployment change was made. Recommendations below await owner approval.

## Scope, counting and conclusions

**15 image/asset records**: 13 current image locations (9 editorial placements, 1 provider-photo placeholder, 3 legacy demo uses), 1 dormant asset and 1 proposed new Give Support placement. The machine-readable manifest also includes **16 functional/no-photo area records**, for **31 total inventory decisions**. A responsive `<picture>` is one slot; its two family source files are counted separately only in the file inventory. A resource template is one slot, not one slot per fictional record.

- **Missing: 1 current photo slot**, the provider-photo placeholder (IMG-10, primary G / secondary D). It is an intentional honest placeholder, not a broken request. No broken editorial image was observed in settled baseline pages. The proposed Give Support introduction is F, not an existing missing-image bug.
- **Reusable: 8 distinct existing files**: all 7 editorial WebPs plus the NASA texture for the isolated legacy demo. This is not permission to present synthetic editorial files as authentic provider photos.
- **Repeated or inappropriate/weak: 5 records**: 2 unnecessary repeated placements (IMG-06, IMG-07), 2 active/conditional legacy concerns (IMG-12, IMG-13), and 1 inappropriate dormant asset (IMG-14). Only 4 of these have current route consumers. The flowers shared between the homepage and Find Support are intentional continuity and excluded from this count.
- No P0 image purchase/generation is necessary to keep search usable. Highest image priority is **P1 Give Support healthcare outreach**; authentic provider photos are **P1 conditional on real records, consent and a future photo contract**. **P2 generic facility exterior** improves Organizations. No new image is recommended for functional maps or empty states.

The Apple Design skill informed restraint, immediate feedback, spatial consistency and readable typography. Its generic material/motion examples do not override this project's approved minimal editorial direction. Existing links, controls, focus treatments and text remain code; photographs do not replace interface components.

## Evidence and context

Read the project design README, phase 1–4 reports, photo-integration notes, photo-pack README/manifest, facility brief, approved triptych and photography moodboard. Inspected current route modules, shared typography/navigation/photo styles, other frontend stylesheets, lazy imports, API contracts, CSS image URLs/pseudo-elements, public files, conditional templates, and full-page renders. Raster metadata is measured from files, not guessed from screenshots. No reference screenshot or contact-sheet crop is a production image source.

Source citations below use the audited working tree, including existing uncommitted work; line numbers refer to that snapshot. [Source hashes](../../output/phase-5-audit/baseline-files.json), [asset metadata](../../output/phase-5-audit/asset-metadata.json), [browser observations](../../output/phase-5-audit/browser-observations.json) and individual DOM/metrics files are retained under `output/phase-5-audit/`.

## Route coverage

Route dispatch: [src/main.ts:5](/Users/admin/Documents/Projects/our-ground/src/main.ts:5). `/about` is rendered by the final info branch; other unknown paths render recovery. Trailing slash normalization introduces no additional unique page. `/resources/…` and `/staff/services/…` are prefix routes, not separate organization-profile routes. No extra active page was discovered.

All ten baseline route templates were inspected through the footer at **1440×900, 768×1024 and 390×844, 100% zoom**. Screenshots are full-page, so their image heights exceed the viewport. Baseline DOM measurements show viewport scale 1 / CSS zoom 1 and no horizontal overflow. Focus outlines in some captures reflect keyboard traversal, not a visual defect.

| Route / state | Desktop | Tablet | Mobile | Whole-page coverage |
|---|---|---|---|---|
| `/` | [1440px](../../output/phase-5-audit/screenshots/home-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/home-768.jpg) | [390px](../../output/phase-5-audit/screenshots/home-390.jpg) | Hero, values, mission, all three cards, closing statement, footer |
| `/support` | [1440px](../../output/phase-5-audit/screenshots/support-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/support-768.jpg) | [390px](../../output/phase-5-audit/screenshots/support-390.jpg) | Photo hero, form, filters, initial empty state, list/map controls, unavailable map, limits, help callout, footer |
| `/resources/:id` | [1440px](../../output/phase-5-audit/screenshots/detail-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/detail-768.jpg) | [390px](../../output/phase-5-audit/screenshots/detail-390.jpg) | Fictional pantry: hero placeholder, section links, warning, hours, services, eligibility/cost, map fallback, correction disclosure, sidebar, footer |
| `/give` | [1440px](../../output/phase-5-audit/screenshots/give-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/give-768.jpg) | [390px](../../output/phase-5-audit/screenshots/give-390.jpg) | Text introduction/actions/limits, instructions, lower garden photograph and caption, footer |
| `/organizations` | [1440px](../../output/phase-5-audit/screenshots/organizations-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/organizations-768.jpg) | [390px](../../output/phase-5-audit/screenshots/organizations-390.jpg) | Intro, food photo/caption, access limits, both lower sections, footer |
| `/about` | [1440px](../../output/phase-5-audit/screenshots/about-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/about-768.jpg) | [390px](../../output/phase-5-audit/screenshots/about-390.jpg) | Intro garden, healthcare photo, three audiences, practical steps, honest limits, footer |
| `/account` | [1440px](../../output/phase-5-audit/screenshots/account-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/account-768.jpg) | [390px](../../output/phase-5-audit/screenshots/account-390.jpg) | Not-configured access state, public-search sidebar, access note, footer |
| `/staff/services/:id` | [1440px](../../output/phase-5-audit/screenshots/staff-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/staff-768.jpg) | [390px](../../output/phase-5-audit/screenshots/staff-390.jpg) | Not-configured state, recovery action, publication guidance, footer |
| `/demo` | [1440px](../../output/phase-5-audit/screenshots/demo-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/demo-768.jpg) | [390px](../../output/phase-5-audit/screenshots/demo-390.jpg) | Globe, legacy labels, controls, credit, stage navigation; region and needs states additionally reviewed at tablet |
| `unknown /phase-5-missing-page` | [1440px](../../output/phase-5-audit/screenshots/404-1440.jpg) | [768px](../../output/phase-5-audit/screenshots/404-768.jpg) | [390px](../../output/phase-5-audit/screenshots/404-390.jpg) | Recovery heading, copy, both actions and footer |

The detail/staff fixture ID was `11111111-1111-4111-8111-111111111111`, explicitly fictional. The current frontend/API preview is local port 18417 / 18787. Existing production output was also served locally on 18418 without rebuilding or deployment.

Additional observed states: [search result / map fallback](../../output/phase-5-audit/screenshots/support-results-1440.jpg), [tablet results](../../output/phase-5-audit/screenshots/support-results-768.jpg), [mobile results](../../output/phase-5-audit/screenshots/support-results-390.jpg), [no matching healthcare resource in Harrisburg](../../output/phase-5-audit/screenshots/support-empty-390.jpg), [invalid-location recovery](../../output/phase-5-audit/screenshots/support-error-390.jpg), [resource not found](../../output/phase-5-audit/screenshots/detail-not-found-390.jpg), [opened correction form, no submission](../../output/phase-5-audit/screenshots/detail-report-open-390.jpg), [demo region](../../output/phase-5-audit/screenshots/demo-region-768.jpg), [demo needs](../../output/phase-5-audit/screenshots/demo-needs-768.jpg). Search/detail loading copy was observed transiently and also inspected in source; no reliable timed loading-state screenshot was retained.

Coverage limits: configured Mapbox tiles/markers, signed-in membership and editor screens could not be rendered because the local preview lacks usable provider/auth configuration; their templates, branches and styles were inspected. No sign-in, report submission, staff save, fake authentication or data mutation was attempted. Correction success/failure, staff conflict/save states and demo dialogs are source-reviewed, not claimed as exercised. WebGL failure and image-request failure were not forced; their source and fallback asset were inspected. Intermittent empty browser snapshots/timeouts affected additional captures; baseline route captures were recovered. Initial full-page photo captures sometimes omitted offscreen lazy-image paint; baseline homepage was recaptured after scrolling each card. The supplemental production-home capture retains that limitation and is not used to declare missing images. See performance report for tool/server distinction.

## Complete public raster inventory

Seven WebPs are supplied synthetic editorial illustrations, even when their style resembles documentary photography. Native master dimensions/provenance are in the [existing photo-pack manifest](assets/website-photo-pack/asset-manifest.json); the following dimensions/bytes are the files actually shipped in `public/`. Do not relabel generated scenes as documentary evidence.

| Public file | Dimensions | Bytes | Current uses |
|---|---:|---:|---|
| `public/assets/access-earth-network.webp` | 1651×953 | 281,420 | IMG-14 dormant |
| `public/assets/earth-blue-marble.png` | 2048×1024 | 1,511,379 | IMG-11 |
| `public/assets/globe-fallback.png` | 1672×941 | 1,849,499 | IMG-12 conditional |
| `public/assets/pilot-region.png` | 1672×941 | 3,153,679 | IMG-13 (two demo stages) |
| `public/images/our-ground/community-giving.webp` | 1200×800 | 258,198 | IMG-06, IMG-08 |
| `public/images/our-ground/flowers-search.webp` | 1920×640 | 370,430 | IMG-02, IMG-05 |
| `public/images/our-ground/food-support.webp` | 1200×800 | 219,696 | IMG-03, IMG-07 |
| `public/images/our-ground/healthcare-support.webp` | 1200×800 | 137,876 | IMG-09 |
| `public/images/our-ground/hero-family-desktop.webp` | 1672×941 | 431,332 | IMG-01 desktop |
| `public/images/our-ground/hero-family-mobile.webp` | 768×1365 | 278,364 | IMG-01 <=900px |
| `public/images/our-ground/landscape-story.webp` | 1912×797 | 399,504 | IMG-04 |

No other public raster files were discovered. Approved reference images and photo masters under `docs/design/` are references/source material, not additional live route slots. UI category icons, navigation arrows, marker pins, placeholder symbols, needs overlays, and gradient/shading pseudo-elements are code; they are recorded separately below rather than treated as missing photography.

## Classification key

A existing/appropriate; B unnecessarily repeated; C visually weak or inappropriate; D temporary placeholder; E missing image with no current placeholder; F useful proposed addition; G provider/data-dependent photo; H functional visual that should remain code; I no image needed. IMG-10 is G with secondary D. There are no E-class broken/missing editorial implementations in the inspected baseline.

`null` in the JSON means no asset/target/ratio is applicable or not yet known, as explained in the notes. Proposed filenames are explicitly future targets. Existing-asset dimensions for retained slots are not generation requests. For IMG-07, reusable=false refers to the recommended facility scene; the current food file remains reusable elsewhere. For IMG-06, reusable=true means keep its current file on About, not repeat it on Give.

## Slot-level findings

### IMG-01 — Family hero

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-01 |
| 2. Route | / |
| 3. Section / component | Family hero |
| 4. Exact implementation evidence | [src/landing.ts:18](/Users/admin/Documents/Projects/our-ground/src/landing.ts:18) |
| 5. Selector / component reference | .og-hero-photo |
| 6. Current file | /images/our-ground/hero-family-desktop.webp; /images/our-ground/hero-family-mobile.webp |
| 7. Classification | A |
| 8. Appropriate? | Yes, as illustrative storytelling. |
| 9. Repeats? | No; mobile is the coordinated alternate source. |
| 10. Necessary? | Yes: retain approved composition. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Family together above a sunlit river valley. |
| 13. Product purpose | Introduces shared community belonging without implying service availability. |
| 14. Composition | Keep family right on desktop; preserve child and adults together in mobile crop. Do not enlarge a thumbnail. |
| 15. Desktop ratio | 16:9 source; fluid cover frame |
| 16. Mobile ratio / crop | Portrait source (768:1365), square frame at <=600px; portrait panel at 768px |
| 17. Source resolution / target | 1672×941 px |
| 18. Focal point | Desktop 68% 50%; mobile 50% 60% |
| 19. Text-safe area | Desktop left third; no text over mobile photo. |
| 20. Alt / decorative treatment | Decorative alt=""; real heading and links remain code. |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** Keep current native files; 768×1365 alternate. photograph() source at photography.ts:17. Higher-DPR sharpness needs native-source review, not upscaling; landing.css:51,78,110. These dimensions describe retained source, not a new production target.

### IMG-02 — Find Support pathway

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-02 |
| 2. Route | / |
| 3. Section / component | Find Support pathway |
| 4. Exact implementation evidence | [src/landing.ts:9](/Users/admin/Documents/Projects/our-ground/src/landing.ts:9) |
| 5. Selector / component reference | .og-pathway--find .og-photograph |
| 6. Current file | /images/our-ground/flowers-search.webp |
| 7. Classification | A |
| 8. Appropriate? | Yes. |
| 9. Repeats? | Also support hero; intentional destination continuity. |
| 10. Necessary? | Retain approved card. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Wildflowers with distant wooded hills. |
| 13. Product purpose | Gives discovery a calm, recognizable entry point. |
| 14. Composition | Retain flower foreground; avoid cutting off all horizon. |
| 15. Desktop ratio | 16:9 |
| 16. Mobile ratio / crop | 3:2 |
| 17. Source resolution / target | 1920×640 px |
| 18. Focal point | 55% 55% |
| 19. Text-safe area | None; card text below. |
| 20. Alt / decorative treatment | Decorative alt=""; link has visible name. |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** landing.ts:36 renders card; landing.css:23,57,125. Reuse is intentional, not an unnecessary duplicate.

### IMG-03 — Give Support pathway

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-03 |
| 2. Route | / |
| 3. Section / component | Give Support pathway |
| 4. Exact implementation evidence | [src/landing.ts:10](/Users/admin/Documents/Projects/our-ground/src/landing.ts:10) |
| 5. Selector / component reference | .og-pathway--give .og-photograph |
| 6. Current file | /images/our-ground/food-support.webp |
| 7. Classification | A |
| 8. Appropriate? | Yes. |
| 9. Repeats? | Repeated on Organizations; keep this primary placement. |
| 10. Necessary? | Retain approved card. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Hands sharing a box of fresh food. |
| 13. Product purpose | Concrete contribution cue; healthcare breadth can be expressed on Give Support. |
| 14. Composition | Keep both pairs of hands and food together. |
| 15. Desktop ratio | 16:9 |
| 16. Mobile ratio / crop | 3:2 |
| 17. Source resolution / target | 1200×800 px |
| 18. Focal point | Center, hands and box |
| 19. Text-safe area | None. |
| 20. Alt / decorative treatment | Decorative alt="". |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** Native supplied master is larger than current web derivative; no need to generate another produce image.

### IMG-04 — Organizations pathway

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-04 |
| 2. Route | / |
| 3. Section / component | Organizations pathway |
| 4. Exact implementation evidence | [src/landing.ts:11](/Users/admin/Documents/Projects/our-ground/src/landing.ts:11) |
| 5. Selector / component reference | .og-pathway--organizations .og-photograph |
| 6. Current file | /images/our-ground/landscape-story.webp |
| 7. Classification | A |
| 8. Appropriate? | Yes, generic context. |
| 9. Repeats? | No. |
| 10. Necessary? | Retain approved card. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Wooded river valley at sunset. |
| 13. Product purpose | Connects organizations to place without pretending to show a provider. |
| 14. Composition | Keep river bend central and skyline visible. |
| 15. Desktop ratio | 16:9 |
| 16. Mobile ratio / crop | 3:2 |
| 17. Source resolution / target | 1912×797 px |
| 18. Focal point | 50% 50% |
| 19. Text-safe area | None. |
| 20. Alt / decorative treatment | Decorative alt="". |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** Do not label this an actual Pennsylvania service area or geographic map.

### IMG-05 — Search hero

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-05 |
| 2. Route | /support |
| 3. Section / component | Search hero |
| 4. Exact implementation evidence | [src/support.ts:24](/Users/admin/Documents/Projects/our-ground/src/support.ts:24) |
| 5. Selector / component reference | .support-hero-photo |
| 6. Current file | /images/our-ground/flowers-search.webp |
| 7. Classification | A |
| 8. Appropriate? | Yes. |
| 9. Repeats? | Same as IMG-02; intentional. |
| 10. Necessary? | Retain; search must work without it. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Wildflower meadow and wooded hills. |
| 13. Product purpose | Continuity with Find Support pathway, with readable real search UI. |
| 14. Composition | Wide cover crop, darker copy zone at left; center flowers on mobile. |
| 15. Desktop ratio | 3:1 source; fluid hero frame |
| 16. Mobile ratio / crop | Cover crop in content-height hero |
| 17. Source resolution / target | 1920×640 px |
| 18. Focal point | 55% 55% |
| 19. Text-safe area | Left 40%; preserve existing contrast treatment. |
| 20. Alt / decorative treatment | Decorative alt="". |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** support.css:3–6; photo is eager. Do not substitute a map screenshot for this editorial asset or for the functional map.

### IMG-06 — Give with context, lower section

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-06 |
| 2. Route | /give |
| 3. Section / component | Give with context, lower section |
| 4. Exact implementation evidence | [src/participate.ts:14](/Users/admin/Documents/Projects/our-ground/src/participate.ts:14) |
| 5. Selector / component reference | .og-entry-sections .og-editorial-photo |
| 6. Current file | /images/our-ground/community-giving.webp |
| 7. Classification | B |
| 8. Appropriate? | Good file; redundant placement. |
| 9. Repeats? | Same garden scene leads About. |
| 10. Necessary? | No second image needed if IMG-15 is approved. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Current garden food exchange; retain on About only. |
| 13. Product purpose | Avoid overrepresenting food and repeating the same people across audience pages. |
| 14. Composition | Retire this placement when outreach introduction is approved; retain text and link. |
| 15. Desktop ratio | 3:2 current |
| 16. Mobile ratio / crop | 3:2 current |
| 17. Source resolution / target | 1200×800 px |
| 18. Focal point | Current center pair and produce |
| 19. Text-safe area | None. |
| 20. Alt / decorative treatment | Current alt="" and synthetic caption; do not remove disclosure while image remains. |
| 21. Existing asset reusable | Yes |
| 22. Priority | P1 |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** No replacement file for this lower slot; move visual emphasis to proposed IMG-15. Existing asset remains reusable on About.

### IMG-07 — Organizations introduction

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-07 |
| 2. Route | /organizations |
| 3. Section / component | Organizations introduction |
| 4. Exact implementation evidence | [src/participate.ts:10](/Users/admin/Documents/Projects/our-ground/src/participate.ts:10) |
| 5. Selector / component reference | .og-entry-intro--organizations .og-editorial-photo |
| 6. Current file | /images/our-ground/food-support.webp |
| 7. Classification | B |
| 8. Appropriate? | Food-sharing scene is valid but does not explain organizational access. |
| 9. Repeats? | Same box photo as homepage Give card. |
| 10. Necessary? | An existing editorial slot benefits from a more relevant subject. |
| 11. Recommended asset / action | community-resource-exterior-editorial.webp |
| 12. Scene | Modest, accessible community resource building exterior; generic, unbranded. |
| 13. Product purpose | Adds a physical sense of local infrastructure without claiming an actual listed organization. |
| 14. Composition | Eye-level three-quarter entrance view, readable approach path and ordinary architecture. |
| 15. Desktop ratio | 3:2 |
| 16. Mobile ratio / crop | 3:2; retain whole entrance and approach |
| 17. Source resolution / target | 2400×1600 px |
| 18. Focal point | Entrance around center-right, path lower center |
| 19. Text-safe area | None; introduction copy remains beside image. |
| 20. Alt / decorative treatment | Decorative alt="" with visible illustrative/synthetic caption if generated. |
| 21. Existing asset reusable | No |
| 22. Priority | P2 |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** Proposed filename only. Keep current supplied image until approved replacement. Existing food file is reusable at IMG-03; not a substitute for the proposed facility scene. Brief B below.

### IMG-08 — About introduction

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-08 |
| 2. Route | /about |
| 3. Section / component | About introduction |
| 4. Exact implementation evidence | [src/info.ts:20](/Users/admin/Documents/Projects/our-ground/src/info.ts:20) |
| 5. Selector / component reference | .about-lead-photo |
| 6. Current file | /images/our-ground/community-giving.webp |
| 7. Classification | A |
| 8. Appropriate? | Yes. |
| 9. Repeats? | Repeated on Give Support; keep this primary use. |
| 10. Necessary? | Retain existing editorial slot. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Neighbors exchanging produce in a community garden. |
| 13. Product purpose | Makes the platform mission human and concrete. |
| 14. Composition | Preserve foreground interaction with contextual people in background. |
| 15. Desktop ratio | 3:2 |
| 16. Mobile ratio / crop | 3:2 |
| 17. Source resolution / target | 1200×800 px |
| 18. Focal point | Foreground two people and box |
| 19. Text-safe area | None. |
| 20. Alt / decorative treatment | Decorative alt=""; preserve visible synthetic garden caption. |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** Retain current supplied asset and truthful context; no implementation requested.

### IMG-09 — Three audiences / purpose section

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-09 |
| 2. Route | /about |
| 3. Section / component | Three audiences / purpose section |
| 4. Exact implementation evidence | [src/info.ts:23](/Users/admin/Documents/Projects/our-ground/src/info.ts:23) |
| 5. Selector / component reference | .about-purpose .og-editorial-photo |
| 6. Current file | /images/our-ground/healthcare-support.webp |
| 7. Classification | A |
| 8. Appropriate? | Yes, clearly illustrative. |
| 9. Repeats? | No current duplicate. Do not duplicate on Give. |
| 10. Necessary? | Retain. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Healthcare worker in a calm seated conversation. |
| 13. Product purpose | Balances the food/garden story with healthcare support. |
| 14. Composition | Preserve worker face and conversational partner; do not imply a clinical intervention. |
| 15. Desktop ratio | 3:2 |
| 16. Mobile ratio / crop | 3:2 |
| 17. Source resolution / target | 1200×800 px |
| 18. Focal point | Worker left-center; retain conversational relationship |
| 19. Text-safe area | None. |
| 20. Alt / decorative treatment | Decorative alt=""; preserve synthetic healthcare caption. |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Generic synthetic illustration only; never evidence of an actual provider, resident, partnership, or Pennsylvania location. Preserve existing disclosures and provenance. |

**Implementation notes:** Existing consultation differs from proposed outreach scene. No invented diagnosis, outcome, or provider identity.

### IMG-10 — Provider photo area in detail hero

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-10 |
| 2. Route | /resources/:id |
| 3. Section / component | Provider photo area in detail hero |
| 4. Exact implementation evidence | [src/resource-detail.ts:40](/Users/admin/Documents/Projects/our-ground/src/resource-detail.ts:40) |
| 5. Selector / component reference | .detail-photo-fallback |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | G |
| 8. Appropriate? | Current honest placeholder is appropriate; no provider photo exists. |
| 9. Repeats? | Template repeated per record; count once. |
| 10. Necessary? | Optional for usable directory; authentic photo useful for recognizing a real entrance. |
| 11. Recommended asset / action | provider-{approved-id}-exterior.webp |
| 12. Scene | Authentic approved exterior/entrance of the exact real provider location. |
| 13. Product purpose | Helps residents recognize a destination when supported by trustworthy source material. |
| 14. Composition | Eye-level recognizable entrance; retain identifying factual features with permission. |
| 15. Desktop ratio | 4:3 proposed; current placeholder has no fixed photo ratio |
| 16. Mobile ratio / crop | 4:3 proposed; current placeholder compacts on mobile |
| 17. Source resolution / target | 2400×1800 px |
| 18. Focal point | Actual entrance; per-photo value unknown |
| 19. Text-safe area | None. |
| 20. Alt / decorative treatment | Informative factual alt based on verified photo, plus source/permission caption; never claim accessibility from appearance alone. |
| 21. Existing asset reusable | No |
| 22. Priority | P1 |
| 23. Authenticity | Genuine authorized photograph required for a real provider. No synthetic substitute. Keep fictional fixtures explicitly fictional and without a real-provider image. |

**Implementation notes:** Secondary classification D: existing temporary placeholder, not broken URL. No image fields in shared/contracts.ts:11. Proposed filename is a pattern, not an existing asset. Requires future contract/provenance work; no schema changes in this audit. Brief C below.

### IMG-11 — Interactive globe surface

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-11 |
| 2. Route | /demo |
| 3. Section / component | Interactive globe surface |
| 4. Exact implementation evidence | [src/globe.ts:51](/Users/admin/Documents/Projects/our-ground/src/globe.ts:51) |
| 5. Selector / component reference | InteractiveGlobe / .globe-mount canvas |
| 6. Current file | /assets/earth-blue-marble.png |
| 7. Classification | A |
| 8. Appropriate? | Appropriate to isolated legacy globe. |
| 9. Repeats? | No. |
| 10. Necessary? | Needed only if retaining the globe demo. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Earth texture credited to NASA/GSFC SVS. |
| 13. Product purpose | Supports a functional globe illustration, not service discovery. |
| 14. Composition | Equirectangular texture on sphere; do not use as a homepage banner. |
| 15. Desktop ratio | 2:1 texture; spherical canvas |
| 16. Mobile ratio / crop | Same texture; responsive canvas |
| 17. Source resolution / target | 2048×1024 px |
| 18. Focal point | Controlled by globe orientation |
| 19. Text-safe area | None; labels remain DOM. |
| 20. Alt / decorative treatment | Canvas control has accessible instructions; preserve NASA credit. |
| 21. Existing asset reusable | Yes |
| 22. Priority | optional |
| 23. Authenticity | Preserve source attribution and verify applicable reuse terms if republishing beyond current use. |

**Implementation notes:** src/demo.ts:64,122; no new raster needed. This is the eighth reusable file beyond seven editorial WebPs.

### IMG-12 — WebGL failure fallback

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-12 |
| 2. Route | /demo |
| 3. Section / component | WebGL failure fallback |
| 4. Exact implementation evidence | [src/demo.css:34](/Users/admin/Documents/Projects/our-ground/src/demo.css:34) |
| 5. Selector / component reference | .without-webgl .globe-fallback |
| 6. Current file | /assets/globe-fallback.png |
| 7. Classification | C |
| 8. Appropriate? | No: source raster is a complete old Common Ground webpage screenshot with baked UI. |
| 9. Repeats? | No. |
| 10. Necessary? | A graceful fallback is needed, not this screenshot. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | No new photograph: use truthful text/code fallback, or an approved clean Earth presentation. |
| 13. Product purpose | Avoids embedded legacy branding and fake controls when WebGL fails. |
| 14. Composition | Preserve real link/control semantics; do not crop a webpage into a faux globe. |
| 15. Desktop ratio | Current circular CSS crop |
| 16. Mobile ratio / crop | Current circular CSS crop |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Current aria-hidden=true at demo.ts:65; actual fallback should have meaningful status and usable navigation. |
| 21. Existing asset reusable | No |
| 22. Priority | P2 |
| 23. Authenticity | Do not present screenshot UI as working interface. |

**Implementation notes:** Conditional branch at demo.ts:165. Original raster inspected; WebGL failure not forced. Current crop may hide some edge branding but does not make the source appropriate. No image generation requested.

### IMG-13 — Illustrative region / needs backdrop

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-13 |
| 2. Route | /demo |
| 3. Section / component | Illustrative region / needs backdrop |
| 4. Exact implementation evidence | [src/demo.ts:74](/Users/admin/Documents/Projects/our-ground/src/demo.ts:74) |
| 5. Selector / component reference | .region-surface > img |
| 6. Current file | /assets/pilot-region.png |
| 7. Classification | C |
| 8. Appropriate? | Weak for a Pennsylvania pilot: alpine/snowy geography is illustrative, not geographic evidence. |
| 9. Repeats? | Same backdrop shared by region and needs states intentionally. |
| 10. Necessary? | Only for legacy illustration; not needed for real directory map. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | Existing synthetic mountainous regional scene. |
| 13. Product purpose | Explains a legacy visual concept; cannot locate actual services or measure needs. |
| 14. Composition | Keep explicit illustrative labels while retained; use actual map data for future map work. |
| 15. Desktop ratio | 1672:941 source; cover |
| 16. Mobile ratio / crop | Cover in pan/zoom surface |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | Current region transform origin 61% 53% |
| 19. Text-safe area | Labels and overlays remain code. |
| 20. Alt / decorative treatment | Decorative alt=""; surrounding region label must say illustrative. |
| 21. Existing asset reusable | No |
| 22. Priority | P2 |
| 23. Authenticity | Never treat this image or SVG needs overlay as real local conditions. |

**Implementation notes:** Not a missing asset. Avoid commissioning a replacement fake map. Current 3,153,679-byte PNG is not a production editorial reuse recommendation.

### IMG-14 — Unused legacy network Earth asset

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-14 |
| 2. Route | None / not applicable; see implementation notes. |
| 3. Section / component | Unused legacy network Earth asset |
| 4. Exact implementation evidence | [public/assets/access-earth-network.webp](/Users/admin/Documents/Projects/our-ground/public/assets/access-earth-network.webp) |
| 5. Selector / component reference | No active route consumer found |
| 6. Current file | /assets/access-earth-network.webp |
| 7. Classification | C |
| 8. Appropriate? | No: neon/CGI network aesthetic conflicts with approved direction. |
| 9. Repeats? | No active duplicate. |
| 10. Necessary? | No. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None recommended. |
| 13. Product purpose | Prevent accidental revival of obsolete visual branding. |
| 14. Composition | Leave out of active UI; deletion is outside this audit. |
| 15. Desktop ratio | 1651:953 file |
| 16. Mobile ratio / crop | Not applicable |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Not applicable; not rendered. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | No implied operational AI/network data. |

**Implementation notes:** Binary file has no line number. Source search found no active import or URL consumer; current route screenshots contain none of it.

### IMG-15 — Proposed healthcare outreach introduction

| Field | Finding |
|---|---|
| 1. Slot ID | IMG-15 |
| 2. Route | /give |
| 3. Section / component | Proposed healthcare outreach introduction |
| 4. Exact implementation evidence | [src/participate.ts:13](/Users/admin/Documents/Projects/our-ground/src/participate.ts:13) |
| 5. Selector / component reference | .og-entry-intro (proposed figure; not implemented) |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | F |
| 8. Appropriate? | No current photo in this introduction; this is a proposed addition, not a broken asset. |
| 9. Repeats? | Use a distinct outreach scene, not IMG-09 consultation or food/garden assets. |
| 10. Necessary? | Useful to explain healthcare contribution; not necessary for navigation. |
| 11. Recommended asset / action | community-health-outreach-editorial.webp |
| 12. Scene | Community health worker listening to two adult residents at a modest neighborhood outreach table. |
| 13. Product purpose | Shows healthcare access and practical human support without promising donation processing, volunteer booking, or live services. |
| 14. Composition | Eye-level three-quarter group view; conversational triangle, clear faces/hands, ordinary setting. Right-side photo beside desktop copy; stack below copy/actions/limits on tablet and mobile. |
| 15. Desktop ratio | 3:2 |
| 16. Mobile ratio / crop | 3:2, keep all participants within center 75% |
| 17. Source resolution / target | 2400×1600 px |
| 18. Focal point | Faces and hands in central 60%; no edge-dependent subject |
| 19. Text-safe area | None; keep typography outside image. |
| 20. Alt / decorative treatment | Decorative alt="" with visible synthetic illustration disclosure if generated; authentic sourced image needs factual approved caption. |
| 21. Existing asset reusable | No |
| 22. Priority | P1 |
| 23. Authenticity | Prefer licensed/consented real outreach photography. Synthetic generic storytelling acceptable only with clear disclosure, no claimed real provider/event, and owner approval. |

**Implementation notes:** Strongest treatment is one intro visual rather than a second lower photo. Remove IMG-06 placement only when approved. Current intro is text-only max-width:54rem (landing.css:60); proposed two-column change requires owner approval. Brief A below.

### UI-01 — Navigation, brand, mobile menu and footer

| Field | Finding |
|---|---|
| 1. Slot ID | UI-01 |
| 2. Route | shared |
| 3. Section / component | Navigation, brand, mobile menu and footer |
| 4. Exact implementation evidence | [src/navigation.ts:11](/Users/admin/Documents/Projects/our-ground/src/navigation.ts:11) |
| 5. Selector / component reference | header(), footer(), .og-mobile-menu |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | H |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Recognizable navigation with real text brand and working links. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Header starts at line 13, footer line 23; menu line 19. No logo raster needed. Footer and mobile menu reviewed across routes.

### UI-02 — Editorial intro, values and closing statement

| Field | Finding |
|---|---|
| 1. Slot ID | UI-02 |
| 2. Route | / |
| 3. Section / component | Editorial intro, values and closing statement |
| 4. Exact implementation evidence | [src/landing.ts:25](/Users/admin/Documents/Projects/our-ground/src/landing.ts:25) |
| 5. Selector / component reference | .og-hero-values, .og-community-intro, .og-community-principle |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Typography and spacing carry this content. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Lines 25,32,37. Do not add images to white space, quotation area, or footer.

### UI-03 — Search, filters, results, pagination and empty/error/loading states

| Field | Finding |
|---|---|
| 1. Slot ID | UI-03 |
| 2. Route | /support |
| 3. Section / component | Search, filters, results, pagination and empty/error/loading states |
| 4. Exact implementation evidence | [src/support.ts:26](/Users/admin/Documents/Projects/our-ground/src/support.ts:26) |
| 5. Selector / component reference | #locationForm, #resourceResults, #pagination |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | H |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Quickly compare factual resource information. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Result card line 83 uses category SVG, not a thumbnail slot; message line 73 covers initial, no-results, loading and retry. Preserve source labels.

### UI-04 — Live map, markers and unavailable state

| Field | Finding |
|---|---|
| 1. Slot ID | UI-04 |
| 2. Route | /support |
| 3. Section / component | Live map, markers and unavailable state |
| 4. Exact implementation evidence | [src/support.ts:33](/Users/admin/Documents/Projects/our-ground/src/support.ts:33) |
| 5. Selector / component reference | #liveMap, #mapFallback, .api-map-marker |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | H |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Spatially explore current result page with list equivalent. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Mapbox gates line 63; marker implementation resource-map.ts:22. Unavailable map is configuration/state, not missing decorative image.

### UI-05 — Directory guidance and notes

| Field | Finding |
|---|---|
| 1. Slot ID | UI-05 |
| 2. Route | /support |
| 3. Section / component | Directory guidance and notes |
| 4. Exact implementation evidence | [src/support.ts:35](/Users/admin/Documents/Projects/our-ground/src/support.ts:35) |
| 5. Selector / component reference | .support-note, .support-help |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Explain limitations and link to directory guidance. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** No photograph needed in callout or footer.

### UI-06 — Location map and fallback

| Field | Finding |
|---|---|
| 1. Slot ID | UI-06 |
| 2. Route | /resources/:id |
| 3. Section / component | Location map and fallback |
| 4. Exact implementation evidence | [src/resource-detail.ts:48](/Users/admin/Documents/Projects/our-ground/src/resource-detail.ts:48) |
| 5. Selector / component reference | .detail-area-map, #detailMapFallback |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | H |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Show actual listed point while preserving written address. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Map import line 75; no raster map replacement or synthetic facility image.

### UI-07 — Hours, services, eligibility, source, sidebar, corrections and recovery

| Field | Finding |
|---|---|
| 1. Slot ID | UI-07 |
| 2. Route | /resources/:id |
| 3. Section / component | Hours, services, eligibility, source, sidebar, corrections and recovery |
| 4. Exact implementation evidence | [src/resource-detail.ts:43](/Users/admin/Documents/Projects/our-ground/src/resource-detail.ts:43) |
| 5. Selector / component reference | .detail-content, .detail-sidebar, #corrections |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Support informed next steps and honest missing data. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Source warning 43, content 45–49, sidebar 50, loading/recovery 83–90. Correction form opened without submission. No image upload input.

### UI-08 — Already have access / Looking to join

| Field | Finding |
|---|---|
| 1. Slot ID | UI-08 |
| 2. Route | /organizations |
| 3. Section / component | Already have access / Looking to join |
| 4. Exact implementation evidence | [src/participate.ts:11](/Users/admin/Documents/Projects/our-ground/src/participate.ts:11) |
| 5. Selector / component reference | .og-entry-sections |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Explain existing staff access and unavailable self-service registration. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Keep both sections text-led. No extra team portraits, logos, or fake partner strip.

### UI-09 — Contribution instructions and limitations

| Field | Finding |
|---|---|
| 1. Slot ID | UI-09 |
| 2. Route | /give |
| 3. Section / component | Contribution instructions and limitations |
| 4. Exact implementation evidence | [src/participate.ts:14](/Users/admin/Documents/Projects/our-ground/src/participate.ts:14) |
| 5. Selector / component reference | .og-entry-sections, .og-entry-note |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Explain direct provider contact and limits of this platform. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Retain how-to list, CTA, and truthful disclaimer. IMG-06 separately covers current lower photo; no new donation/product imagery here.

### UI-10 — Practical steps and honest limits

| Field | Finding |
|---|---|
| 1. Slot ID | UI-10 |
| 2. Route | /about |
| 3. Section / component | Practical steps and honest limits |
| 4. Exact implementation evidence | [src/info.ts:30](/Users/admin/Documents/Projects/our-ground/src/info.ts:30) |
| 5. Selector / component reference | .about-steps, .about-prototype |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Explain how to use and interpret directory records. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Three steps at lines 33–35; limitations at line 38. No chart, statistics illustration, or additional image needed.

### UI-11 — Account status, memberships, service records, sidebar

| Field | Finding |
|---|---|
| 1. Slot ID | UI-11 |
| 2. Route | /account |
| 3. Section / component | Account status, memberships, service records, sidebar |
| 4. Exact implementation evidence | [src/account.ts:13](/Users/admin/Documents/Projects/our-ground/src/account.ts:13) |
| 5. Selector / component reference | .account-panel, #staffRecords, .account-aside |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Make access states and assigned records clear. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Not-configured UI reviewed; hidden authenticated list inspected in source (line 16,59). No avatars or organization logos in contract; do not invent them.

### UI-12 — Editor, status, conflict recovery, guidance

| Field | Finding |
|---|---|
| 1. Slot ID | UI-12 |
| 2. Route | /staff/services/:id |
| 3. Section / component | Editor, status, conflict recovery, guidance |
| 4. Exact implementation evidence | [src/staff.ts:18](/Users/admin/Documents/Projects/our-ground/src/staff.ts:18) |
| 5. Selector / component reference | #serviceForm, #conflictRecovery, .staff-guidance |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Safely edit authorized service text. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Form has title/summary/eligibility/cost/status, no photo field. Actual authorized edit state blocked by missing auth configuration; not-configured page reviewed at all widths.

### UI-13 — Route recovery

| Field | Finding |
|---|---|
| 1. Slot ID | UI-13 |
| 2. Route | unknown / 404 |
| 3. Section / component | Route recovery |
| 4. Exact implementation evidence | [src/info.ts:45](/Users/admin/Documents/Projects/our-ground/src/info.ts:45) |
| 5. Selector / component reference | .not-found |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | I |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Offer clear home/search recovery. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** No decorative lost-person image or mascot needed. This is client-side recovery, not proof of HTTP 404 status for the SPA route.

### UI-14 — Pins, needs overlay, legend, dialogs and navigation

| Field | Finding |
|---|---|
| 1. Slot ID | UI-14 |
| 2. Route | /demo |
| 3. Section / component | Pins, needs overlay, legend, dialogs and navigation |
| 4. Exact implementation evidence | [src/demo.ts:75](/Users/admin/Documents/Projects/our-ground/src/demo.ts:75) |
| 5. Selector / component reference | .needs-areas, .pilot-pin, #infoDialog |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | H |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Explain and control a clearly labeled legacy demonstration. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** SVG overlays are illustrative, not real needs data. Dialog source at 127 and handlers below; no image slots in dialogs. Region/needs states observed; dialogs source-reviewed only.

### UI-15 — Image error treatment and shading

| Field | Finding |
|---|---|
| 1. Slot ID | UI-15 |
| 2. Route | shared editorial routes |
| 3. Section / component | Image error treatment and shading |
| 4. Exact implementation evidence | [src/photography.ts:18](/Users/admin/Documents/Projects/our-ground/src/photography.ts:18) |
| 5. Selector / component reference | .og-photo-unavailable, [data-photo-state="error"] |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | H |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Retain legibility and layout when a photo fails. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** Two load/error listeners per photo, text fallback. Hero ::before/::after gradients in landing.css:54–55 and support.css:5 are CSS, not missing images. No forced photo-failure browser test performed.

### UI-16 — Dormant layered maps / process illustration

| Field | Finding |
|---|---|
| 1. Slot ID | UI-16 |
| 2. Route | None / not applicable; see implementation notes. |
| 3. Section / component | Dormant layered maps / process illustration |
| 4. Exact implementation evidence | [src/landing-sections.ts:3](/Users/admin/Documents/Projects/our-ground/src/landing-sections.ts:3) |
| 5. Selector / component reference | finalSections, .layer-illustration, .method-steps |
| 6. Current file | None / not applicable; see implementation notes. |
| 7. Classification | H |
| 8. Appropriate? | Current code/text treatment is appropriate. |
| 9. Repeats? | No raster duplication. |
| 10. Necessary? | No photograph. |
| 11. Recommended asset / action | None / not applicable; see implementation notes. |
| 12. Scene | None / not applicable; see implementation notes. |
| 13. Product purpose | Historical code illustration only; no current route imports it. |
| 14. Composition | Keep actual semantic HTML/SVG/canvas controls and responsive spacing. |
| 15. Desktop ratio | None / not applicable; see implementation notes. |
| 16. Mobile ratio / crop | None / not applicable; see implementation notes. |
| 17. Source resolution / target | No new raster target; not applicable or provider-specific unknown. |
| 18. Focal point | None / not applicable; see implementation notes. |
| 19. Text-safe area | Not applicable. |
| 20. Alt / decorative treatment | Use accessible labels and state announcements; decorative SVG aria-hidden where appropriate. |
| 21. Existing asset reusable | No |
| 22. Priority | optional |
| 23. Authenticity | Do not invent providers, measurements, identities, or availability. |

**Implementation notes:** All SVG paths, layers and process icons are code; no new raster. Old Access/AI copy is dormant, not evidence of shipped AI. Do not revive during image integration.

## Recommended image distribution

| Page | Retain | Proposed change after approval |
|---|---|---|
| Home | Family hero; flowers, food-box and river cards | None to composition |
| Find Support | Flower hero | Responsive derivatives only if profiling justifies; functional map remains map |
| Give Support | All contribution guidance and limits | One healthcare outreach intro image; retire duplicated lower garden placement |
| Organizations | Access instructions and truthful limits | Replace repeated food-box image with generic facility exterior |
| About | Garden introduction + existing healthcare conversation | Keep this distinct two-subject mission narrative |
| Resource details | Honest placeholder and category icon until real material exists | Authentic provider-specific photo only with provenance and contract support |
| Account / staff / recovery | Existing text and functional UI | No new photography |
| Legacy demo | NASA texture and explicit illustrative labels | Plan separate fallback/weight cleanup; never repurpose fake geography as directory data |

## Generation / sourcing briefs — approval required

These are planning briefs, not generated images or final layout approval. Native targets below mean create/source at that resolution or larger before downscaling. Do not upscale a 400px reference, cropped contact sheet, or smaller supplied source. Keep original files, rights, synthetic status, and approval history with future derivatives. There are three actionable briefs; functional map/fallback work requires code and legitimate geographic data, not a fourth photograph.

### Brief A — healthcare access through community outreach (P1)

- **Asset name:** proposed `community-health-outreach-editorial.webp`.
- **Role:** IMG-15, Give Support introduction; replace the need for its duplicated lower garden photo (IMG-06). This is about finding a trustworthy starting point for contribution, not presenting Our Ground as an outreach operator.
- **Subject:** one approachable community health worker listening to two adult residents around an ordinary outreach table. A plain informational leaflet may be present, with no readable personal information or invented service claims. Conversation, not examination; hands naturally resting or gesturing.
- **Setting:** modest neighborhood community-center courtyard or open doorway, temperate Pennsylvania-compatible vegetation and ordinary brick/timber surroundings. No recognizable invented provider, named event or claimed partnership.
- **Composition:** eye-level medium-wide three-quarter view; worker and residents form a conversational triangle in the center 75%. Faces and hands remain within the central 60%. Include enough environmental context to distinguish outreach from the indoor consultation already used on About. Avoid a donor/recipient hierarchy, handshakes, camera-facing smiles or a conspicuous queue.
- **Lighting:** soft natural late-morning daylight or open shade, realistic highlights; no theatrical beams, excessive golden haze or aggressive shallow-focus blur.
- **Color:** warm whites, ordinary blues/greens, muted natural landscape, restrained sunlight. Avoid medical neon and promotional saturation.
- **Realism:** credible anatomy, varied everyday clothing and skin texture; consistent fingers, gaze, furniture and perspective. No procedure, clinical diagnosis, treatment outcome, or identifiable patient documentation.
- **Exclusions:** no CGI/illustration appearance, fake logos/signage, baked text/UI, corporate charity poses, money exchange, branded clinical equipment, emergency care, futuristic technology, overprocessed skin, exaggerated bloom or synthetic lens effects.
- **Responsive placement:** desktop right-side 3:2 editorial figure beside real introduction text; <=900px stack after headline/body/actions/platform-limits note, before next section; mobile 3:2 with all participants retained. Keep caption beneath; no overlaid text. This composition change is a recommendation awaiting review.
- **Dimensions:** native/source target **2400×1600**; later web derivatives 1200×800 and 780×520, with width-based source selection to be implemented only in a future phase. These are targets, not existing files. Do not upscale an inadequate generated source to claim native quality.
- **Authenticity:** prefer licensed/consented real outreach photography. If owner approves synthetic generic storytelling, retain a clear synthetic illustrative caption and provenance; never identify it as a real provider/event. Review representative dignity and believable human interaction before accepting.

### Brief B — modest community infrastructure (P2)

- **Asset name:** proposed `community-resource-exterior-editorial.webp`.
- **Role:** IMG-07, Organizations introduction, replacing repeated produce-box imagery. This is the strongest use of the [facility brief](community-facility-asset-brief.md). The supplied “Community Food Pantry” screenshot is only a composition reference, never an asset to crop/enlarge.
- **Subject / setting:** modest community resource building with an understandable entrance and everyday approach path. Ordinary brick, timber or simple metal detailing; small native planting beds, practical windows and believable neighborhood context. Do not imitate a named real provider or a luxury architectural showpiece.
- **Composition:** eye-level three-quarter view, entrance center-right, approach path in lower center and enough breathing room for a 3:2 crop. Show full doorway and ground connection; avoid dramatic wide-angle distortion. People optional and secondary, without implying a documented queue or service event. No text overlay.
- **Lighting / color:** gentle morning daylight, natural shadows, warm neutral building materials, landscape greens and blue sky, restrained golden highlights.
- **Realism:** plausible structure, ramps/paths/doors, reflections and vegetation. Accessible-looking features are not evidence of verified access compliance.
- **Exclusions:** no invented organization name, “Community Food Pantry” sign, fake logo, screen labels, architecture based on a real listing without permission, CGI render, resort styling, exaggerated bloom or artificial cinematic effects.
- **Responsive placement:** retain existing desktop Organizations figure position; stack after the access note on tablet/mobile, with 3:2 crop retaining the entrance and approach. Do not add another facility picture to About or the detail sidebar.
- **Dimensions:** native/source target **2400×1600** for current 3:2 frame; a genuine source >=1600×1200 also satisfies the original brief if a suitable crop is available. Proposed derivatives 1200×800 and 780×520. Do not enlarge the thumbnail. No new output has been created.
- **Authenticity:** synthetic is acceptable only as clearly disclosed generic editorial illustration. It must never stand in for the actual photograph of any real listed organization. For a true organization-specific view, use Brief C instead.

### Brief C — authentic provider entrance (P1, conditional)

- **Asset name:** proposed pattern `provider-{approved-id}-exterior.webp`; actual identifier/file unknown until provider and permission are established.
- **Role:** IMG-10 on a real `/resources/:id` detail page. Do not attach a real building photograph to the fictional pantry fixture.
- **Subject / setting:** exact listed service entrance and immediate arrival context, photographed at the verified physical location. Match the listing and current provider permission.
- **Composition:** eye-level recognizable entrance, enough surroundings to orient a visitor; avoid obstructed doors or unrelated tenants. Keep real identifying features only where authorized; no invented signage or retouching that changes arrival information.
- **Lighting / color / realism:** ordinary clear daylight, neutral faithful color and authentic documentary capture. No synthetic architecture, altered barriers, fictional people, beautification of inaccessible features, or AI completion of missing scene content.
- **Exclusions:** no patients, personal health information, license plates or private paperwork; avoid recognizable people unless consent covers publication. No generated provider exteriors or thumbnail enlargement.
- **Responsive placement:** proposed 4:3 photo in the current hero-side provider area; same 4:3 crop on mobile with entrance retained. Keep contact links, eligibility and source notes separate and functional. A photo is optional; absence must remain usable.
- **Dimensions:** request original **>=2400×1800** if available; proposed 1200×900 and 780×585 derivatives. If source is smaller, preserve native limits and request a better original rather than upscaling.
- **Authenticity:** genuine licensed/authorized image required. Record provider/location binding, capture date if known, source URL/owner, usage rights/consent, approval, factual alt text and crop focal point. Unknowns must remain explicit. Current contracts and staff form have no photo support; plan separately after backend review.

## Owner decision gate

Approve the Give Support scene/placement, generic facility brief and provenance standard before any image production or integration. Keep all existing synthetic disclosures. Treat real provider imagery as a data/provenance feature, not a decorative swap. No other page redesign is proposed by this inventory.

Final integrity check: all 83 baseline files matched their original hashes. The manifest contains 31 unique records with all required keys; each inventory record has all 23 requested fields. All 30 baseline viewport screenshots are present, plus 10 supplemental captures. Source paths, line bounds and local report links passed validation. [Verification artifact](../../output/phase-5-audit/verification.json).
