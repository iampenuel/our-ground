# Our Ground — Phase 2 implementation

Status: Phase 2 complete and ready for visual review. No deployment.

Design direction: **Documentary Editorial Modernism × Cartographic Utility**. The approved triptych was the primary composition reference. The Apple design skill informed immediate feedback, predictable navigation, visible focus, clear status and restrained motion. Its glass/spring suggestions were not applied where they conflict with the project brief.

## 1. Implemented changes

- Extended the existing Phase 1 tokens across every active application stylesheet. Functional surfaces remain warm white/chalk under a dark operating-system preference. Editorial Georgia headings and platform sans-serif text remain local, with no font service dependency.
- Unified navigation, footer, controls, inputs, category filters, view selection, resource cards, map controls, empty/error states and focus treatment. Mobile navigation closes on Escape, outside click and when keyboard focus leaves it.
- Rebuilt Find Support around an editorial introduction, labeled location and keyword fields, category and distance filters, readable cards, and an optional map beside the list on desktop. Mobile defaults to the list. Selecting **List + map** preserves the list; there is no map-only mode hiding essential results or extra result-list scrolling.
- Rebuilt resource details around name/category, safe contact actions, source uncertainty, listed hours, service information, eligibility/cost, location/directions and correction reporting. Missing information remains explicitly unavailable. Unlisted days are not inferred to be closed.
- Replaced the old About network illustration with concrete editorial explanations for residents, donors and organizations. Added helpful unknown-route and resource-not-found recovery.
- Made account and staff pages consistent with the light visual system. Staff receive clear validation, dirty/save states, conflict recovery and a native unsaved-work warning. Failed saves/reloads retain entered text. Reloads temporarily disable fields to prevent new text being overwritten by the response.
- Prevented stale account/service responses from restoring signed-in information after sign-out. Existing Supabase PKCE handling and API authentication remain unchanged.
- Preserved Phase 1 homepage, donor and organization entry content. Their palette now references the same tokens; footer styles moved to the shared navigation stylesheet.
- Kept `/demo` outside primary navigation. Updated its visible branding, controls and surfaces without deleting its globe, region, illustrative needs or preview-form behavior. Added region keyboard pan/zoom and restored focus after closing its insight.

## 2. Exact files changed in Phase 2

These are Phase 2 changes on top of the existing, uncommitted Phase 1 work. The initial worktree was inspected and no reset, discard, staging, commit or deployment was performed.

| File | Change |
| --- | --- |
| `src/design-tokens.css` | Extended the existing semantic palette; light color scheme; global control/focus/reduced-motion foundations. |
| `src/navigation.ts` | Close mobile navigation when keyboard focus leaves it. |
| `src/navigation.css` | Shared footer styling and tokenized menu styling. |
| `src/styles.css` | Replaced the obsolete dark landing/application stylesheet with shared application primitives. |
| `src/landing.css` | Preserved Phase 1 composition; replaced palette literals with shared tokens and moved footer rules. |
| `src/support.ts` | New discovery composition; both views preserve results; return links track view changes; request-scoped pagination focus. |
| `src/support.css` | Responsive filters, cards, list/map layout and opaque, noninteractive map failure state. |
| `src/resource-map.ts` | Light Mapbox style, cooperative gestures, reduced-motion setting, descriptive keyboard label and constructor-failure recovery. |
| `src/resource-detail.ts` | Practical hierarchy, honest missing/source states, safe actions, readable hours, correction feedback. |
| `src/detail.css` | Light resource detail layout, responsive fact sections, sidebar and report form. |
| `src/info.ts` | About and 404 content/layout; removed glowing network imagery and unsupported travel claims. |
| `src/info.css` | Restrained editorial About and recovery layouts. |
| `src/account.ts` | Accessible account/record states and stale-request cancellation on account transitions. |
| `src/account.css` | **New:** shared account/staff layout and status styling. |
| `src/staff.ts` | Clean forms, understandable save states, dirty-work protection and safe reload behavior. |
| `src/demo.ts` | Honest legacy-demo copy, working-directory entry, region keyboard controls and focus recovery. |
| `src/demo.css` | Shared tokens and solid surfaces, larger controls, removed decorative effects, responsive globe correction. |
| `README.md` | Updated current product and Phase 2 scope. |
| `docs/design/phase-2-implementation.md` | This handoff. |

The approved ZIP files already existed under `docs/design/` and matched byte-for-byte. No extraction or overwriting was necessary. Phase 1 files such as `src/main.ts`, `src/ui.ts`, `src/landing.ts`, `src/participate.ts` and `index.html` retain their earlier changes; Phase 2 did not replace them.

Local review scripts, JSON results and screenshots are under ignored `output/phase-2/`; they are not application dependencies or production fixtures.

## 3. Shared components and tokens

The existing `--og-*` system remains the only active product token system. Additions include soft neutral/green/blue surfaces, a stronger control border, error/warning/success text and surfaces, inverse text/line colors, temporary-photo colors and small functional shadows. Input border contrast was strengthened during review.

