# EDEN-02 — AI provider decision

> **EDEN-03 update, 2026-11-06:** The owner now specifies an adult-focused competition/portfolio prototype, Gemini free tier and Aoede only. The EDEN-02 findings below retain their original mixed-age scope. Current implementation, implemented controls, test evidence and remaining public NO-GO criteria are in [EDEN-03 assistant](eden-03-assistant.md) and [current provider evidence](eden-03-provider-evidence.md). The historical OpenAI/Azure evaluation paths are not implementation choices for EDEN-03. No public eligibility or legal compliance is certified.

Decision/retrieval date: **2026-11-06 (America/New_York)**. Owner decision record for architecture review; no provider contract, billing, deployment, model call or live speech service was activated by this audit.

## Recommendation

**Gemini Developer API: NO-GO for Our Ground's intended public audience, which may include under-18s.** The restriction concerns the API client audience, not just the age of the developer or whether the prompt contains a name. Paid access, a server proxy, a consent checkbox, redaction, a different voice or a blanket “18+” notice do not establish an exception.

**Google Cloud managed Gemini: also NO-GO for this audience under the retrieved standard generative-AI terms unless an applicable written exception/amendment is obtained.** Moving from Developer API to a Cloud project is not sufficient evidence of eligibility. Firebase wrappers or another model sold under a host's agreement do not automatically remove that host's restrictions.

Build the universal EDEN experience around deterministic public-resource navigation and the existing Rive state interface. Preserve equal public-resource access without AI, login, microphone, age disclosure or payment. Evaluate **OpenAI's business API first as a conditional option**, because it publishes an explicit minors-serving path; evaluate Microsoft Azure's models and speech in parallel only after its applicable contract/audience terms are confirmed. Neither is approved for real users by this audit. If age/consent and retention conditions cannot be met accessibly, keep the assistant provider-free and evaluate a controlled local model separately.

## Eligibility and data comparison

The citations below point to the official source register; **every source was retrieved on 2026-11-06** unless specifically marked retrieval-blocked. Product marketing, consumer chatbot access and a consumer's account age are not substitutes for business/API terms.

| Option | Public/mixed-age eligibility | Personal/sensitive data, improvement, retention/review | Decision for Our Ground |
| --- | --- | --- | --- |
| Deterministic public navigation | No AI-provider audience condition; application privacy/child laws still need review | No external model/STT/TTS disclosure. Existing search/maps/hosting flows remain and must be disclosed | **Recommended universal foundation; GO for synthetic local prototype.** Public release remains separately gated. |
| Gemini Developer API, unpaid | G1 restricts API clients directed at or likely accessed by under-18s; professional/business developer use; region limits | Inputs/outputs can support product/ML improvement and human review; personal, sensitive and confidential information must not be submitted. EEA/Swiss/UK data-use exception and paid-client rule require care (G1) | **NO-GO** for mixed-age site and real resident conversations. Adult synthetic experiments would still need a separate authorized purpose. |
| Gemini Developer API, paid | Same audience/clinical restrictions; paid status does not amend them (G1) | No product-improvement use of prompts/responses; processor DPA, but content is logged for safety/legal purposes (G1/G3). Abuse policy specifies 55 days for prompts/context/output and possible authorized human review (G2) | **NO-GO** for intended audience. No evidence of a Developer API BAA covering this use. |
| Google Cloud managed Gemini / Vertex AI, now documented under Gemini Enterprise Agent Platform | Standard Cloud generative-AI terms also restrict services likely accessed by under-18s; non-clinical navigation differs from prohibited clinical/substitute-medical-advice uses (G4) | No training/fine-tuning without permission; Cloud DPA/BAA scope must be established (G4/G5/G7). Abuse/caching/grounding/Live and advanced-model retention are feature-specific (G6) | **NO-GO under retrieved standard age terms.** Enterprise privacy features do not cure audience eligibility. |
| OpenAI business API | Customer applications/end users permitted; Services Agreement requires parental/guardian consent for minors (O1). Under-18 guidance adds youth safeguards and ZDR before processing under-13/applicable-digital-consent-age personal data (O2) | No training by default. Default abuse logs may retain content up to 30 days with exceptions; approved ZDR, stateful features, caching and safety-retention modes differ (O3). DPA available; PHI needs separately executed Healthcare Addendum/eligible configuration (O1/O4) | **Conditional evaluation candidate; live NO-GO today.** Unknown-age users cannot simply be assumed eligible. Parent consent, exact ZDR/endpoint/model eligibility and accessible operation need proof. |
| Azure OpenAI / Foundry **models sold by Azure** | Public applications are a candidate use, but exact agreement, minors/consent rules and use case are **unresolved**. Current Product Terms page retrieval timed out (M4); absence of a retrieved ban is not permission | No foundation-model training/product improvement without permission; stateful features can store history; geography depends on deployment type (M1). Flagged content can receive human review; modified monitoring requires approval (M2) | **Conditional procurement/legal evaluation; live NO-GO today.** These assurances must not be generalized to every marketplace model or consumer Copilot. |
| Azure real-time STT + prebuilt TTS, separately from the language model | Requires a separate audience/recording/processor approval; does not establish LLM eligibility (M4–M6) | Real-time STT documented as server-memory processing without at-rest audio storage; real-time prebuilt TTS input/output not retained. Batch/custom voice/avatar workflows have different storage (M5/M6) | **Speech evaluation candidate only.** No microphone or live speech now; no assumption Aoede exists on Azure. |
| Locally controlled model/on-device speech | Model license, distribution, child safety and actual device behavior unverified | Could reduce third-party inference disclosure but transfers hosting, logging, safety, patching and capacity responsibility to Our Ground | **Architecture fallback to investigate**, not an approved model or a claim of zero cost/privacy by default. |

