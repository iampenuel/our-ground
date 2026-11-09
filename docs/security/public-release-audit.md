# Public-release security audit

**Verdict: PUBLIC-READY for the audited repository and retained GitHub evidence, as of November 9, 2026.** No exposed credential requiring rotation was identified. This is an evidence-based review, not a guarantee against every possible vulnerability.

The production source is `b722ac8402b54bd911dcfc5cbfbcd1b419a71557`, recorded by the existing `eden-production-2026-11-09` tag. The showcase branch starts from the merged release, `02d8b357ab9cf97e8b42d7b4f1144acebe3116f7`. No published history, release tag, production configuration, database, or deployment was changed for this audit.

## Coverage and results

| Surface | Evidence | Result |
| --- | --- | --- |
| Current tracked files and configuration | Source, API authorization boundaries, environment examples, browser/server credential separation, CI permissions, deployment controls | PASS: no actual secret or unsafe production bypass identified |
| Reachable Git history | Eight remote branches, one tag, advertised pull-request refs and imported local refs; 28 mirror refs, 76 unique commits, 1,716 unique blobs, 135,810,760 raw blob bytes | PASS: all reachable blobs scanned without binary or size exclusions |
| Independent history scanner | Gitleaks 8.30.1 with decoding and archive inspection; raw-object scan also covers merge-only content | PASS: three reviewed SHA-256 false positives, excluded only by exact historical fingerprint |
| Known credentials | Local current server values compared without displaying them; raw and encoded representations checked against Git objects and retained logs | PASS: zero exact matches |
| Images and recordings | 298 unique images, 11 videos / 292 sampled frames, seven complete audio tracks; three new public screenshots | PASS: no credential or private-data findings; OCR and transcription ran locally |
| GitHub Actions | All 112 retained log archives, 250 text members, 17,941,017 uncompressed bytes | PASS: no credential exposure; CI database URL is a password-free loopback fixture |
| Artifacts and releases | Zero retained Actions artifacts; one release body and zero uploaded release attachments; tag source included in history scan | PASS |
| Discussion surfaces | Three issue/PR bodies; zero retained issue/review comments at the snapshot | PASS |
| Dependencies | Full and production-only lockfile audits, with scripts disabled | PASS: zero known vulnerabilities reported; lockfile unchanged |
| Personal author metadata | Owner confirmed affected-author consent to existing direct-contact metadata | PASS: metadata preserved, without changing commit IDs |

Historical document contact matches were the owner's already-public profile address. Database URI and OAuth query matches were placeholders or synthetic test examples. Intentionally public service configuration and one-way browser-key fingerprints are not server credentials. Raw secrets, credentials and audio transcripts are excluded from these audit reports.

## Safe remediation and prevention

- Deleted 13 verified regenerable npm dependency-download caches after confirming that no workflow was active. The historical cache contents could not be downloaded through the inspected API; removing them eliminated that opaque retained surface. No workflow logs or release evidence were deleted.
- Added a read-only, full-history Gitleaks workflow for pushes and pull requests. Its checkout action and scanner download checksum are pinned. Output is fully redacted and no finding artifact is uploaded.
- Added only the three reviewed commit/path/rule/line false-positive fingerprints to `.gitleaksignore`. A synthetic new-secret fixture confirmed detection and redaction.
- Disabled persisted checkout credentials in the existing release workflow. Workflows have no production credentials, write token, `pull_request_target` trigger, or self-hosted runner.
- Added a private reporting contact in [SECURITY.md](../../SECURITY.md) and contributor guidance against publishing credentials, account captures and personal data.
- Preserved the production deployment and the existing `git.deploymentEnabled: false` Vercel setting. Public screenshots used manual directory controls, without Gemini calls, microphone access or account sessions.

## Publication and ongoing maintenance

The repository remains private until its owner changes visibility. The prepared PR brings the released application and showcase documentation into the older default branch; it does not authorize a production deployment. No repository-wide open-source license has been invented. Existing third-party terms, including the ReactDrops integrated-product restrictions, remain intact.

After publication, review available native secret protection, private vulnerability reporting, Dependabot and default-branch protection in GitHub settings. Those features were unavailable or disabled under the audited private configuration; no paid service was enabled. The independent scanner provides immediate CI coverage. The disposable PostGIS CI service still uses a trusted upstream version tag rather than a digest; pinning it is optional supply-chain hardening, not a credential exposure.

To showcase the repository on the profile, use **Profile → Customize your pins**, select `our-ground`, and save after changing visibility. GitHub documents that making a repository public also exposes its Actions history and logs; those retained surfaces were included here. See [visibility effects](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility) and [profile pins](https://docs.github.com/en/account-and-profile/how-tos/profile-customization/pinning-items-to-your-profile).

## Limits

The audit covers reachable Git objects and evidence retained and accessible at its snapshot, not unreachable server objects or expired/deleted logs and artifacts. Pattern matching cannot recognize every unknown credential. Known-value checks cover locally available current secrets, not all previously rotated values. OCR and speech recognition are probabilistic; video frames were sampled approximately once per second rather than inspected exhaustively. Audio recognition covered all seven complete tracks and matched synthetic resource scenarios. Vulnerability databases can lag new issues.

Local ignored environment files, untracked account/dashboard captures and private operator drafts were excluded from the showcase PR. They must remain private and be reviewed separately before any later addition. Public readiness applies to this audited snapshot; later commits and uploads need the same care.

Sanitized evidence: [history](public-release-history-summary.json), [GitHub](public-release-github-summary.json), [media](public-release-media-audit.json), and [cache cleanup](public-release-cache-cleanup.json).