`src/styles.css` supplies shared primary/secondary buttons, form fields, resource cards, category chips, pagination, status and empty-state patterns. `src/navigation.ts/css` owns header and footer. Existing SVG icons remain code. Map markers use a 44px interactive target with a smaller visible cartographic dot; Mapbox controls use 44px targets.

Breakpoints coordinate with the existing 900px navigation change, with 600px small-screen adjustments and targeted 1024/760/480px detail layout changes. Forms use native controls and readable 16px input text. Anchor links are used for resource sections rather than unsupported tab behaviors.

## 4. Legacy styling removed or isolated

Removed from active routes: navy application backgrounds, orange action styling, glowing markers, arbitrary gradients, glass cards, old landing scene CSS, About's generated network image, small application text/control sizing and nested result-list scrolling. All active application CSS uses semantic colors.

Unused `src/landing-sections.ts`, `src/landing-sections.css` and `src/landing-palette.css` still exist as historical source, including obsolete Access text and palette definitions. They have no import from an active route and are not in the production bundles. They were inspected and deliberately left out of this behavior-preserving implementation. The unused network asset remains on disk but is no longer rendered by About.

The isolated `/demo` retains its Three.js globe/render loop, original Earth texture and illustrative/generated regional artwork. It is a legacy visualization, not real resource geography or measured community need. Its functional surfaces now share the product tokens. The large demo chunk remains a performance limitation.

## 5. Route completion

| Route | Phase 2 status |
| --- | --- |
| `/` | Phase 1 composition preserved; shared token/footer refinements and responsive regression checks. |
| `/support` | Redesigned; search, filters, pagination contracts, URL state, list/map modes and recovery preserved. |
| `/resources/:id` | Redesigned; factual/missing states, source uncertainty, safe actions and corrections preserved. |
| `/about` | Redesigned with human-centered editorial content; no network illustration. |
| `/account` | Redesigned; unavailable and browser-fixture assigned-access states tested. Live Google configuration is still required. |
| `/staff/services/:id` | Redesigned; unavailable, permission, validation, save, conflict and dirty-work states tested. Authenticated checks used isolated browser mocks. |
| `/give` | Phase 1 entry preserved; no implied payments, volunteer booking or organization verification. |
| `/organizations` | Phase 1 entry preserved; assigned staff access and unavailable public onboarding remain explicit. |
| Unknown routes | Redesigned recovery with working support and homepage destinations. |
| `/demo` | Isolated legacy experience retained, with token/accessibility cleanup and full stage regression checks. |

## 6. Engineering boundaries

No backend files, REST contracts, database migrations, dependencies, environment files, hosting settings or security configuration were changed.

Preserved requests: place resolution, anonymous resource search/details, correction reports, authenticated account/service reads, and staff PATCH with `expected_version`. Search location/category/radius/keyword/page/view remain in the URL and resource return links. Contact/source URLs still pass existing sanitizers. Fictional resources continue to suppress phone, website and directions actions.

No service records were invented for the application. Screenshots of resource discovery use the existing explicitly labeled in-memory demo API. Authenticated staff screenshots use clearly labeled browser-only fixtures; no staff save or correction report was sent to a real backend. No real Google account or live database was used.

## 7. Actual validation

- **`npm test`: 23 passed, 0 failed, 0 skipped**, Node 24.19.0, approximately 66.8 seconds. Existing tests cover API permissions, version conflicts, input validation, demo safeguards, contact safety and search state.
- **`npm run build`: passed on the final implementation**, including the public environment guard and frontend/backend TypeScript checks. The final Vite bundle stage completed in about 70 seconds (74 modules). Final command used Node 24.19.0 and `NODE_OPTIONS=--max-old-space-size=512`; no project configuration was changed. Earlier attempts, including one outside the sandbox, exited 137 during typechecking without diagnostics. The final run with review servers stopped completed with exit code 0. The only size warning is the isolated legacy demo chunk: 549.75 kB minified / 138.38 kB gzip.
- **`git diff --check`: passed.** Backend/contracts/package/configuration diff checks were empty.
- **Real Chrome viewports:** 1440×900, 1024×768, 768×1024, 390×844 and 320×700. No docked DevTools. Forty-five main route/viewport cases passed again against the final production bundle with document width equal to viewport width and no visible button/input/select/summary below the 44px target (measurement tolerance 1px).
- **Main interactions:** location, category, distance, keyword, empty results, error/retry, resource navigation, view-dependent return links, map-unavailable state retaining the list, resource-not-found recovery, and explicitly missing detail fields passed. Correction failure/success feedback was tested using intercepted browser responses only.
- **Keyboard:** skip link, visible focus, mobile Enter/Tab/Escape, focus return to Menu, and closing the mobile menu when Tab leaves it passed.
- **Media preferences:** actual reduced-motion and dark-color-scheme emulation passed on home, support, resource, About and account. Main product background remained warm paper; computed animations/transitions were disabled. This closes Phase 1's reduced-motion emulation gap.
- **Staff browser fixtures:** title validation, failed-save retention, `expected_version` conflict, canceled reload, failed-reload retention, disabled fields during reload, successful save with new version, native leave warning, assigned account records, sign-out race protection and 403 denial passed. All five widths passed for the editor. No browser page errors.
- **Legacy demo:** all three stages at all five dimensions passed; actual WebGL and region keyboard pan/zoom, needs toggle, focus recovery, modal preview and directory link passed. Reduced-motion emulation stopped automatic rotation; light theme persisted under dark preference. No browser page errors. A cropped 320px globe found during visual inspection was corrected and rechecked.