### Gemini Live and Aoede

Live is a separate real-time audio interaction path; its current Developer documentation identifies it as preview (G8). Aoede is an available prebuilt voice option in Google's voice documentation (G9/G10), not a separate privacy contract or entitlement. Audio captures personal and bystander information before textual redaction; use of a native-audio model does not make that harmless. Keep voice identity an adapter preference, not a reason to select an ineligible provider.

The retrieved Cloud governance page describes optional Live session resumption retaining text/audio/video and outputs up to 24 hours. It also describes caching and advanced-model exceptions; some features cannot provide ZDR. Disable resumption, grounding and durable/stateful features in any future candidate design pending an exact feature matrix (G6). Preview features may have different data-processing/assurance terms; obtain product-specific written evidence instead of importing general Cloud assurances (G4).

### Training, retention and deletion are different questions

“No training” must never become the notice “nothing is stored or reviewed.” An Our Ground Clear button only removes the application's current buffers; it cannot withdraw already transmitted data. Providers may separately keep application state, abuse/security logs, caches, legal holds and operational metadata. Feedback/opt-in sharing, grounding, files, conversations, batch jobs, preview models and support/debug modes are excluded from the initial architecture.

For OpenAI evaluation, `store:false` is a proposed application setting, **not** an abuse-log opt-out or proof of ZDR. O3 describes approval requirements, feature limitations and distinct Private Safety Processing/Private Retention/Safety Retention behaviors, including model/customer exceptions. In-memory/extended caching must also be checked. Do not promise strict ZDR from a generic sales label; verify the exact organization/project/model/endpoint and any safety-retention notices. Audio transcription, speech output and real-time sessions have different endpoint rows. Our Ground has no demonstrated ZDR entitlement or Healthcare Addendum.

Azure's current abuse-monitoring document distinguishes automated review from possible human review and approved modified monitoring (M2). Do not copy an older generic “30 days” figure into the contract record: the exact selected service/configuration retention and exceptions remain procurement questions. Google Developer's documented 55-day safety window does not establish an upper bound on all unpaid product-improvement/tuning uses (G1/G2).

## Healthcare, privacy agreements and geography

EDEN may locate community clinics or explain a public listing. She must not diagnose, recommend treatment, substitute for a professional, adjudicate eligibility or promise care. Whether Our Ground is a HIPAA covered entity/business associate is unresolved and depends on actual relationships and processing (L1). Health information outside HIPAA can still create privacy/consumer-protection duties (L3). A source record is different from a resident's health narrative.

