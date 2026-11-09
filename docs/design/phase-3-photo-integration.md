# Phase 3 — approved website photography integration

Status: implemented; production build passed. Stopped for visual review. No deployment.

## Scope and changed files

The Phase 1/2 application, shared navigation, typography, API behavior and safety boundaries are preserved. This pass replaces the homepage and Find Support photo placeholders with the supplied standalone WebPs and adds one illustration to an existing giving section.

| Files | Change |
| --- | --- |
| `src/photography.ts`, `src/photography.css` | Native picture/image markup, intrinsic dimensions, loading policy, reserved frames and actual load-error fallback. |
| `src/landing.ts`, `src/landing.css` | Responsive family hero, three existing photographic pathway tiles, focal positioning and localized neutral contrast shading. |
| `src/support.ts`, `src/support.css` | Wildflower header; more compact framing, readable search surface and contrast preference treatment. Search logic is unchanged. |
| `src/participate.ts` | Community-garden image and illustrative caption in the existing Give with context section. Organization-page content is unchanged. |
| `public/images/our-ground/*.webp` | Seven supplied WebPs, unchanged. |
| `docs/design/assets/website-photo-pack/README.md`, `asset-manifest.json` | Original package documentation and unchanged provenance manifest. |
| `docs/design/photo-integration.md` | Imported package guidance with project-specific decisions appended; no previous integration file existed. |
| `docs/design/phase-3-photo-integration.md` | This report. |

Review scripts, measurements, logs and screenshots are under `output/photo-integration/` (ignored local review output). No project dependencies were added. Existing uncommitted Phase 1/2 changes were preserved. The application's root README was not overwritten or edited in this pass.

## Asset mapping and truthfulness

| Asset | Actual application usage |
| --- | --- |
| `hero-family-desktop.webp` | `/` hero above 900 CSS pixels. |
| `hero-family-mobile.webp` | Same single `<picture>` on `/`, at 900 CSS pixels and below. |
| `flowers-search.webp` | `/support` header and homepage Find Support tile. |
| `food-support.webp` | Homepage Give Support tile. |
| `landscape-story.webp` | Homepage For Organizations tile. |
| `community-giving.webp` | Existing Give with context section on `/give`. Nearby caption: “Illustrative image · a synthetic community garden scene.” |
| `healthcare-support.webp` | Imported and verified, deliberately unused: there is no existing generic healthcare editorial section requiring it. |

The images are synthetic photographic illustrations, not evidence of real beneficiaries, providers, clinicians, services or a Pennsylvania location. They are decorative atmosphere with empty alt text; the giving figure also has a visible provenance caption. Resource cards retain category icons. Resource details retain their neutral category/photo-unavailable treatment because the pack does not supply authentic provider images. No resource names, records, opening hours, verification badges, donation options or availability claims were invented. Account and staff forms have no new imagery.

## Import and integrity verification

The ZIP was inspected and extracted into `/private/tmp/our-ground-photo-pack-5i1sjjnn` with traversal and symlink checks. Only its seven WebPs were copied into `public/images/our-ground/`; browser URLs use `/images/our-ground/<filename>`. No earlier files with those names existed in the application. The package previews were not imported into the application.

All seven files were fully decoded with the existing bundled Pillow runtime. Dimensions, byte counts and SHA-256 match the original manifest. No asset was resized, filtered, recompressed, enlarged or generated. Verification is recorded in `output/photo-integration/asset-verification.json`. All seven built public URLs also returned HTTP 200 with `image/webp` and the exact original bytes; see `served-assets.json`.

| WebP | Verified dimensions | Bytes | Verified SHA-256 |
| --- | --- | --- | --- |
| `hero-family-desktop.webp` | 1672 × 941 | 431,332 | `1b56e98adce71c8b180bb7f45a665949731bce0ad28009e1d9465f5dab0c7ebb` |
| `hero-family-mobile.webp` | 768 × 1365 | 278,364 | `c8df80348c6452c45f794a9a5030bb9170066738993c081e47f1d9269d462610` |
| `landscape-story.webp` | 1912 × 797 | 399,504 | `b2536ee3bdae2fc4a0a75b82647f53f15e25945ee1731528fb16c864d0f17da9` |
| `flowers-search.webp` | 1920 × 640 | 370,430 | `b932f95064af23c964d4930394873de1cfb1f3123e25f323c3d81e0d17216028` |
| `food-support.webp` | 1200 × 800 | 219,696 | `0eab1251d3a1d81e2b4273d3c2c2c81d7e819d7c4589204842fe7335cc4e4904` |
| `healthcare-support.webp` | 1200 × 800 | 137,876 | `140adfda035aa2cac6eaee882cae8de22f46705451b19d7f1497cccf5bf391a3` |
| `community-giving.webp` | 1200 × 800 | 258,198 | `5664a086999531e88210f70bd41dd869829ba378c0a4f7aad7b83e56bfc39b3c` |

