# Eden recovery candidate · November 8, 2026

The working checkout started at `04fbdeb` on `codex/national-release-candidate`. Vercel's production project identified deployment `dpl_5BLDMWteSXZ8ju8VVcfXttiUQBiq`; GitHub PR #2 and the release evidence identify its source as `33574bd`. The recovery branch fast-forwarded to `304036a`, which adds the reviewed About copy on top of that deployed code. The separate `ourground-staging` project has deployment protection. No production cutover is part of this work.

| Reported failure | Root cause in deployed source | Change under review |
|---|---|---|
| Little room to chat | `src/eden/hosted-assistant.ts` added two always-visible privacy notices alongside a fixed composer and consent. The recording shows most of the conversation clipped. | One flexible transcript, one short caution, settings on demand and separate age/privacy acknowledgment on first use. |
| Directory entry blocked | `backend/adult-access.ts` gated all documents and APIs, including ordinary searches. The prior release explicitly approved a sitewide adult demo. | Scope the preview policy to Eden and private reports. Preserve the original production policy. Browser-bound, signed age decision; independent versioned Gemini consent. |
| Gemini seems off | `backend/eden-hosted.ts` admitted production only. `src/eden/hosted-assistant.ts` discarded unrecognized phrases before calling Gemini. | Permit only the designated protected preview with complete operator configuration; use model inference over bounded public concepts, validate model proposals, confirm the real action and distinguish unavailable AI from local navigation. |
| Page actions missing | The existing bridge tracked searches but lacked a route-aware registry for visible controls, scrolling and focus. | Registered public actions resolve fixed component IDs and check live browser state. No selectors, URLs, JavaScript or private form data from a model. |
| Voice unreliable | Hosted voice auto-submitted recognized commands in a listening loop. Recognition and output selection were not consistently cancellable. | Separate explicit local dictation, editable draft and user-triggered playback; cancel pending audio and load device voices asynchronously. |
| Similar audience paths / missing login | Donor and organization pages funneled primary actions into resident search; the adult middleware returned 404 on account/callback routes before auth ran. | Distinct donor opportunities and organization account entry; preserve PKCE, exact-origin restrictions, backend membership checks and database permissions. |
| Geographic diagnostics crowd search | `src/location-combobox.ts` repeated provider/coordinate explanations for each suggestion, after selection and in the status announcement. | Keep the match and uncertainty visible; place provenance in keyboard-operable disclosures; retain attribution and Enter submission. |

Inspected SEMA's session reducer, tool schema/permission checks and live session patterns. Reused the separation of proposed actions, validated execution and confirmed results without importing its teleprompter, audio or credentials.

The character introduction and cursor animation are out of scope.
