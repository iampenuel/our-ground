# Phase 7D.2 — UI audit and design rationale

## Scope and references

The audit focused on Find Support, result cards, detail pages, giving, organizations/accounts, About, privacy and error states. The approved landing composition, photography, wordmark and favicon were preserved. The local Apple design skill was read and applied for hierarchy, predictability, user-controlled motion and accessibility.

[Apple's practical design guidance](https://developer.apple.com/design/tips/) informed alignment, touch targets and undistorted imagery. [Primer content](https://primer.style/product/getting-started/foundations/content/), [layout](https://primer.style/product/getting-started/foundations/layout/) and [progressive disclosure](https://primer.style/product/ui-patterns/progressive-disclosure/) informed concise primary copy with secondary detail nearby. Uber Base was consulted as requested, but its public sites returned a timeout/no readable content through research tools; no unseen rule is attributed to it. No design-system dependency or copied branding was introduced.

## Findings and changes

| Area | Finding | Change / disposition |
| --- | --- | --- |
| Find Support form | Optional mapped subtype and verbose scope explanation competed with location entry. | Location and Search lead. Food/Healthcare and distance remain direct. Mapped subtype moves to a native disclosure. Provider privacy gets a concise visible line. |
| Result hierarchy | Status, source availability, privacy and repeated disclaimers pushed real results far down. | Strong 600-weight result summary; short availability state; source/location/privacy details disclosed; small filter instruction. |
| Focus | Active styles were mostly outlines; no fuzzy green search halo was found in the preserved active build. Legacy unused scene styles contain decorative glows. | Shared crisp 2px outline token and consistent offset; input ring only for keyboard-visible focus. No claim that an unobserved halo was removed. Legacy landing/demo scene files were not randomly redesigned. |
| Result cards | Names, source paragraphs and controls had weak compact hierarchy. First thumbnail prototype pushed names down. | Explicit heading/media grid; small labeled square, visible source/verification label, source dates disclosed, actions retained. Screenshot-discovered alignment problem fixed. |
| Selection | Selected and focused states needed distinct roles. | Selected card uses a narrow inset green edge; keyboard focus remains a crisp contrasting outline. No outer glow. |
| Mobile map | Mobile default and breakpoint change forced list-only view. | Default visible map above list; optional Hide/Back to list. Resize honors an explicit choice. Map/list source IDs unchanged. |
| Scroll | Only the loading summary was revealed. | One cancellable status→results/referrals continuation per explicit search. Manual user navigation, cancellation and stale results suppress it. No focus theft; reduced-motion respected. |
| Food empty/outage | Similar-looking states made sparse coverage seem broken. | Directory, mapped-only, referral-only, disabled and outage outcomes are distinct. Zero records do not imply no assistance. Empty food panels yield to useful referral actions. |
| Detail media | Dashed empty upload-like square. | Stable contained/cropped media system, approved category illustrations and honest caption. |
| Detail source panel | Every imported record received warning-like presentation and expanded metadata. | Calm neutral source panel; warning treatment retained for needs-review/demo. Dates and provenance retained in disclosure. |
| Detail map | Said unavailable before optional loading had been requested. | Correct “Location map” prompt when configured, with preserved optional loading and failure fallback. |
| Report shortcut | Native fragment navigation displaced the requested summary focus after the form opened. | Explicit fragment navigation, disclosure opening, reduced-motion-aware scroll and summary focus. No report was submitted in tests. |
| Shared forms | Several equivalent small-radius literals. | Existing small-radius token reused; no form logic or account styling rewrite. |
| Landing/giving/organizations/accounts | Existing restrained composition and approved imagery held up at desktop/mobile sizes. | Layout/photography unchanged; shared focus refinement only. Account onboarding remains safely unavailable until configured. |
| Error/loading/notification states | Existing loading and fail-closed behavior needed preservation. | Mocked source/quota/outage and no-result checks retained. No fake data inserted to hide errors. |

## Browser audit evidence

20 actual built-route viewport checks: `/`, `/support`, `/give`, `/organizations`, `/about`, `/account`, `/privacy`, `/account/administration`, a real HRSA detail route, and a not-found route, each at 1440×900 and 390×844. Every visible image loaded; no horizontal overflow, JavaScript exception or CSP violation. The final report-focus fix was separately rebuilt and verified rather than falsely counting its first failed interaction as a pass.

Compiled offline search fixtures additionally cover 390, 768, 900 and 1440 widths, a real MapLibre renderer with an explicitly offline style, keyboard-visible focus, touch emulation, default/hide behavior, exact marker/card counts, manual scrolling and reduced motion. Technical media fixtures cover seven image-priority/containment cases and final image failure. Chrome's accessibility tree exposes the search landmark and combobox. No physical device, VoiceOver or NVDA session is claimed.

The meaningful current limitations are separate: live Geoapify map style 401; San Francisco live food timeouts; no real approved institution logos; hosted authentication/private organization workspace unavailable; no verified privacy inbox. Offline renderer checks are not proof that live tiles work. Genuine food results from Harrisburg/Philadelphia and actual HRSA records are not synthetic; repeated giving/history/layout checks reuse their captured responses explicitly.

All 36 approved public assets match the prior handoff. Landing/account/giving photos, wordmark/favicon files, account/auth backend, Geoapify limiter, location-quality implementation, PostGIS/HRSA importer, map renderer and security headers remain unchanged. No new shadow library, animation dependency, icon pack, crawler, payment integration or AI agent was added.

Review the [main report](phase-7d2-food-discovery-and-premium-polish.md), [media strategy](phase-7d2-media-asset-strategy.md), and [screenshots/evidence](../../output/phase-7d2-7f/README.md). Production and staging remain unchanged; hosted pilot readiness is not claimed.
