# EDEN-03 verification record

> **Dated engineering evidence, not current product presentation.** The later correction preserves these local Gemini/Aoede observations while restoring the original Our Ground product and integrated assistant. Use [restored-product verification](restored-product.md) for fresh correction results; screenshots and test counts below describe their recorded earlier state.

Date: **2026-11-06**. Node **24.22.1**. Local workspace only; no deployment, paid service activation, billing change or production configuration edit.

## Automated results

| Check | Observed result |
| --- | --- |
| `npm run test:eden` | **49/49 passed** |
| `npm test` | **489/489 passed**; existing authentication, directory, source, location, map, security and adapter regressions included |
| Frontend / backend TypeScript | Both passed, including final SDK `v1beta` configuration |
| `npm run build` | Passed; normal application output |
| `npm run build:eden:assistant` | Passed; isolated synthetic demo output |
| `npm run check:secrets:build` | Passed, zero findings; key value never printed |
| Browser bundle inspection | No Google SDK, server Gemini key/configuration names or Google generation endpoint in application JS assets |

The full suite initially needed an unsandboxed loopback run because its existing synthetic authentication fixture binds a local socket. The approved rerun passed; these tests do not call live AI or production data services.

The final one-line UI improvement also disables the private-session enable button while a session is already active, preventing accidental duplicate session issuance. Both builds/typechecks were rerun after it. The 489-test full run and 49-test EDEN run preceded that UI-only adjustment; no additional action or provider capability was introduced.

Coverage includes complete supported commands, canonical/missing/unknown/ambiguous cities, bounds and unknown fields, extra sensitive clauses, prompt injection, unknown account/donation/application capabilities, malformed/throwing contexts, stale and cancelled actions, isolated event-listener failures, default-deny public/hosted/origin/notice/session gates, account credential isolation, exact model function equality, SDK errors/429, no automatic retries, concurrency/session/global budgets, approved phrase IDs, bounded WAV parsing/stream interruption, mute/stop/disposal, animation states and original artwork integrity.

An installed-SDK serialization test supplies its own fetch implementation that never delegates to the network. It verifies the actual `@google/genai` 3.0.0 request uses the pinned official `v1beta/interactions` endpoint and final bounded generation controls. A mocked 429 produces exactly one transport attempt. Unit tests also prove resource descriptions, arbitrary text, city/location and real-data contexts cannot enter the provider request. The explicit synthetic details scope accepts only fictional records; the default/public path still rejects them.

## Browser and live checks

The normal `/support` page and isolated `/eden-assistant.html` were exercised through the browser. Desktop/default viewport and **390 × 844** mobile layout were inspected. The temporary mobile viewport was reset.

| Scenario | Observed behavior |
| --- | --- |
| Floating entry and panel | Existing app mounts the guide; approved image and clear local-mode label; text controls work independently of provider setup |
| Typed example | `EDEN, find food assistance in Harrisburg.` prepares a canonical action; explicit Apply changes the form, runs existing search functions, loads three labeled fictional records and offline markers |
| Radius/category | 25-mile command updates the actual select; healthcare refinement changes category and fixture records |
| Numbered map selection | Result 2 becomes selected in both the results list and map marker |
| Details | Result 1 opens visibly rendered fictional description/eligibility/cost facts, with no contact, directions, share or report actions |
| Stale action | Changing the category after a proposal makes Apply return “The page changed”; previous selection remains |
| Synthetic sensitive input | A mock insurance clause receives fixed local rejection; original input clears, is absent from assistant DOM and yields no action |
| Eligibility | Both acknowledgment checkboxes remain insufficient when the server reports disabled; no public bypass |
| Keyboard | Enter reviews, Escape closes, focus returns to the entry button, keyboard activation reopens with composer focus |
| Reduced motion | Accessible user control is operable; state-controller tests confirm amplitude suppression and reduced-motion behavior |
| Public security fallback | Normal page renders SVG (`svg: true`, `canvas: false`); no browser errors observed; normal CSP remains unchanged |

After implementation, the owner supplied a local key and explicitly confirmed **over 18, United States, unbilled free-tier project, private local synthetic testing only**. These are operator attestations, not an independent account/billing or legal audit. Runtime flags were enabled temporarily in the loopback API process; `.env.local` mode flags were not changed by the agent.

- **Two live Gemini text proposals succeeded**, including the final pinned API version and bounded thinking settings. The UI showed **EDEN · GEMINI CHECKED** only after the server received and validated the exact permitted function call. Apply then used the ordinary application adapter and synthetic resource transport.
- **Three fixed-phrase Aoede playbacks succeeded** across the controlled test sessions. The browser visibly entered **Speaking**, then returned to idle. A final live **Stop** interrupted playback and removed the Stop control. No microphone or raw input was used.
- One intervening speech attempt returned the generic unavailable fallback; its exact server/provider cause was not captured, so it is not attributed to a specific quota. Text remained usable and no provider error/body/key was exposed. Injected tests separately verify quota and rate-limit behavior.
- Google received finite city-free action/context parameters for text and a literal allowlisted public sentence for speech. Resource records, resident narratives, precise locations, conversation history and microphone audio were not sent.

![Live synthetic Gemini-checked page action](eden-03-live-demo.jpg)

The screenshot records the authorized private synthetic session. It is not evidence that public Gemini is enabled. After testing, the temporary API process was stopped and restarted with default disabled configuration; the browser's final status was checked again. The local resource demonstration remains usable without AI. The credential stays in the owner's ignored local environment file; no key or raw audio artifact was saved in these deliverables.

## Limits of the evidence

This is not a penetration test, accessibility certification, legal opinion, account-billing audit, resource-license certification or hosted infrastructure inspection. Full assistive-technology/zoom testing, deployment logs, distributed rate limits, actual public audience/geographic enforcement, vendor agreements, incident/deletion operations and resource rights remain release work. Builds retain existing large-chunk warnings for map/legacy-demo assets. Voice animation follows measured output amplitude, not phonemes; EDEN-01 rig and Rive watermark limitations remain.

Public Gemini remains **NO-GO**. See [implementation and release criteria](../eden-03-assistant.md) and [dated official provider evidence](../eden-03-provider-evidence.md).
