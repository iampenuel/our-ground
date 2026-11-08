# Protected discovery-only candidate

The owner approved protected testing of directory discovery and accepted sole directory operation and recovery for this scope. Public promotion requires separate owner approval. Private correction intake is closed. The existing directory recovery checkpoint and source privacy holds apply. The corrections-enabled handoff and its private intake gates remain available for any future change of scope.

| Item | Verified value |
|---|---|
| Source | [`568a383f9f1ebf8f5b27d651e6ac6ad70a09f68e`](https://github.com/iampenuel/our-ground/commit/568a383f9f1ebf8f5b27d651e6ac6ad70a09f68e), on `codex/discovery-only`, based on the qualified national release `04fbdeb` |
| Protected production candidate | [Open the candidate](https://ourground-lqsz7qvlk-penuels-projects-aa802b06.vercel.app) · `dpl_DD7rhry8nJ1onRjgRB7BDr4pYxST` in `ourground`. Vercel Authentication, anonymous health 302, zero aliases. The authenticated manifest matched the local prebuild and its 128 assets. |
| Current live and rollback target | [ourground.vercel.app](https://ourground.vercel.app) serves `dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4`, anonymous health 200. |
| Desktop browser | Honolulu 96813 healthcare search, published listing details, 40 selectable map pins, successful style and vector tiles. Mouse selection passed. |
| Mobile browser | Touch Chrome at 390 × 844, Philadelphia 19104 food search, published listing details, 38 map pins, successful style and vector tiles. Touch selection passed. |
| Intake | Authenticated direct POST to a published healthcare record returned HTTP 403 `CORRECTIONS_CLOSED`. Malformed JSON through the rewritten handler returned the same application code. The before/after production counts were 0 reports and 34 active source holds, with identical holds and published ID checks for all 17,518 directory services. |
| Public interface and EDEN | Search cards, listing detail and the home, organizations, about and privacy pages were checked. No correction invitation or owner email in the shipped public assets. Public EDEN session, speech and Live token requests returned HTTP 403 `EDEN_DISABLED`. |
| Verification | [GitHub release checks](https://github.com/iampenuel/our-ground/actions/runs/42447321186) passed. Local suite: 698 passed, one skipped. [Machine-readable results](discovery-only-checks.json). |

Geoapify required both the exact candidate Origin and its HTTPS Referer with a trailing slash on the production browser key. Both entries were approved for testing and owner review, and were verified in the saved provider settings. The browser tests used the candidate hostname and its protected session with no origin substitution. Nationwide healthcare, regional food coverage and housing-counseling coverage follow the [national handoff](production-gates.md#map-coverage-and-eden).

Only after a separate release instruction, verify `iampenuel`, the `ourground` production project, this candidate's manifest and the live deployment above. If all still match, the candidate-specific command is `vc promote dpl_DD7rhry8nJ1onRjgRB7BDr4pYxST --scope penuels-projects-aa802b06`. Confirm the public domain anonymously serves this SHA, search, maps, listing detail and HTTP 403 for direct reports. If an approved cutover fails, the rollback command is `vc rollback dpl_HDGZQZYaJXyu5KK54NyJiNi4nTv4 --scope penuels-projects-aa802b06` while it remains the immediately previous public deployment. Verify the domain and signed-out access after rollback. These commands affect deployment routing. No database migration is part of this candidate.
