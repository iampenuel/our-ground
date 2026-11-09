# EDEN-06 capacity evidence

Retrieved **2026-11-07**, approximately **15:22–15:30 UTC**, through the owner's explicitly authorized signed-in Google AI Studio usage/rate-limit view. No key was revealed, quota changed, billing enabled or provider request made by inspecting this dashboard. Project/account identifiers and the account email are intentionally omitted here.

## Account observation

The selected **Our Ground – EDEN** project displayed **Free tier**. Its API usage included the configured text model, fixed-phrase TTS model and Gemini 3.8 Live. The owner had independently attested that the configured key belongs to this unbilled project; dashboard inspection is not a separate cryptographic key-to-project binding or legal eligibility finding.

| Model shown by AI Studio | RPM limit displayed | Input TPM limit displayed | RPD limit displayed | Peak values in selected last-1-day view |
| --- | --- | --- | --- | --- |
| Gemini 3.8 Live | Unlimited | 65,000 | Unlimited | 2 RPM; 1,270 TPM; 8 RPD |
| Gemini 3.5 Flash Lite | 15 | 250,000 | 500 | 4 RPM; 3,370 TPM; 7 RPD |
| Gemini 3.8 Flash Lite TTS | 3 | 10,000 | 10 | 3 RPM; 44 TPM; 1 RPD |

These are **displayed account/model limits and peak observations**, not guaranteed capacity or remaining allowance. “Unlimited” is the dashboard's RPM/RPD label, not a promise of unlimited calls, connection capacity, token processing or availability. The selected view is a rolling day/peak comparison, not a verified point-in-time daily balance. AI Studio warns that usage can take **15 minutes** to update.

The TTS row carried a rate-limit warning. In the earlier last-28-days view it showed 13 peak RPD against 10 and 3 RPM against 3; that historical warning does not prove present daily exhaustion. **Fixed-phrase TTS is separate from Aoede output inside the Live connection.** The Live row showed no exceeded displayed token limit. The usage page had historical 429s, but without their exact model/time/response they cannot explain a particular Live interruption. No fixed-phrase TTS test was made to retry that warning.

Active limits are project-scoped, so multiple keys in the same project share them. Google's request-day reset is **midnight Pacific**, distinct from the application's UTC-day counters. A 429/`RESOURCE_EXHAUSTED` signal needs quota details/retry metadata to distinguish a short rate limit from a daily allowance; it must never automatically be reported as “daily quota exhausted.” [Official rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), retrieved 2026-11-07. Current account values remain in [AI Studio's Rate Limit view](https://aistudio.google.com/rate-limit); this report must not be treated as a permanent configured entitlement.

## Three independent boundaries

| Boundary | Verified scope | Reset / expiry / response |
| --- | --- | --- |
| Google model/project capacity | Dashboard values above; configured Live model works only when a genuine request succeeds. Provider error classification keeps 429/rate-or-quota, 503/overload, authentication and invalid-request separate. | Google controls actual limits and availability. No automatic reconnect on quota/auth/invalid-request. No billing or project/key rotation to evade limits. |
| EDEN local admission | Existing adult/US/free-project grant, explicit microphone consent, loopback transport attestation, 15-minute app sessions, five-minute calls, three mints/session and six/day/backend process. Shared local model-attempt budget remains 20/session and 40/day/process. | Current grant expires **21:10:16.879 UTC / 4:10 PM Eastern November 7**. A backend restart does not reset Google or Redis usage. Process counters must not be represented as project totals or used to justify unlimited testing. |
| Our Ground resource resolver | Existing Redis global **100/day** and client **6/minute** admission. Previous actual daily-cap response was `429 RATE_LIMITED` with a bounded Retry-After. | UTC-day reset: **00:00 UTC November 8 / 7 PM Eastern November 7**. Counter/identity/budget unchanged; fresh resource workflows remain blocked until normal availability. |

The new status snapshot exposes only bounded local counts, limits and expiry/reset times to the **attested local owner**. Public, hosted, spoofed and unattested requests omit it. Reading status does not mint, admit, refund, invoke a provider or reveal session identifiers. It explicitly labels its counts `backend-process`.

## Opt-in local indicator

Open a public page using the explicit `eden-review` loopback server with **`?eden-diagnostics=1`**, for example **http://127.0.0.1:5199/?eden-diagnostics=1**. The collapsed **Local call diagnostics** panel appears only with that opt-in in development on an approved public loopback route. It grants no API permission. Ordinary product, private routes, previews, production and non-loopback hosts do not mount it.

The indicator separates provider capacity (unknown to runtime), observed provider errors, local grant/session/token expiry and process usage, and resolver/resource errors with bounded retry timing. **Refresh local capacity** makes only the existing status GET. The Live section shows a nonsecret call reference, model, connection generation, audio context states, counts, tool progress and at most 32 fixed-enum timeline events. It excludes raw speech, transcripts, keys/tokens, resumption handles, arguments, request bodies, provider messages, resident locations and arbitrary URLs. Nothing is persisted or exported automatically.

For one controlled live check, use synthetic requests and wait for **Listening** before each. Stop further real requests if the provider reports rate/quota exhaustion; do not loop, switch keys/projects, reset counters or enable billing. Mocked failure tests consume no project capacity. Fresh actual-call results and the first observable terminal event belong in the EDEN-06 verification report, not an inference from this dashboard.

The subsequent owner-spoken check completed eight model turns on one connection and ended at the five-minute **application** deadline, with no detected provider failure. Final local status showed one Live mint/6 and 15 admission credits/40 in the restarted backend process; these are not Google usage totals. The separate read-only Redis check confirmed 100/100 resolver admissions consumed. See the [actual call trace and limits](eden-06-verification.md).
