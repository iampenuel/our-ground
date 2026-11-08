# Google Maps and Gemini — selected-provider plan

28 October 2026. **PROPOSED architecture only.** The owner has selected Google Maps and Gemini. This supersedes Phase 5's recommendation to retain Mapbox as the longer-term provider; it does not change the currently running implementation.

**IMPLEMENTED today:** Mapbox integration code, existing Google Maps directions URLs, PostgreSQL/PostGIS repository, Supabase auth and the explicitly fictional local demo. **TESTED this phase:** demo/list/fallback behavior and existing contracts, not live provider integrations. **BLOCKED:** Google Maps/Gemini implementation, provider configuration, billing, live calls and deployment await later approval. No packages, credentials, endpoints, schema changes or provider switches were added here.

## Six separate mapping responsibilities

| Concern | Current implementation | Proposed Google transition |
|---|---|---|
| 1. City/ZIP geocoding | `backend/runtime.ts` resolves Mapbox geocoding into `label`, `city`, `state`, `latitude`, `longitude`; explicit demo mode resolves the documented Harrisburg/Philadelphia fixtures. | Server-side Google Geocoding behind the same `GET /api/v1/places/resolve?q=...` contract. Validate country US and state PA, result type and coordinates. Ask for a clearer location when ambiguous; do not silently use the wrong city. |
| 2. Interactive rendering | `src/resource-map.ts` conditionally loads Mapbox GL, with list-first/unavailable behavior. | Google Maps JavaScript API loaded only when a map is needed. Preserve the map wrapper's lifecycle and fallback contract. No homepage map SDK or new decorative map animation. |
| 3. Service markers | Current results supply directory IDs and coordinates; markers link to actual resource pages. | Advanced markers built only from eligible returned directory records. Keep accessible labels, keyboard activation, focus/list relationship and safe text rendering. No Google Places provider substitution. |
| 4. Geographic directory search | `backend/postgres.ts`: PostGIS geography, parameterized `ST_DWithin`, distance ordering, category/keyword/pagination/publication/demo filtering. | Retain it unchanged. Google supplies the user's search center; PostGIS matches Our Ground's own directory. A basemap does not authorize, verify or discover directory records. |
| 5. External directions | Existing safe Google Maps URL with `api=1`; fictional records have directions disabled. | Keep it. Maps URLs require no API key. Offer transport mode only when chosen by the user; do not claim a route is accessible or a service is available. |
| 6. Optional travel-time/routing | Not implemented; shown distances are straight-line estimates. | A separate later Routes API scope, consent and cost budget. Specify travel mode, requested fields, coverage and departure assumptions. Never interpret straight-line distance as walking/transit time or assume transit accessibility. |

Google's [geocoding response documentation](https://developers.google.com/maps/documentation/geocoding/guides-v3/requests-geocoding) supplies geometry/address components, not Our Ground service eligibility. [Advanced markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview) support keyboard-accessible interaction and require a map ID. [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) handle external directions without a key. [Routes API](https://developers.google.com/maps/documentation/routes/compute-route-over) is a distinct request/response and billing integration.

### Configuration, storage and operating boundaries

**PROPOSED names, not existing configuration:**

| Name | Scope / restriction |
|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Intentionally public browser key. Restrict to Maps JavaScript API and exact approved HTTP referrer origins, including separate localhost testing origins. Never use the server geocoding key here. |
| `VITE_GOOGLE_MAPS_MAP_ID` | Public map ID for the approved map configuration/advanced markers. No styling changes are approved by this plan alone. |
| `GOOGLE_GEOCODING_API_KEY` | Server-only credential restricted to the selected Geocoding API. Never return it, provider URLs containing it, or raw credential-bearing errors to clients/logs. |