A DPA governs processor obligations; it is not a BAA. An offered BAA or “HIPAA eligible” service is not evidence of execution, exact endpoint coverage, safe configuration, or Our Ground compliance. Google Cloud and Azure document shared responsibilities and service scope (G7/M7). Do not process PHI until counsel determines roles and all required agreements/configuration evidence exist. The initial design excludes PHI rather than using a healthcare disclaimer as a control.

Geography must cover both the resident's eligibility and where processing/storage occurs:

- **Google Developer:** country availability list and special paid-client requirement in EEA/Switzerland/UK apply (G1/G11). US availability does not prove every territory, traveler or worldwide public visitor is eligible.
- **Google Cloud:** choose an approved regional service/model where needed; a global endpoint is not a US-only guarantee. Residency and feature exceptions need an order/configuration record (G4/G6).
- **OpenAI:** supported-country restrictions apply to customers and end users (O1/O5). Residency/processing availability and account approval must be checked for the exact endpoint; no US-only assumption from a US server (O3).
- **Azure:** geography-bound, DataZone and Global deployment types have different processing locations (M1). Region in the resource name alone is insufficient; document deployment type, model availability, failover, monitoring and speech regions.

Keep a provider-free resource path for people whose AI eligibility/consent/geography is unsupported or unknown. Do not require precise geolocation, identity documents or a full DOB just to show resource information. Counsel must assess applicable US federal/state and non-US child, health, privacy, transfer and recording rules. FTC guidance notes the 2025 COPPA amendment and directs readers to the revised Rule (L2); old FAQ snippets or a school's/consumer app's access policy are not a compliance determination.

## Estimated cost envelope and controls — proposal only

**Current authorized live-AI spend: $0.** These are planning estimates, not approval to activate billing or a quote/guarantee. Basic search, infrastructure, Redis, maps, operations, legal review and accessibility work are separate costs.

An illustrative small text evaluation after approval would allow at most 1,000 turns/month, 40/day, 3/minute per short-lived session, 20/session, two global concurrent calls, 2,000 total input tokens and 400 total billable output tokens/turn, and **one** provider call/turn. Generated/reasoning tokens, system/context overhead and provider-specific minimums must fit those totals; otherwise reject before dispatch or choose a reviewed larger reservation.

O6 lists standard short-context `gpt-6.1-sol` at **$2 input / $10 output per million tokens** on retrieval. At exactly those token ceilings, 1,000 turns would be **$8** in text token charges, or **$8.80** if the documented 10% regional uplift applies. This is an arithmetic illustration, not a model selection or safety/retention eligibility finding. No cache discount, free tier, data-sharing discount or negotiated price is assumed.

For a provider-independent guardrail, accept a model only if its current approved all-in effective rates fit a planning ceiling of **$5 input / $20 output per million tokens**, and reserve **$0.025 per admitted turn** (or a larger correctly calculated amount if other fees apply). The token-only ceiling would be $18/1,000 turns; the reservation covers margin, not unlimited tools or audio. Proposed hard application ceilings: **$2/day and $25/month**, with operator alerts at 50/80/95%. Atomically reserve before network dispatch; reject admission at any count, concurrency or money ceiling. In a two-instance race, spend reservations must remain within the global ceiling. Retain full reservation after ambiguous timeouts until reconciled; do not retry/fail over automatically.

**Voice budget remains zero.** As a sensitivity exercise only, 100 two-minute sessions at a hypothetical all-in $0.20/minute speech ceiling add $40; plus the conservative text estimate gives $58 before other infrastructure. That is not a vendor rate and does not fit the proposed $25 text pilot. Voice needs separately approved prices, durations, concurrency, safety and money limits. Real-time audio token/session pricing and separate STT/TTS charges must be measured with synthetic data after authorization.

G12/O6/M8 are rate-card references, not entitlements. Rates, promotional periods, model availability and region uplifts can change; pin reviewed rates/policy and stop on drift. G13 distinguishes alerts-only budgets from actual spend controls; a provider budget alert alone is not Our Ground's hard stop. Verify service-specific caps/quotas separately, and never let model requests bypass existing Geoapify budgets.

## Unresolved legal, contractual and operational questions

