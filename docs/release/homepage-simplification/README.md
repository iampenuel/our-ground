# Homepage simplification

The approved homepage keeps its existing hero and transitions directly to the existing footer. The community introduction, photographic pathway cards, closing quotation and unused pathway data/styles are removed. Header, hero and footer links preserve resident, donor and organization access.

Source lineage: PR #4 head `320d38d91d01cc87f47b56d78990d139d2c8dddc`, incorporated into `main` at `48e2f0132641e6ed4163175ec79cee1485b58c9b` before the UI change. Automatic Vercel Git deployment remains disabled. No Eden, authentication, directory, map, authorization, provider configuration or dependency code was changed.

## Local verification

- Hero template is byte-for-byte unchanged: SHA-256 `eac9d66d003c738508c854f2d9d8b356e24be6a0bc32ae9d3c734402e3afc0d3`.
- All 70 retained landing CSS rules preserve declarations and media contexts; only obsolete selector members and rules were removed.
- Before/after Chrome measurements match for hero image, overlays, geometry, typography, spacing, actions and values at 390×844, 768×1024 and 1440×900. The desktop hero PNG also matched byte-for-byte. Full-page screenshots naturally change because the lower content is gone.
- The footer immediately follows the hero with zero inter-section gap. No horizontal overflow at the three capture sizes.
- TypeScript frontend/backend checks, production build and build-secret scan: PASS.
- Automated suite: 817 tests, 816 passes, one pre-existing historical replay skip, zero failures.
- Updated release browser journeys: PASS at mobile, tablet and desktop; includes header routes for all three audiences, both hero actions, keyboard progression to the footer and existing donor/organization/resident behavior.
- Accessibility/reflow browser checks: five viewports, 13 axe page checks, zero violations or unexpected page errors.
- Actual Chrome 200% zoom: PASS, including header/hero gutters, keyboard home navigation, Eden controls, cursor target alignment and synthetic search/detail actions.

Local captures and browser transport fixtures used no Gemini quota. Deployment, protected staging and public production verification are recorded in the associated PR after their checks finish. Existing production is preserved until the protected production-config candidate passes.

## Screenshots

| Size | Before | After |
| --- | --- | --- |
| Desktop | [Before](before-desktop-full.jpg) | [After](after-desktop-full.jpg) |
| Tablet | [Before](before-tablet-full.jpg) | [After](after-tablet-full.jpg) |
| Mobile | [Before](before-mobile-full.jpg) | [After](after-mobile-full.jpg) |

[Before metrics](before.json) and [after metrics](after.json) describe local Chrome captures with synthetic API status responses. Screenshots contain no account information or credentials. Gemini Live and TTS were not invoked for this UI-only change; unchanged implementation and automated fixtures preserve their prior acceptance evidence rather than claiming a new physical microphone test.