After approval, enable only Maps JavaScript API and Geocoding API on the intended project; advanced markers need the approved map ID. Do not enable Places or Routes merely to show our records. Establish billing ownership, usage quotas, alerts and an owner-approved spend ceiling before live testing. Provider quotas and an application-level limiter are needed; budget alerts alone do not guarantee a hard stop. Do not assume historic free credits remain applicable. [Geocoding billing/quota documentation](https://developers.google.com/maps/documentation/geocoding/usage-and-billing).

Use distinct browser/server keys and separate development/production scopes. Browser keys cannot be hidden in downloaded JavaScript; API and referrer restrictions are essential. Server web-service credentials should have API restrictions and supported application restrictions. With dynamic hosting egress, do not invent a stable Vercel IP allowlist: confirm a compatible secure egress/proxy or supported server authentication strategy before enabling the credential. This is an implementation decision requiring approval, not a reason to weaken restrictions. [Google Maps security guidance](https://developers.google.com/maps/api-security-best-practices).

Keep Google's visible map/third-party attribution. The geocoding policy restricts caching/storage, permits indefinite storage of place IDs, and requires Google-map display for geocoding results plotted on a map; results shown without a map need appropriate Google attribution. Public terms/privacy pages also need review. **Do not persist raw geocoder payloads or derived Google coordinates into directory records, analytics or durable caches by default.** Use the resolved search center transiently; review applicable terms before defining any cache/retention scheme. Our existing independently sourced PostGIS records remain our directory, with their own provenance. [Geocoding policies](https://developers.google.com/maps/documentation/geocoding/policies).

### Low-risk migration sequence — PROPOSED

1. Freeze the existing location/search/detail contracts and fixtures. Record current list, detail, map failure, keyboard and responsive behavior. Do not combine this work with design changes or a database migration.
2. Implement a narrow server geocoder adapter and a Google renderer behind an explicit provider selection, retaining the existing API response shape. Add provider-error, ambiguous/out-of-PA, quota and timeout cases. Keep fixture-only demo resolution deterministic.
3. In an approved test environment, switch the geocoder and displayed basemap together. Do not show Google-geocoded points on a Mapbox map. A failed Google load should retain the usable list/fallback, not silently load a competing provider.
4. Load only one renderer per page. Use Google's documented dynamic library import for maps/markers; reserve dimensions before loading, clean up listeners/markers on route exit and avoid duplicate SDK loads. [Loading guidance](https://developers.google.com/maps/documentation/javascript/load-maps-js-api). Measure actual transferred bytes, startup/render latency and marker interaction on desktop/mobile; do not promise Google is faster without those tests.
5. Verify list/map result identity, pagination, detail links, marker keyboard controls, reduced-motion behavior, attribution and provider failure recovery. Check that no Places results appear as verified providers and no fictional contact/directions become enabled.
6. After approval of the Google rollout, remove the unused Mapbox dependency, browser loader/styles and credentials in a separate reviewed cleanup. Roll back the provider pair together if needed. Do not ship both active basemaps as an automatic fallback.

No part of this switch is implemented in Phase 6A. Current missing map credentials remain an honest map-unavailable state.

## Gemini: grounded resource assistant

Use the supported official JavaScript/TypeScript **`@google/genai`** package in a later server implementation; do not use the legacy `@google/generative-ai` client. The official Google GenAI SDK is maintained for production use. No SDK was installed now. [Gemini overview](https://ai.google.dev/gemini-api/docs), [official libraries](https://ai.google.dev/gemini-api/docs/libraries).

Keep PostgreSQL/PostGIS retrieval and Supabase authentication. Gemini interprets a request and helps present retrieved options; it is not the directory, a medical professional, eligibility authority, editor or payment processor. The normal search UI remains available before, during and after every assistant failure.

### Proposed endpoint and flow

Add `POST /api/v1/resource-assistant` within the existing `handleApi` routing boundary, delegating to a small new server module such as `backend/resource-assistant.ts`. The existing Vercel adapter could forward POST without a second host. No endpoint or module was created in this phase.

1. Validate size/content type, request shape, rate limit and feature enablement before provider work. Reject arbitrary client instructions, URLs, record payloads or model names outside the defined request fields.
2. Send only a minimized request to Gemini for **structured intent extraction**. The user message is untrusted data. Extract supported categories, city/ZIP, radius and transport constraint. A model-produced location is not a verified coordinate; resolve it through the server geocoder. Ask a clarification question for ambiguity or missing location.
3. Validate category, PA bounds, radius and search arguments on the server. Query the existing repository using bound parameters, publication/demo rules and deterministic page limits. Do not let the model write SQL, expand permissions or query unrestricted records.
4. If there are no eligible records, return a truthful empty result and ordinary search link. Do not fill gaps with model memory, web search or Places listings.
5. Send at most five eligible records' allowlisted public facts for an optional second structured selection/explanation step. Exclude account IDs, access tokens, reports, membership information, staff drafts and private contact data. Treat even public provider text as untrusted content.
6. Validate every returned ID against that request's eligible retrieval set and validate every explanation code against available source fields. Build titles, facts, attribution, contact links and `/resources/:id` links on the server from retrieved records. Use plain-text rendering. Return the standard search fallback alongside results.

For “food assistance near Harrisburg, no car,” search food records around the validated Harrisburg center. Preserve `no_car` as a constraint. The current directory does not establish transport accessibility/travel time, so the answer must explicitly say transportation suitability is unconfirmed. Do not invent a bus route, walkability, pickup service, appointment, open-now status or guarantee of food availability.

### Request and response contract — PROPOSED, not live

```ts
type AssistantRequest = {
  message: string;                 // trimmed, 1–1000 characters
  location?: string;               // city/ZIP only, max 100 characters
  category?: 'food' | 'healthcare';
  radius_miles?: number;           // finite 1–50, default 25
  client_request_id?: string;      // UUID, for bounded deduplication
};

type AssistantResponse = {
  status: 'results' | 'clarify' | 'no_results' | 'unavailable';
  search: {
    location: string | null;
    category: 'food' | 'healthcare' | null;
    radius_miles: number;
    transport: 'no_car' | 'unspecified';
  };
  clarification: 'location_required' | 'location_ambiguous' |
    'unsupported_area' | 'unsupported_need' | null;
  resources: Array<{
    id: string;                   // UUID from this retrieval set only
    title: string;                // server copies from record
    href: string;                 // server constructs internal detail path
    data_kind: 'fictional_demo' | 'sourced_unverified';
    source_recorded_at: string | null;
    reasons: Array<'category_match' | 'within_search_radius'>;
    facts: Array<{
      field: 'summary' | 'hours' | 'eligibility' | 'cost';
      text: string;               // server formats source value, not model invention
    }>;
    unknowns: Array<'transportation' | 'current_availability' |
      'eligibility_confirmation' | 'hours_not_provided'>;
  }>;
  fallback_url: string;            // server-generated local /support URL
};
```

Initial limits: JSON body at most 4 KiB, reject additional fields, maximum five resources, finite bounded numbers, UUID validation, bounded arrays/text, allowed status/enum values and nullable missing facts. Define a corresponding JSON Schema using the provider-supported subset and a separate authoritative server validator. Structured output constrains shape; it does not establish truth. [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).

The model's internal explanation response should contain **only eligible IDs and reason codes**, not the server-only title/href/fact text shown above. Server templates turn supported facts/reasons into readable sentences. This deliberately limits the first version's unsupported prose. Merely checking an ID would not make a free-form claim about its hours, eligibility or transportation safe. Any later generative prose needs claim-level evidence checks and separate evaluation; it must not bypass the deterministic factual display.

Return 400/422 for invalid requests, 429 with bounded retry guidance for throttling, and 503 for disabled/provider-unavailable operation. Empty retrieval and clarification are successful structured outcomes, not server errors. Use `no-store`; never expose provider stack traces or key-bearing URLs. UI errors must retain entered conventional search filters.

### Grounding, injection and permission boundaries

- Separate fixed system policy, user intent and retrieved facts. Delimit and bound all untrusted fields; strip markup/control content before presentation. Do not treat a provider description saying “ignore prior instructions” as instructions.
- Give Gemini no arbitrary URL fetch, web/Places search, file access, database credentials, write tool or donation function. Retrieval is a fixed server operation, not open-ended model tool execution.
- Allowlist IDs **and fields** from the current eligible result snapshot. Recheck publication/access eligibility before returning if the flow spans updates. A model may not add a source, widen radius silently or turn a missing field into a fact.
- Preserve `fictional_demo` labels and contact/directions suppression end to end. A sourced record remains `sourced_unverified`; source timestamp is not a verification or availability guarantee.
- No diagnosis/medical triage, benefit eligibility decision, promise of service, resource-update approval, donation processing or access-role changes. Out-of-scope prompts receive fixed scope guidance and a conventional directory entry point, not model-generated medical recommendations.
- Assistant access does not alter Supabase roles. If anonymous access is offered, it needs abuse controls independent of staff authorization. Never create a service-role browser path for AI convenience.

### Reliability, rates, costs and deployment

**Proposed starting limits for approval/evaluation, not observed production limits:** at most two model calls per request; at most five records and roughly 8,000 input tokens total; at most 800 generated tokens per call; 5 requests/minute per anonymous session with a secondary privacy-preserving IP bucket, 30 requests/day per session; cap simultaneous work and enforce a separate project-wide daily budget. These values must be tuned against the selected model and actual users, not treated as an entitlement or an SLA.

Use a shared server-side limiter/deduplication store or supported platform control across function instances. In-memory per-function counters are insufficient for a public cost ceiling. That may require a separately approved service; no resource was provisioned here. Provider quotas apply at project level and vary by model/tier; inspect actual approved limits before launch. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

Set a proposed overall assistant deadline of 20 seconds, with bounded individual calls and retrieval and cancellation when no longer needed; validate it against the configured function duration. Do not stack two independent 20-second model timeouts. On timeout, quota exhaustion, malformed/ungrounded output or provider refusal, discard partial unsafe output and return ordinary search. Initially use no automatic model retries, no speculative background calls and no streaming of unvalidated facts. Record durations, status, token counts and estimated spend without message bodies. A kill switch must work without rebuilding the frontend.

Future server-only variables: **`GEMINI_API_KEY`**, `GEMINI_MODEL` (a deliberately selected supported stable model), `RESOURCE_ASSISTANT_ENABLED` (default false). These are proposed names, not configured code. Never create `VITE_GEMINI_API_KEY`. Add explicit boundary tests for Google/Gemini private names before implementation; current prefix heuristics are not sufficient for every possible key name.

Use an owner-approved Gemini project/key and minimal permissions; keep preview/production budgets and environments separate. Follow the current key type/restriction requirements rather than copying old unrestricted-key examples. [Gemini key guidance](https://ai.google.dev/gemini-api/docs/api-key). Do not send credentials to the model, return them to the browser or add them to logs/Git. No model/version or live provider account has been validated yet.

### Privacy and evaluation gates

Minimize collection to city/ZIP and the stated assistance need. Do not request precise home address, medical history, income, government ID or account data. Do not forward IP/session identifiers to Gemini. Warn users before submitting free text to an AI service and explain the optional nature of the feature. Avoid transcript persistence and raw query logging; define any retention/deletion controls before launch. Redaction is useful but cannot guarantee that free text contains no sensitive information.

Google's current Gemini terms distinguish unpaid and paid data treatment: unpaid use can involve product improvement/human review and must not receive sensitive personal data; paid processing still has limited safety/security retention. The terms also restrict clients directed toward or likely accessed by under-18s and prohibit medical-advice/clinical uses. **Owner privacy/terms review and an appropriate audience/access design are prerequisites**, especially for a general community-support site. This plan does not assume that a public all-ages assistant or unpaid processing of residents' needs is permissible. [Current Gemini terms](https://ai.google.dev/gemini-api/terms).

Before any public assistant, run deterministic fixtures and adversarial evaluations for:

| Test family | Required outcome |
|---|---|
| Harrisburg food + no car | Real retrieved IDs only; transportation uncertainty explicit; no fabricated routes. |
| Missing/ambiguous/out-of-PA location; unsupported category | Clarification/scope limit; no silent wrong-city search. |
| Empty results; missing hours/cost/eligibility; stale sources | Honest absence/uncertainty, no invented providers or open-now claims. |
| Fictional, hidden, removed or unauthorized records | Eligible IDs only, labels retained, no contact leakage or draft exposure. |
| Prompt injection in user text or provider description | No policy/tool/role changes, exfiltration, arbitrary fetch or writes. |
| Forged IDs/URLs, extra JSON fields, malformed output | Server rejects and falls back; safe text rendering. |
| Medical diagnosis, eligibility approval, donations, edit approval | Fixed scope boundary; no consequential action. |
| Provider 429/5xx/refusal/timeout; simultaneous requests | Bounded time/cost, useful fallback, no unvalidated partial answer. |
| PII entered in free text; logs/error traces | No unauthorized disclosure; retention/consent policy enforced. |
| Keyboard/screen reader, reduced motion, mobile | Clear status and navigable links, stable focus, conventional search always usable. |

Start with synthetic fixtures and stubbed model outputs; after approval add a bounded live evaluation using only approved non-sensitive inputs. Track unsupported-claim and invalid-reference counts as release blockers, plus clarification accuracy, task completion, latency and cost. Require zero accepted invented/unauthorized records in the release suite. Re-evaluate after prompt/model/schema changes. Passing a finite suite does not prove all future generated text safe.

## Owner actions and sequence

First approve and verify the current Vercel presentation deployment independently of these future integrations. Next authorize the paired Google geocoder/map migration, project/billing/key restrictions, storage/attribution rules and test plan. Then resolve Gemini audience/privacy terms, choose the model/budget/rate-control mechanism and authorize server-only implementation and evaluation. Keep conventional directory search and existing permissions throughout. Phase 6A stops at this plan and the verified local preview.