Results are recorded in `output/phase-2/browser-checks.json`, `staff-checks.json`, `extra-checks.json` and `demo-checks.json`. Local scripts sit beside those files for review reproducibility with the bundled Playwright runtime; no browser dependency was added to the project.

## 8. Screenshots and visual review

All paths below are relative to the repository root. Main-route screenshots were refreshed from the final production build; staff fixtures and legacy demo captures came from the matching source preview. Screenshots are actual Chrome captures; full-page captures are taller than the configured viewport, while `-viewport` files retain the exact viewport height.

| Page/state | Desktop | Mobile |
| --- | --- | --- |
| Homepage | `output/phase-2/screenshots/home-1440.png` | `output/phase-2/screenshots/home-390.png` |
| Find Support, optional map fallback | `output/phase-2/screenshots/support-1440.png` | `output/phase-2/screenshots/support-390.png` |
| Find Support, mobile default list | — | `output/phase-2/screenshots/support-list-390.png` |
| Resource details | `output/phase-2/screenshots/resource-1440.png` | `output/phase-2/screenshots/resource-390.png` |
| About | `output/phase-2/screenshots/about-1440.png` | `output/phase-2/screenshots/about-390.png` |
| Account unavailable | `output/phase-2/screenshots/account-1440.png` | `output/phase-2/screenshots/account-390.png` |
| Staff editor — browser fixture | `output/phase-2/screenshots/staff-fixture-1440.png` | `output/phase-2/screenshots/staff-fixture-390.png` |
| Staff unavailable | `output/phase-2/screenshots/staff-unavailable-1440.png` | `output/phase-2/screenshots/staff-unavailable-390.png` |
| Give Support | `output/phase-2/screenshots/give-1440.png` | `output/phase-2/screenshots/give-390.png` |
| Organizations | `output/phase-2/screenshots/organizations-1440.png` | `output/phase-2/screenshots/organizations-390.png` |
| 404 recovery | `output/phase-2/screenshots/not-found-1440.png` | `output/phase-2/screenshots/not-found-390.png` |
| Legacy demo | `output/phase-2/screenshots/demo-globe-1440.png` | `output/phase-2/screenshots/demo-globe-390.png` |

Additional captures include support/resource at 1024/768/320 widths, all staff fixture sizes, all demo stages/sizes, a staff conflict fixture, an assigned account fixture, search empty/error states and support/resource viewport captures.

Desktop and mobile captures were visually inspected against the reference: editorial serif hierarchy, warm light surfaces, restrained green/blue actions, consistent navigation, practical grouping and measured spacing are carried across routes. Tablet and small-mobile support/details, staff and demo were also inspected. This is **not a claim of visual equivalence**: the photographic atmosphere cannot be completed using the supplied contact sheets, and reference-only counts, service claims and donation actions were intentionally not invented.

## 9. Missing assets and remaining limitations

- Approved standalone production photographs remain unavailable: homepage family/meadow, wildflowers, community giving, river landscape, a wide Find Support wildflower image and any authentic organization-specific photography. Existing/new placeholders are explicit and no contact-sheet tiles were cropped or enlarged. Resource-card icons remain functional category indicators, not substitute provider photographs.
- The current main preview has no configured Google/Supabase sign-in or Mapbox public token. Unavailable states are tested; live OAuth, real organization memberships, real database writes and real Mapbox tile rendering/gesture behavior require configured development verification. Browser fixtures do not establish that those external integrations are working.
- The legacy demo JavaScript chunk remains over the build's 500kB warning threshold. It stays dynamically isolated from the primary product routes; no new animation/UI library was introduced.
- No blocking functional or keyboard issue was found in the tested states. Screen-reader/assistive-technology testing and real touch-device usability sessions remain separate verification work; this is not a full accessibility certification.
- Historical, unimported landing sources and unused imagery remain on disk. They should be intentionally archived/removed in a later cleanup, without changing demo behavior.

## 10. Recommended next phase

Stop for visual review of this implementation. After approval, supply approved standalone photography and review actual crops, then run configured-development OAuth, Mapbox and assigned-staff integration checks and assistive-technology/device testing. Address the isolated demo bundle and dead historical assets as deliberate maintenance work. Payments, volunteer booking, public onboarding and AI remain outside this implementation.