| Question / owner | Evidence needed before any real-data GO |
| --- | --- |
| Intended age groups, including unknown age and under-13s — owner + counsel | Written audience/use-case determination; applicability of parental consent/age assurance; practical, privacy-preserving flow that preserves public access. No inference from a provider's consumer chatbot age rules. |
| Any Google audience exception — counsel/provider | Applicable signed amendment or authoritative written contractual permission for the exact mixed-age API client. Until then the Google NO-GO stands. |
| OpenAI minors route — counsel/provider | Scope and acceptable evidence of parental consent, under-13/digital-consent-age safeguards, actual ZDR approval and any model-specific cache/safety-retention obligations; clarify whether intended broad anonymous usage can satisfy these conditions. |
| Microsoft minors/public-app terms — counsel/procurement | Current agreement, MCA/Product Terms and model-specific policies. The public Product Terms retrieval timed out in this audit; collect and review it before selection, then obtain clarification if ambiguous. |
| Health-law roles — counsel | Our Ground's legal entity/jurisdiction, covered-entity/BA relationships if any, consumer-health/child/privacy/recording and breach-law analysis; DPA/BAA and transfer safeguards when needed. No compliance verification is asserted. |
| Exact data path — security/privacy + vendor | Every processor/subprocessor, model/region, state/cache/storage/feedback settings, support access, human review, retention/deletion/hold exceptions and preview exclusions, including STT/TTS separately. |
| Existing infrastructure — owner/operator | Privacy contact, hosting URL/content logs, DB migrations/grants/TLS, backups/deletion ageing, Redis controls, restoration and incident evidence for the actual target. |
| Sources/license/quality — data steward | Permitted reuse of public directory and third-party discovery data in model context; no assumption map/POI licensing permits prompt sharing, durable cache or derived training. |
| Charges/limits — owner/security | Approved current rate/deployment mode, global reservations, count/token/audio ceilings, no retries on uncertain billing, kill switch and invoice reconciliation tests. |

Public documents show a candidate path, not an executed contract. No sales or legal inquiry was sent during this task.

## What can safely be built next with mocks

A finite public page-context builder, deterministic intent/category controls, mock provider adapter, source-bound result renderer, allowed-action validator, synthetic consent/eligibility receipts, fake STT/TTS and amplitude events, metadata-only logging harness, atomic budget simulator and adversarial fixtures can all be developed locally with outbound AI/speech calls blocked. Use invented residents, addresses, diagnoses and canary secrets, clearly marked synthetic; no production exports, real recordings or private organization data. A mock “consent accepted” does not become authorization to make a real request.

The implementation/release gates are in [pre-integration checklist](pre-integration-security-checklist.md). Real-user AI and voice remain NO-GO until each applicable gate has evidence and a separate release authorization.

## Source register

All successful entries retrieved **2026-11-06**. Effective dates are stated only where observed. Pages can change; recheck before contracting and release. Some Google AI pages returned Markdown unsupported by the browsing renderer; their current official bodies were retrieved read-only with HTTPS instead. Microsoft Learn pages displayed a generic sign-in banner while still exposing the cited article body; no account access was used.