The manifest itself is copied unchanged. Its `source-images/…` paths refer to the source package: PNG masters remain in the ZIP at `/Users/admin/Downloads/Our_Ground_Website_Photo_Pack.zip` and its temporary staging directory. They are not copied to `public/` or served. Temporary staging is not a durable archive; the original ZIP remains the durable source supplied by the user.

## Responsive framing, loading and visual decisions

- Desktop hero uses `object-fit: cover` with `68% 50%` focal positioning. The child, both parent faces and raised hands remain visible at 1440 and 1024 widths, clear of the text. The hero follows the existing flexible desktop height; the 1024 layout has a shorter minimum height.
- At 768 width, portrait photography sits beside light-surface copy. At 390 and 320, copy and actions precede a square portrait frame, using `50% 60%` positioning. The crop removes peripheral sky/lower meadow, retaining faces and hand gestures. A full-height portrait is intentionally avoided so the primary action remains reachable.
- `<picture>` selects one family source, with width/height on both the source and image. The hero is eager and is the only image assigned high fetch priority. The Support header is eager at normal priority. Tiles and the giving image use native lazy loading and async decoding.
- Support uses `55% 55%` focal positioning. Desktop header padding is reduced; mobile top padding is 1.75rem with no decorative fixed height. The complete search form is visible in the initial 390×844 and 320×700 viewport. The functional map and its unavailable state remain intact.
- Homepage tiles retain their three-column desktop and single-column mobile rhythm. Text sits on solid charcoal below the photographs, instead of crossing the food-sharing hands. Photos use reserved heights on desktop/tablet and a 3:2 frame on mobile. The giving figure also reserves 3:2. Text and icons remain HTML/CSS.
- Photographs have no filters, blur, zoom, parallax or animation. Neutral shading is confined to desktop hero text areas and the Support heading area. A second short bottom-left shade protects the purpose text. Mobile homepage copy needs no image overlay. Increased contrast strengthens the desktop copy shade and supplies a bordered solid backing to the Support copy.
- Failed images retain their reserved space, neutral background and an “Image unavailable” label; successful images have no placeholder label. Forced failures and delayed loads were checked in the browser.

Compared with the approved triptych, the larger supplied family group requires more careful desktop spacing and an adjoining copy surface on mobile/tablet. Solid tile text areas preserve hands and readability. The directory deliberately retains only implemented categories, actual demo data and truthful map/provider-image fallbacks; reference-only providers, maps, badges and live-status claims are not reproduced.

## Actual validation

