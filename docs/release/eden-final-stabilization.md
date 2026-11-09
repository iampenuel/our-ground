# Eden final stabilization and qualification

The protected alias currently serves **`fe2c8d691ee7a7fd710b852b264c7c043bdd01fd`**, deployment `dpl_AszytnU8qi29poqytBfKJD1YEJ9N`. [Team staging](https://ourground-staging-git-eden10-penuels-projects-aa802b06.vercel.app) · [Immutable candidate](https://ourground-staging-l7a5pa2cn-penuels-projects-aa802b06.vercel.app).

## Implemented corrections

| Cause | Correction |
|---|---|
| Green agent target outlines and the pointer's default click ring | Removed agent-only CSS decoration and disabled the ring. Keyboard focus remains visible. The overlay remains transparent and never dispatches clicks. |
| Duplicate provider IDs and repeated pointer movement | Completed actions have a user-turn-scoped semantic receipt in addition to function-ID receipts. Reissued calls reuse verified results while the page matches. A new deliberate user turn can search again. Superseded animation/scroll work is canceled, including old cleanup timers. |
| Live prompt requested search followed by automatic details | Search now executes once and narrates its actual results. Details require the visitor's request. |
| Empty chat showed a generic heading, with inconsistent remount state | Restored a compact warm welcome. Reopening and same-host remount preserve it and the log. New chat resets it. Initial page load starts neither chat nor audio. |
| Example city IDs were authoritative at schema, routing and page boundaries | Coarse U.S. locality/state and ZIP input now uses the existing Census/Geoapify resolver. Manual and Eden actions share verified points, ambiguity choices and spelling correction. Country, address privacy, source and context checks remain enforced. |
| Blocking/interruption work could outlive its turn | Pending work is canceled, replacement tools await the old turn ending, and completed actions remain receipts. Numeric rendered/canceled buffer durations inform continuation without claiming exact words heard or persisting raw audio. |
| Short-E name pronunciation | Added EE-den guidance to Live instructions and TTS speech metadata, preserving written Eden and Aoede. Actual pronunciation on this version awaits the combined physical acceptance test. |
| A real Berkeley reply omitted a mandatory source-fact ID | Complete only missing required immutable facts after validating the model's IDs. Unknown IDs, arbitrary prose and malformed responses still fail. No second model request is made. |
| Census San Francisco point is offshore | Added strict, admitted, cached city-coordinate enrichment through the existing Geoapify provider. Census identity/provenance remains. It is inactive while staging geocoding is disabled. |

Changes are in the shared Eden contracts, existing directory/location adapters, page/action bridge, Live controller/player, pointer and hosted panel. [Source comparison](https://github.com/iampenuel/our-ground/compare/2665050781818a169461132b5d200699a6bbb5e4...fe2c8d691ee7a7fd710b852b264c7c043bdd01fd).

## Verification

**PASS** — 805 automated tests, none skipped, both typechecks, build and secret scan. [All 136 deployed assets match](eden-live-action-evidence/deployment-fe2c8d6.json). All frontend assets are [identical](eden-call-evidence/stabilization-ui-identical.json) to the preceding protected candidate's tested assets.

**PASS** — [five responsive widths and thirteen axe scans](eden-call-evidence/stabilization-ui.json), zero violations or page errors. [Focused checks](eden-call-evidence/stabilization-focused-ui.json) confirm one greeting, New chat, reduced motion, visible keyboard focus, no green target outline/ring/native click and no automatic audio. [Actual 200% Chrome zoom](eden-call-evidence/stabilization-zoom.json) confirms six cursor landings, unclipped EDEN labels, one search and keyboard Home. The old zoom fixture lacked the required U.S. country value and was corrected before this pass.

[Welcome screenshot](eden-call-evidence/stabilization-welcome.jpg) · [Near-black pointer](eden-call-evidence/stabilization-pointer.jpg) · [Genuine Gemini search recording](eden-call-evidence/stabilization-cursor-search.webm).

### Location results

These tests use actual protected geocoding/directory services with explicitly controlled Gemini decisions. They verify page behavior independently of model inference. The separate genuine Gemini results below supply inference evidence.

| Required input | Manual / Eden result |
|---|---|
| Lanham, Maryland | PASS, same resolved point and one search |
| Harrisburg, Pennsylvania | PASS, same resolved point and one search |
| Berkeley, California | PASS, same resolved point and one search |
| Baltimore, Maryland | PASS, same resolved point and one search |
| New York City, New York | PASS, same resolved point and one search |
| Philadelphia, Pennsylvania | PASS, same resolved point and one search |
| San Francisco, California | FAIL current hosted city-center check, staging falls back to the offshore Census point |
| San Fransisco | PASS spelling correction and manual/Eden consistency on `14975ca`, city-center qualification blocked by the same Geoapify configuration |
| ZIP 20706 | PASS, same valid ZCTA point, four listings, one search. ZIP state is optional. An initial harness assertion incorrectly required it and was corrected. |
| Berkeley without state | PASS, clarification, no directory query |
| Monowi, Nebraska | PASS, resolved place with zero matching records, one search |

[Initial corrected-candidate matrix](eden-call-evidence/fe2c8d6-geography-initial.json) · [ZIP confirmation](eden-call-evidence/14975ca-zip-confirmed.json) · [Ambiguity](eden-call-evidence/fe2c8d6-ambiguous.json) · [Resolved empty](eden-call-evidence/fe2c8d6-empty.json) · [Full controlled local matrix](eden-call-evidence/stabilization-local-geography.json).

**PASS genuine Gemini steps** — Harrisburg search, correction to Lanham and first-result details each completed through the real text engine. Search counts were 1, 1 and 0 respectively. The same run's Berkeley result returned `EDEN_AGENT_COMPOSITION_REQUIRED` 502, correlation `a66d0729-7c1c-4ef3-bb31-e97c9afc9a52`. After the mandatory-fact correction, [one targeted genuine Berkeley search](eden-call-evidence/fe2c8d6-berkeley.json) passed with 131 source-backed listings within ten miles, the first 20 displayed. [Original mixed-result receipt](eden-call-evidence/14975ca-real-text.json).

**PENDING physical audio** — the owner confirmed conversation and actions on `2665050`, then requested pronunciation and interruption refinements. One combined physical test was requested on this corrected code. No additional automated Live or TTS requests were made during this stabilization pass. Pronunciation and natural continuation are not marked passed from text instructions or fixtures alone.

**PASS security smoke checks** — [Google chooser/canonical PKCE callback, anonymous organization denial and effective limits](eden-call-evidence/fe2c8d6-auth.json). [Fresh database checks](eden-call-evidence/stabilization-database.json) found RLS and no direct anonymous/authenticated membership grants, zero assigned test memberships/admins and 17,520 published non-demo services in both databases. Existing PGC food data includes 60 listings, with 49 near the public Lanham test point. [HTTP boundaries](eden-call-evidence/stabilization-http.json) deny unauthorized access and foreign CORS grants. Positive assigned-user authorization remains BLOCKED.

## Exact current blocker and production decision

**NO-GO.** Staging has `GEOAPIFY_LOCATION_ENABLED=false`, `GEOAPIFY_LOCATION_LIVE_APPROVED=false` and no server key. The existing local Geoapify key returned a [matching San Francisco city point with confidence 1](eden-call-evidence/stabilization-geocoder-probe.json). Automatic approval review rejected persisting that separate credential to Vercel because the earlier explicit credential authorization covered Gemini. A branch-scoped Geoapify secret/flag approval is pending. Minimum next step is that approval, a redeploy of the unchanged verified artifact with updated Preview environment, and the hosted city-center check.

Production also needs the missing Supabase/browser OAuth configuration, approved production Live opt-in, Geoapify configuration/restriction verification, real assigned-organization authorization and manual Safari/VoiceOver acceptance. [Redacted environment audit](eden-call-evidence/final-production-env.json). The code now supports a disabled-by-default production Live gate requiring the exact production project, the enabled client flag and `EDEN_LIVE_PRODUCTION_APPROVED=true`. No production environment value was changed.

Limits remain 24 confirmed team starts/day, 6 per signed tester browser, 32/8 provider attempts, two slots and ten minutes. Source, dependencies and credentials remain on internal APFS. Public screenshots and recordings use `/Volumes/Penuel Back/OurGround-Work`. No nationwide directory completeness claim is made.

The [production checklist and rollback procedure](eden-production-cutover.md) describe the final owner-controlled cutover. PR #3 remains a draft and production remains at the audited deployment.
