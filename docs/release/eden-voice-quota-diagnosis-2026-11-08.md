# Eden voice quota diagnosis · November 8, 2026

**The first HTTP 429 cannot be classified retrospectively.** Its response body and Retry-After were not retained, and the hosted minute counters expired. The staging daily speech counter was 3/10 after that failure, which excludes that particular application daily ceiling. One deliberately spaced retry with the same authorized key, model and Aoede succeeded. No further synthesis was requested for this diagnosis.

**Google's dashboard now establishes a separate project limit.** Read-only signed-in Chrome inspection matched the masked key suffix to the authorized local Our Ground key and identified **Our Ground – EDEN**, project `gen-lang-client-0351735652`, **Free tier**. The authorized recovery-branch secret was provisioned from that local key. Vercel does not return its sensitive Preview plaintext in an environment pull; no new extraction or direct runtime-key comparison is claimed. [Sanitized dashboard receipt](eden-live-action-evidence/provider-quota-dashboard.json).

## Effective provider quota and observed usage

| Correct model: `gemini-3.8-flash-lite-tts` | Observed project peak, last day | Displayed effective limit |
|---|---:|---:|
| Requests/minute | 2 | 3 |
| Input tokens/minute | 54 | 10,000 |
| Requests/day | 12 | 10 |