- **`npm test`: PASSED** — Node 24.19.0, 23 passed, 0 failed, 0 skipped, 37.34 seconds. Log: `output/photo-integration/npm-test.log`.
- **`npm run build`: PASSED**, including the public environment guard and frontend/backend TypeScript checks. Vite bundled 76 modules in approximately 69.3 seconds. The isolated legacy demo warning remains (549.75 kB minified / 138.38 kB gzip). Log: `output/photo-integration/npm-build.log`. Two attempts exited 137 after the operating system killed typechecking without a TypeScript diagnostic. Both attempt logs are retained separately. Build commands use Node 24.19.0 and command-local Node heap limits (512 MB initially, 256 MB on the final retry); no configuration was changed.
- **Browser layout/source checks: PASSED** — isolated headless Chrome at exactly 1440×900, 1024×768, 768×1024, 390×844 and 320×700, 100% zoom, DPR 1. Twenty-five route/viewport cases cover home, support, resource, give and organizations. No horizontal overflow, undersized visible controls, image decode failure or page exception was found. Each homepage initial navigation requested exactly one correct desktop/mobile family source. No observed layout-shift entries or unexpected console errors in these cases.
- **Image geometry/failure checks: PASSED** — forced image failures preserve page heights and show readable fallbacks; deliberately held-back image requests preserve main geometry after decoding on home, support and give.
- **Contrast: PASSED after focused corrections.** Text was hidden without changing geometry in separate browser captures, then the actual background pixels throughout each rendered text-line rectangle were compared against its computed text color. Normal and large text thresholds are 4.5:1 and 3:1. The lowest final measured regional ratio was 4.77:1, including the transparent hero action. This conservative regional check found and prompted fixes to the lower purpose copy and smaller Support descriptions. Results: `contrast-regions.json`, `contrast-results.json` and `*-contrast.png` under the output folder. Solid tile copy avoids photographic contrast variability entirely.
- **Interactions: PASSED** — home→support; location/category/radius/keyword search; empty and failed search/retry states; result→resource and preserved search-return URL; give navigation; organization entry→account; list/map fallback; fictional contacts/directions remain suppressed. Correction error and success were tested with intercepted browser responses, without submitting a real correction.
- **Keyboard/preferences: PASSED** — skip link, visible field focus, mobile Enter/Tab/Escape and focus return. Reduced-motion emulation removes transitions/animations. Increased-contrast emulation keeps layouts usable. The application remains light under a dark system preference. Homepage tile focus uses the shared blue instead of gold to remain visible against paper, and was checked with keyboard Tab at every viewport.
- **Boundary checks: PASSED** — `git diff --check`; no backend, shared contracts, dependencies, database, environment, hosting or security configuration changes.

Browser evidence: `browser-checks.json`, `extra-checks.json` and their scripts in `output/photo-integration/`. A reused-browser audit once recorded two hero resource entries while changing viewport size; that run was not counted as a pass. Ten separate fresh-context/revisit checks each recorded one correct hero request (`source-check.log`). The final main audit waits for viewport emulation to settle before each group of navigations. The demo API was the existing local in-memory repository; no live database writes or real service edits were made.

## Screenshots and review

The main screenshots were refreshed from the final production build. All paths are relative to the repository root. Full-page files are taller than the configured viewport; `-viewport` files preserve its exact height.

| Page | Desktop | Mobile |
| --- | --- | --- |
| Homepage | `output/photo-integration/screenshots/home-1440.png` | `output/photo-integration/screenshots/home-390.png` |
| Find Support | `output/photo-integration/screenshots/support-1440.png` | `output/photo-integration/screenshots/support-390.png` |
| Resource details | `output/photo-integration/screenshots/resource-1440.png` | `output/photo-integration/screenshots/resource-390.png` |
| Give Support | `output/photo-integration/screenshots/give-1440.png` | `output/photo-integration/screenshots/give-390.png` |
| Organization entry (unchanged) | `output/photo-integration/screenshots/organizations-1440.png` | `output/photo-integration/screenshots/organizations-390.png` |

Each page also has 1024, 768 and 320 captures. Supplemental screenshots show forced image failures, increased contrast, and search error/empty states. The home, Support, giving and resource captures were opened and visually inspected against the approved triptych, including family crops, editorial hierarchy, clear gestures, natural image color and light application surfaces.

## Remaining limitations

- Supabase/Google sign-in, real memberships, Mapbox rendering and live staff saves remain **BLOCKED for live verification by missing local service configuration**. This photo pass checks existing unavailable states and demo flows; it does not establish those external integrations are working. No credentials/configuration were changed.
- Authentic provider-specific images are still unavailable. Generic generated healthcare imagery is not substituted into named resource pages. The healthcare asset remains reserved.
- The desktop family source is 1672×941, not 2560px/4K, and does not supply native 2× detail across a 1440px display. The mobile image is a separate portrait adaptation, not a pixel-identical crop.
- These are Chrome checks, not a full accessibility certification or physical touch-device/assistive-technology study. Other browser engines and larger user text settings remain separate review work.
- The existing isolated legacy globe/demo bundle size warning is outside this targeted photo task.

Backend/API contracts, authentication/authorization, map provider configuration, geographic semantics and security safeguards were not changed. No deployment, publishing, push, schema changes or new framework. Stop for visual review.
