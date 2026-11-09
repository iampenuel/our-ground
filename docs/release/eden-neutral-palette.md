# Our Ground — neutral palette and production qualification

**Visual candidate: PASS. Full public release: NO-GO pending owner-managed configuration, real assigned-organization authorization and physical accessibility acceptance.** The owner’s successful physical Chrome Live conversation is accepted for the described scenario. It is not treated as a request to rebuild voice, and no Google Live session was consumed for this CSS release.

## Release identity

- Application commit: `e58a5521f1f1b36be788916ef0883b8399fd3542`.
- [Immutable protected candidate](https://ourground-staging-37fu5oqyt-penuels-projects-aa802b06.vercel.app), deployment `dpl_B4StNFc6YvNF1bkR6n6CK8gfDrLM`.
- [Protected staging alias](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) serves the same commit. [All 136 actual deployed asset hashes match](eden-live-action-evidence/deployment-e58a552.json); fixture mode is false. Anonymous requests still redirect to Vercel Authentication.
- Branch `codex/eden-ux-recovery-20261108`; PR #3 remains open/draft/unmerged. Later verification-only changes normalize equivalent minified CSS colors and wait for portrait readiness in the zoom harness. The final delivery states the separate PR HEAD and CI status.
- Production is still `33574bd80666d67a26a0765bf42a72fa5627fc7f`, deployment `dpl_5BLDMWteSXZ8ju8VVcfXttiUQBiq`. [Fresh read-only deployment/environment audit](eden-call-evidence/neutral-production-env.json).

## Exact palette changes

| Semantic token | Before | After |
|---|---|---|
| `--og-paper` page canvas | `#F8F7F2` | `#FCFCFA` |
| `--og-white` card/content | `#FFFEFA` | `#FFFFFF` |
| `--og-surface-soft` grouping | `#EEEEE6` | `#F5F5F3` |
| `--og-ink` ordinary reading | `#202824` | `#252A28` |
| `--og-muted` secondary text | `#57615B` | `#626965` |
| `--og-line` decorative divider | `#DEDFD6` | `#E4E5E1` |
| `--og-border-strong` essential control | `#7C887D` | `#7A837D` |
| Soft green/blue/success grouping | Separate tinted surfaces | Alias to `--og-surface-soft` |
| Forest accents | `#244236` / `#1C332C` | Preserved |
| Existing utility/focus blue | `#254F5B` | Preserved |

The eight CSS files changed are [design tokens](../../src/design-tokens.css), [navigation](../../src/navigation.css), [application primitives](../../src/styles.css), [support](../../src/support.css), [resource context](../../src/support-resource-context.css), [institution media](../../src/institution-media.css), [Eden panel](../../src/eden/components/assistant.css) and [cursor status](../../src/eden/action-pointer.css). Ordinary reading/headings use charcoal; general links and selected navigation use an established forest accent. Eden’s panels, greeting, composer and welcome bubble use the same neutral semantics. Placeholder opacity is explicit, and essential input/composer/report borders use the strong token. No new brand green or font was introduced.

The standalone eligibility stylesheet in [adult-access.ts](../../backend/adult-access.ts) now uses matching semantic colors. Only its CSS response string changed; admission logic remains byte-identical. A baseline axe check demonstrated one existing unfocusable overflowing transcript. The smallest correction adds a named, keyboard-focusable region to the existing transcript in [hosted panel](../../src/eden/hosted-panel.ts) and [review widget](../../src/eden/components/assistant.ts). No speech, tool or authentication behavior changed.

**Preservation: PASS.** The source declaration audit finds no typography/layout declaration change. Serif/sans pairing, font sizes, headline, column proportions and spacing remain. Hero photography, image asset bytes, dark overlays and map-tile code remain unchanged. The EDEN arrow/label, approved avatar and animations remain. [CSS audit](eden-call-evidence/neutral-css-declarations.json) · [Frozen Live/tools/auth/hero source hashes](eden-call-evidence/neutral-preservation.json).

## Matching before/after screenshots

All desktop pairs use **1440 × 900**. BEFORE is the prior protected `08b1685`; AFTER is `e58a552`.

| Required view | Before | After |
|---|---|---|
| Homepage, Eden closed | [Image](eden-neutral-palette-images/before-home-closed.jpg) | [Image](eden-neutral-palette-images/after-home-closed.jpg) |
| Homepage, Eden open | [Image](eden-neutral-palette-images/before-home-eden-open.jpg) | [Image](eden-neutral-palette-images/after-home-eden-open.jpg) |
| Give Support | [Image](eden-neutral-palette-images/before-give.jpg) | [Image](eden-neutral-palette-images/after-give.jpg) |
| Find Support | [Image](eden-neutral-palette-images/before-support.jpg) | [Image](eden-neutral-palette-images/after-support.jpg) |
| Actual published resource detail | [Image](eden-neutral-palette-images/before-resource.jpg) | [Image](eden-neutral-palette-images/after-resource.jpg) |
| Organization entry | [Image](eden-neutral-palette-images/before-organizations.jpg) | [Image](eden-neutral-palette-images/after-organizations.jpg) |
| Organization Account | [Image](eden-neutral-palette-images/before-account.jpg) | [Image](eden-neutral-palette-images/after-account.jpg) |

[320px chat](eden-neutral-palette-images/after-narrow-home-eden-open.jpg) · [Transcript keyboard focus](eden-neutral-palette-images/after-desktop-eden-history-focus.jpg) · [Eligibility](eden-neutral-palette-images/after-desktop-eligibility.jpg).

The warmer cast is removed; spacing, editorial photography, control proportions and page hierarchy match. Cards remain distinct through white surfaces, subtle separators and existing spacing. Heavy shadows or decorative effects were not added.

## Verification

| Test | Result and limits |
|---|---|
| Actual computed palette | **PASS.** Canvas `rgb(252,252,250)` and reading text `rgb(37,42,40)`; all asserted semantic roles match. |
| Text/control contrast | **PASS.** 130 computed checks. Observed minimum text/placeholder 5.63:1; observed essential boundaries 3.91:1. Across all three neutral token surfaces, analytical minimums are 13.36:1 primary text, 5.16:1 secondary text, 3.58:1 strong borders. [Contrast table](eden-call-evidence/neutral-contrast.json). Subtle separators are decorative, not the upgraded essential input boundaries. |
| Responsive/axe | **PASS.** 17 matched views covering desktop, tablet, mobile and 320px/reduced motion; 17 axe scans with zero final violations or page errors. Baseline’s one transcript defect is retained in [BEFORE](eden-call-evidence/neutral-before.json); [AFTER](eden-call-evidence/neutral-after.json) verifies its correction. |
| Keyboard and screen-reader semantics | **PASS browser checks.** Visible focus, labeled transcript region, Shift+Tab and history PageUp/PageDown without moving the document. Labels, native disabled attributes and selected-state underline/pressed semantics remain. Physical screen-reader acceptance is not inferred. |
| Actual Chrome 200% | **PASS on exact protected compiled bundle.** Zoom 2/dpr 4; header/hero/community gutters 30/30/30; keyboard Home; unclipped invitation/EDEN labels; six rendered cursor landings; one fixture search and details. [Receipt](eden-call-evidence/neutral-zoom.json). |
| Text, navigation, directory/detail smoke | **PASS.** Two fixture Eden identity/capability replies; actual published Harrisburg directory/resource detail; distinct Give Support, organization and account routes. The actual model was not re-probed for a color change. Model code/configuration is unchanged and prior genuine text evidence remains. |
| Staging auth smoke | **PASS limited smoke.** Actual Google chooser, correct staging Supabase authorize, canonical `/auth/callback`, PKCE; account private/no-store; anonymous organization data 401. [Receipt](eden-call-evidence/e58a552-auth.json). Earlier real login, cross-tab logout and natural refresh remain independently documented in [auth recovery](eden-auth-recovery-2026-11-08.md). |
| Automated/build/security | **PASS.** 813 tests, none failed/skipped; both typechecks; one protected build/deployment; source scan 1,006 files and build scan 1,080 files, zero findings. All 136 deployed hashes match. Both application-commit CI jobs pass, including dependency audit, disposable PostGIS and browser suites. [Receipt](eden-call-evidence/neutral-automated.json) · [CI source jobs](eden-call-evidence/neutral-ci-source.json). Final verification-only PR-head checks are reported with delivery. |
| Voice regression policy | **PASS preservation / owner-observed acceptance.** Zero new Google text, Live-token or TTS provider requests in the visual harness. No voice/session/tool pipeline edit. [Owner acceptance](eden-call-evidence/neutral-owner-acceptance.json), with scope below. |

The visual harness first encountered equivalent minified `#fff` versus `#ffffff`; normalization corrected the test oracle. The zoom harness initially measured the asynchronously loaded portrait too early; a readiness wait corrected that race. Neither required another product build. Earlier attempt receipts remain in external artifacts.

Guidance was applied through existing semantic roles, restrained neutrals and distinguishable controls: [Apple color](https://developer.apple.com/design/human-interface-guidelines/color), [Primer color usage](https://primer.style/product/getting-started/foundations/color-usage/), [Geist colors](https://vercel.com/geist/colors), [USWDS color](https://designsystem.digital.gov/design-tokens/color/overview/). Numeric checks use [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast). These checks do not certify full WCAG compliance or replace physical Safari/VoiceOver acceptance.

## Updated physical Live acceptance

**PASS, owner-observed:** natural Chrome multi-turn conversation covering identity, Our Ground’s audience, examples, a Berkeley search, support-category clarification, community support, first-listing details, further role/page questions, and deliberate End Call. The owner is satisfied with voice character, avatar, cursor and page awareness.

This is meaningful physical acceptance for that scenario. The owner did not supply a correlation/runtime manifest or separately attest phonetic EE-den, interruption timing, Safari or concurrent capacity. Those details are not invented. Aoede and pronunciation/continuation guidance remain unchanged. The previous [automated missing-provider-progress failure](eden-call-evidence/final-live-failure.json) is retained as historical reliability evidence, not converted into a current demand to rewrite voice. No new Live acceptance test was needed for this release.

## Production readiness and minimum owner actions

**NO-GO for the complete public release.** Current blockers are configuration/authorization and remaining physical accessibility checks, not a new CSS or voice regression.

**PASS read-only production/data audit:** both databases match all **19 non-demo migration hashes**; no missing/mismatched migrations; 17,520 published real and zero demo records each; organization RLS and no direct anonymous/authenticated membership SELECT. Sources remain HRSA 16,419; HUD 508; PGC food 60; Philadelphia 324; Seattle 209. Production HSTS/CSP/nosniff/private account and foreign-origin denial remain. [Database](eden-call-evidence/neutral-database.json) · [Production HTTP](eden-call-evidence/neutral-production-http.json).

| Owner-managed requirement | Exact state / minimum action |
|---|---|
| Production Supabase/browser auth | **BLOCKED.** Set matching `SUPABASE_URL` and `VITE_SUPABASE_URL` to `https://amcqkonluwavilekgjww.supabase.co`. Obtain **that production project’s publishable key**, and set matching `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY`. All four are absent in actual production metadata. Never use a secret/service-role key in VITE. |
| Production Google OAuth | **BLOCKED/unverified.** Verify the production provider/client, Google-to-Supabase callback `https://amcqkonluwavilekgjww.supabase.co/auth/v1/callback`, Supabase Site URL `https://ourground.vercel.app` and application allowlist `https://ourground.vercel.app/auth/callback`. Then configure `VITE_GOOGLE_AUTH_ENABLED=true` and `VITE_ACCOUNT_ALLOWED_ORIGINS=https://ourground.vercel.app`; confirm existing server `ACCOUNT_ALLOWED_ORIGINS`. These browser flags are absent. No production provider setting was guessed from staging. |
| Production geocoding/map credentials | **BLOCKED qualification.** Server key and actual `VITE_GEOAPIFY_BROWSER_KEY` are present; provider-dashboard origin/referrer/API restrictions remain unverified. Separate `GEOAPIFY_LOCATION_ENABLED` / `GEOAPIFY_LOCATION_LIVE_APPROVED` flags are absent. Approve them only after checking that production key’s permitted uses/plan. Preserve shared budgets and zero automatic retries. |
| Production Live | **BLOCKED activation/capacity qualification.** Both `VITE_EDEN_HOSTED_LIVE` and `EDEN_LIVE_PRODUCTION_APPROVED` are absent, so Live stays off. Actual production credentials’ eligible model/terms/quota remain unverified. Source defaults are 24/6 starts, 32/8 credential attempts, two slots and 600 seconds; staging’s 48/12 and 60/16 overrides do not propagate. Owner approval must define a bounded public beta/provider budget before activation. No unlimited capacity claim, paid resource or billing change. |
| Genuine assigned-organization test | **BLOCKED.** Both databases still have zero memberships, listing assignments and admins. Supply an owner-approved **nonproduction** reviewer/test account and organization/listing authority through the audited enrollment/approval path, then verify positive and foreign-listing denial. No role or assignment was fabricated. Management remains securely gated; resident/donor information paths work independently. |
| Physical accessibility | **BLOCKED.** Complete remaining Safari/VoiceOver acceptance; keyboard/axe/Chrome results are not substituted for it. No repeated physical Chrome Live test is requested for CSS. |

Production’s existing CSP also lacks the future Supabase and Google WebSocket connections. The production build must render and validate security configuration for the exact production auth origin and explicitly approved Live setting. Do not copy the staging CSP or credentials. [Current redacted environment and Git/deployment ownership audit](eden-call-evidence/neutral-production-env.json).

Repository default branch is `main`; PR base is `codex/adult-about-copy`; the previous production metadata records `codex/adult-directory`. Automatic Git deployments are disabled. A manual cutover must identify the approved source SHA explicitly rather than infer deployment from a branch or merge. The production and staging Vercel project IDs are separate and checked.

## Cutover and rollback — prepared, not executed

The detailed [production runbook](eden-production-cutover.md) remains the procedure. Only after the owner closes these gates and explicitly authorizes public deployment:

1. Re-resolve production alias/deployment/SHA and record rollback target.
2. Use a fresh internal APFS checkout of the approved SHA, linked only to `ourground`, project `prj_4li6QnqulPgPbJpxMW2L9hczDNrS`, team `team_7zBDrVIlwYth2sXkAbBPcbYw`.
3. Pull **production** settings, validate its own keys/origins, render/validate CSP, run the production build/typechecks/secret scan and inspect the exact non-fixture build manifest. Rebuild; never promote the staging artifact across projects.
4. Create the approved unaliased production candidate, then promote only after its checks/owner approval:

```sh
vercel build --prod --scope penuels-projects-aa802b06
vercel deploy --prebuilt --prod --skip-domain --scope penuels-projects-aa802b06
vercel promote <verified-production-candidate-id> --scope penuels-projects-aa802b06
```

5. Verify canonical Google login/refresh/logout, public directory, authorized and foreign organization access, headers/CORS and approved voice policy. If a gate fails, roll back to the rechecked prior production release:

```sh
vercel rollback dpl_5BLDMWteSXZ8ju8VVcfXttiUQBiq --scope penuels-projects-aa802b06 --yes
```

The existing production target is functional and was independently resolved. No production rollback was executed during this pass. Code rollback does not reverse OAuth, environment or database changes. No migration is proposed. PR #3 remains unmerged, and production is untouched.

Public screenshots and full before/after receipts are on `/Volumes/Penuel Back/OurGround-Work/runs/2026-11-08-eden-3fbf44a-3045f215/artifacts/neutral-palette/`. Source, Git, credentials and sensitive build output remain on internal APFS. No unrelated files or backups were removed or altered.
