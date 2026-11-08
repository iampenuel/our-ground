# Our Ground — Phase 1 implementation

Scope: shared foundations, navigation, homepage, and honest donor/organization entry points. Resource search, detail, account and staff layouts have not been redesigned. No deployment, dependency installation, backend, database or security configuration changes were made.

## Implementation

- `src/design-tokens.css`: semantic paper/ink/green/blue/gold colors, spacing, Georgia display typography, system sans-serif UI typography, controls and reduced-motion rules.
- `src/navigation.ts` and `src/navigation.css`: shared Our Ground wordmark, destinations, current-page treatment, native mobile menu, Escape/focus recovery and skip link.
- `src/landing.ts` and `src/landing.css`: approved homepage hierarchy, primary actions, editorial introduction, three audience cards and footer. No scroll-driven scenes, CGI, automatic motion, statistics or verification claims.
- `src/participate.ts`: `/give` and `/organizations`, connecting to existing discovery/account workflows. No donation processing, volunteer booking or public onboarding is implied.
- `src/main.ts` and `src/ui.ts`: shared navigation initialization/re-export and new route dispatch.
- `src/demo.ts`, `src/demo.css`, `src/info.ts`, `index.html`: shared navigation integration, retained demo controls and small branding/metadata corrections.
- `README.md`: current scope and routes.

## Photography gap

Four homepage photography areas are explicitly labeled **Temporary photo placeholder**, including accessible descriptions. Neither approved reference PNG is imported into the application. No contact-sheet crop was enlarged and no low-resolution image was substituted.

Approved individual photographs are still needed: a family in an open meadow (including a usable mobile crop), wildflowers, community giving, and a river landscape. They should be supplied as separate high-resolution assets before judging final photographic fidelity. The current system font stacks require no network font dependency.

## Validation

- Node 24.19.0: `npm test` — **23 passed, 0 failed, 0 skipped**, about 68.5 seconds.
- `npm run build`: **passed**, including public environment checking and both frontend/backend TypeScript checks. Final verification used `NODE_OPTIONS=--max-old-space-size=1024` to bound Node's heap; Vite completed the final bundle in about 70 seconds.
- Existing warning: the isolated legacy `/demo` JavaScript chunk is about 549 kB minified. It is not loaded by the homepage.
- `git diff --check`: passed. Backend, shared API contracts, existing tests, dependencies and hosting/security configuration have no diff.
- Browser widths checked: 1440×900, 768×1024, 390×844 and 320×768. Document width matched viewport width at each size. The narrow-card text/arrow overlap found at 320px was corrected.
- Keyboard: desktop tab order and visible focus, mobile Enter → Tab → Escape with focus restored to Menu, and skip-link activation to `main` were checked.
- Read-only demo regression: homepage action → `/support` → Harrisburg result → resource detail. Search return filters and fictional-record contact/directions suppression were checked. No correction reports or service edits were submitted.
- Donor/organization entry content and navigation to existing directory/account routes were inspected. Configured Google OAuth and live Mapbox rendering were not exercised; the current build exposes their unavailable states.
- Reduced-motion rules were inspected in the built browser stylesheet: control transitions are disabled and press transforms are removed under `prefers-reduced-motion: reduce`. The homepage has no automatic animation. Active browser preference emulation was not completed; native DevTools testing conflicted with concurrent use of the shared Chrome window. This remains a manual verification gap, not a claim of a fully emulated reduced-motion run.

Earlier rebuild retries were terminated by the operating system during type checking without TypeScript diagnostics. The final bounded-memory run completed with exit code 0. This environment setting was used only for the command; no project configuration was changed.

## Review artifacts

Browser screenshots are local review output under `output/phase-1/screenshots/` (ignored by Git):

- `homepage-1440.jpg`
- `homepage-768.jpg`
- `homepage-390.jpg`
- `homepage-320.jpg`
- `homepage-1440-viewport.jpg` and `homepage-390-viewport.jpg`
- `organizations-320.jpg`

The final four homepage screenshots were refreshed from the completed production build. `output/phase-1/browser-checks.json` records viewport widths, keyboard results and explicit verification limits.

Phase 2 and a deployment are not part of this change.
