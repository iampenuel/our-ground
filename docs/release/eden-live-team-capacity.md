# Protected team voice testing

The `ourground-staging` Preview admits **24 confirmed Live call starts per UTC day**, with **6 per signed tester browser**. A new Eden session in the same browser does not replenish its allowance. This is browser fairness behind the Vercel access gate, not account-level tracking. Text, Read reply and organization permissions use separate controls.

| Server-only Preview setting | Default | Maximum |
|---|---:|---:|
| `EDEN_LIVE_TEAM_STARTS_PER_DAY` | 24 | 48 |
| `EDEN_LIVE_TESTER_STARTS_PER_DAY` | 6 | 12 |
| `EDEN_LIVE_PROVIDER_ATTEMPTS_PER_DAY` | 32 | 60 |
| `EDEN_LIVE_TESTER_ATTEMPTS_PER_DAY` | 8 | 16 |
| `EDEN_LIVE_PROVIDER_SEATS` | 2 | 2 |

Use positive integers; inconsistent or invalid settings disable Live. Eligible testers can inspect effective limits on the protected hosted status endpoint. A signed browser may own one logical call at a time. The team and browser also have short burst limits (8 and 4 admission attempts per minute).

Starts are tentatively held for 90 seconds, then counted exactly once when the browser confirms Google's WebSocket setup. Ending before setup releases the tentative permits; a lost browser cannot consume a permanent daily start. Google mint attempts have a separate budget, including rejected mints and a bounded resume. An issued credential occupies a provider seat until its expiry, even after End Call, because Our Ground cannot revoke it at Google. The UI distinguishes a reserved seat, the daily testing budget and provider quota. The budget limits requests, not guaranteed successful calls.

The hosted duration remains at most **600 seconds**, also bounded by the remaining 900-second signed Eden grant. One eligible reconnect can reuse a safe resume handle, the original logical start and its original deadline; we do not replay outstanding actions. The development-only five-minute policy does not govern this deployment. [Google's session management guide](https://ai.google.dev/gemini-api/docs/live-api/session-management) documents connection rollover, context compression and resumable sessions. Compression alone neither extends our grant nor verifies safe tool/action continuity across multiple connections. **20–30 minute calls are not enabled or verified.**

On November 8 (US Eastern), the [project's AI Studio rate-limit view](https://aistudio.google.com/rate-limit?timeRange=last-1-day&project=gen-lang-client-0351735652) identified Our Ground - EDEN as **Free** and Gemini 3.8 Live as **65K input tokens/min** (displayed peak **2.15K**). RPM displayed **1 / Unlimited** and RPD **10 / Unlimited**. These are dashboard observations, not guaranteed availability. It did not show a concurrent-session allowance. Two provider seats retain the existing ceiling; three is not enabled. The TTS model has separate quota.