The AI Studio Usage chart was independently expanded from November 8 midnight through 13:00 UTC-8: its hourly TTS request values total **12**, matching the daily peak. The rate-limit warning was visible. Usage can lag by 15 minutes. These are project API request observations, not a count of successful audio generations, and not an error payload identifying which quota rejected the first staging request. [Project rate limits](https://aistudio.google.com/rate-limit?timeRange=last-1-day&project=gen-lang-client-0351735652) · [Project usage](https://aistudio.google.com/usage?timeRange=last-1-day&project=gen-lang-client-0351735652).

Google applies quotas per project rather than per API key; its daily request window resets at midnight Pacific. Local development and other use of this project can therefore consume provider quota without appearing in the staging Redis bucket. Our Ground's application day is UTC, a further reason its counter cannot represent Google's current remaining allowance. Specified capacity is not guaranteed. [Google rate-limit documentation](https://ai.google.dev/gemini-api/docs/rate-limits).

The actual successful staging request used **POST `https://generativelanguage.googleapis.com/v1beta/interactions`**, `gemini-3.8-flash-lite-tts`, Aoede, exact server-approved response text, `store:false`, automatic continuation disabled and SDK retries disabled. The provider did not echo a distinct model revision. The 9.32-second playable WAV, text digest, nonsilent PCM and advancing browser playhead are recorded in [the successful receipt](eden-live-action-evidence/staging-speech.json). Replay/stop/minimize used that same clip without generating more speech.

For the **original rejection**, provider error code/status, quota metric/identifier/effective value and retry delay remain **unavailable**, as does conclusive attribution between Google and a hosted minute admission denial. Current daily pressure is verified; attributing the original event to a Google bug, a specific daily quota or the local development limiter would exceed the retained evidence. The reported developer-forum incidents are not evidence about this project's original response.

## Application controls and accounting

| Path | Actual scope and limits | Meaning |
|---|---|---|
| Hosted `/api/v1/eden/hosted/speech` | Redis: 2 speech attempts/minute per signed session; 3/minute shared project bucket; 10/day shared staging bucket | Abuse/budget admission, separate from Google. Tickets are single-use, expire after 60 seconds and bind one verified displayed answer. |
| Hosted text planning | Redis: 8/minute per session; 12/minute shared; 150/day shared | Separate text budget. A speech denial does not prevent text planning, public actions or cursor operation. |
| Synthetic development speech | `speechPerSession:6`, `speechPerDay:12`, process-local development admission | Does not control the hosted route, whose synthetic-development mode remains disabled. |
| Local experimental Live | 300-second call ceiling, 3 mints/session, 6/day, call lease and recovery limits | A persistent-call control; not a count of unary TTS replies. Hosted raw audio and Live tokens remain disabled. |

The hosted project/day buckets are deliberately **shared across visitors**; the session bucket is bound to its signed adult/notice session. They are not per-person provider balances. Admission reserves capacity sequentially before a provider attempt. A later bucket denial can consume an earlier attempt reservation, and failed Google requests retain their admitted attempt. These are conservative abuse/attempt counters, not success-only billing measurements. They have not been reset, refunded, increased or removed; automatic refunding would weaken protection during a provider outage.

The speech adapter issues one provider operation with retries and continuation disabled. The client now memoizes one pending or completed attempt per displayed answer, including a rejected one-use ticket, so concurrent clicks or replay cannot cause duplicate synthesis. Cached successful playback still works during a subsequent quota cooldown. Automated regression tests use controlled provider/transport fixtures and do not consume real TTS. The retained live verification contains the failed first request and one spaced successful retry; additional historical project usage cannot be attributed to that test without corresponding request evidence.

## Compatible fixes delivered

- Keep canonical HTTP status and bounded, allowlisted quota metadata through the server and speech client. Classify **Google** separately from **Our Ground admission**; daily, short-window, zero allowance and unspecified are distinct. Do not log raw SDK exceptions, request text, error subjects/dimensions, headers or credentials.
- Preserve provider Retry-After/RetryInfo where supplied; return the exact application bucket and reset delay for a hosted admission denial. A cooldown is a lower bound, not an automatic retry timer. A failed single-use ticket is never retried.
- Daily and zero-allowance messages explain the limit rather than claiming a momentary busy service. Unknown categories remain unknown. Aoede synthesis, invalid audio, playback, expired ticket and session failures have different recovery messages.
- Keep text conversation and authorized page actions available. A user may explicitly choose a labeled installed device voice in Privacy & voice; there is no silent voice substitution.
- Label the hosted microphone **Dictate**, changing to **Cancel** during capture. Explain the editable on-device draft separately from **Read reply**. Do not misrepresent dictation as persistent Live conversation.

## SEMA comparison and continuous voice decision

[The source-pinned SEMA comparison](eden-sema-voice-comparison-2026-11-08.md) inspected all six requested files read-only. SEMA's ten-minute session and Kore/3.1 preview default are not a TTS-per-reply quota. Its actual UI hook uses a separate custom WebSocket client: the adjacent SDK builder's compression and input-transcription settings are not all sent by that client, and the inspected hook observes resumption notices without reconnecting. Source defaults do not establish SEMA's deployed entitlement.

Google currently recommends standard **`gemini-3.8-live`** for low-latency voice. Standard 3.8 does not accept SEMA's `thinkingLevel`; it must be omitted. Its tool behavior must be selected deliberately rather than assuming the older preview's timing. Eden's separate local experiment already uses 3.8/Aoede, constrained short-lived credentials, generation-aware lifecycle and server-authorized tools. [Current model](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live) · [Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities).

AI Studio lists **`gemini-3.8-live`** for this free project: requests/minute and requests/day display “Unlimited,” while input tokens/minute is **65,000**; current last-day usage displays zero. A concurrency entitlement was not exposed by the inspected table. Google's pricing page lists free-tier Live access and provider use of free-tier data for product improvement. This supports a technically plausible bounded pilot within the current tier, not a promise of unlimited voice or a tested public feature. [Pricing](https://ai.google.dev/gemini-api/docs/pricing/).

**Hosted Talk to Eden remains BLOCKED for release acceptance.** It needs explicit raw-audio consent/privacy handling, durable shared call leases and admission, a reviewed constrained WebSocket policy and real hosted lifecycle, permission, recovery and tool tests. No model migration, new paid resource, billing change, key rotation, permission expansion, security relaxation or Live enablement was performed during this build. Preserve Read reply; implement and verify the distinct continuous mode as a separately reviewable change.