| ID | Official URL / title | Retrieval or scope note |
| --- | --- | --- |
| G1 | [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms) | Retrieved 2026-11-06; effective March 23, 2026; age, use, geography and paid/unpaid data terms. |
| G2 | [Gemini API abuse monitoring](https://ai.google.dev/gemini-api/docs/usage-policies?hl=en) | Retrieved 2026-11-06; 55-day safety content and review policy. |
| G3 | [Google processor DPA](https://business.safety.google/processorterms/) | Retrieved 2026-11-06; paid Developer terms link here; no BAA inference. |
| G4 | [Google Cloud Service Specific Terms](https://cloud.google.com/terms/service-terms) | Retrieved 2026-11-06; Generative AI Services age/health restrictions, training and Pre-GA terms. |
| G5 | [Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum) | Retrieved 2026-11-06; actual customer agreement/scope still must be established. |
| G6 | [Cloud model zero-data-retention governance](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention) | Retrieved 2026-11-06; former Vertex AI data-governance URL redirects here. |
| G7 | [Google Cloud HIPAA/shared responsibility](https://docs.cloud.google.com/docs/security/compliance/hipaa) | Retrieved 2026-11-06; BAA, customer responsibilities and supported-service scope. |
| G8 | [Gemini Live API guide](https://ai.google.dev/gemini-api/docs/live-guide) | Retrieved 2026-11-06; current guide says Live is preview. No model ID frozen by this audit. |
| G9 | [Gemini speech generation voices](https://ai.google.dev/gemini-api/docs/speech-generation#voices) | Retrieved 2026-11-06; Aoede listed among voice options. |
| G10 | [Firebase Live configuration/voice options](https://firebase.google.com/docs/ai-logic/live-api/configuration) | Retrieved 2026-11-06; Aoede option and provider-specific configuration; wrapper is not contractual exemption. |
| G11 | [Gemini available regions](https://ai.google.dev/gemini-api/docs/available-regions) | Retrieved 2026-11-06; service availability does not establish residency. |
| G12 | [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) | Retrieved 2026-11-06; model/modality/tool prices, distinct from eligibility. |
| G13 | [Google Cloud budgets](https://cloud.google.com/billing/docs/how-to/budgets) | Retrieved 2026-11-06; alerts-only budget is not an automatic spending cap. |
| O1 | [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) | Retrieved 2026-11-06; effective January 1, 2026; customer apps, parental consent, geographic and healthcare terms. |
| O2 | [OpenAI under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) | Retrieved 2026-11-06; minors safeguards and younger-child personal-data/ZDR requirement. |
| O3 | [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data) | Retrieved 2026-11-06; training, logs, application state, ZDR and safety/cache/endpoint limitations. |
| O4 | [OpenAI DPA](https://openai.com/policies/data-processing-addendum/) | Retrieved 2026-11-06; effective January 1, 2026; processor duties, not a Healthcare Addendum. |
| O5 | [OpenAI supported countries](https://developers.openai.com/api/docs/supported-countries) | Retrieved 2026-11-06; verify exact service/end-user geography at selection. |
| O6 | [OpenAI API pricing](https://developers.openai.com/api/docs/pricing) | Retrieved 2026-11-06; illustrative standard short-context rate and conditional regional uplift. |
| M1 | [Azure models data/privacy/security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy) | Retrieved 2026-11-06; applies to models sold by Azure, including Azure OpenAI; geography/deployment and stateful features. |
| M2 | [Azure model abuse monitoring](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/abuse-monitoring) | Retrieved 2026-11-06; automated/human review and modified-monitoring approval. |
| M3 | [Microsoft Products and Services DPA](https://aka.ms/dpa) | Official agreement entry linked by M1; exact applicable document/version/execution is **unverified**, not claimed reviewed in full. |
| M4 | [Microsoft Azure Product Terms, MCA](https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA) | Retrieval attempted 2026-11-06, **timed out**; substantive minors/contract conclusions unresolved. |
| M5 | [Azure real-time speech-to-text data/privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security) | Retrieved 2026-11-06; real-time versus batch processing/storage. |
| M6 | [Azure text-to-speech data/privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security) | Retrieved 2026-11-06; real-time prebuilt versus custom/batch voice/avatar. |
| M7 | [Azure HIPAA overview](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us) | Retrieved 2026-11-06; not proof of Our Ground's executed agreement or exact model/feature coverage. |
| M8 | [Azure OpenAI pricing entry](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/) | Official rate-card pointer only; regional/account quote **not verified**, no Azure numerical quote used. |
| L1 | [HHS covered entities and business associates](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html) | Retrieved 2026-11-06; role-dependent HIPAA applicability. |
| L2 | [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) | Retrieved 2026-11-06; flags 2025 amended Rule; counsel must review current Rule and exact applicability. |
| L3 | [FTC Health Breach Notification Rule overview](https://www.ftc.gov/business-guidance/resources/health-breach-notification-rule-basics-business) | Retrieved 2026-11-06; applicability to Our Ground remains unresolved. |
| L4 | [Washington AG consumer health privacy guidance](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy) | Official search result found; page retrieval 2026-11-06 returned **403**. State-law applicability and exact current text require counsel verification; no legal conclusion drawn from snippet. |
