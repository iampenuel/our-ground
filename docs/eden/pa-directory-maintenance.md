# Pennsylvania directory · steward runbook

Two jobs have different privileges. The [inventory export](../../scripts/maintenance/pa-inventory.mjs) is a **manual, read-only staging operation**. The [comparison worker](../../scripts/maintenance/pa-refresh.mjs) reads that private inventory and fetches only the two approved public feeds. It does not import a database client, take a destination URL, update the application or expose an apply mode. Its [comparison and receipt rules](../../scripts/maintenance/pa-review.mjs) are tested independently.

## Run a check

From the repository root with Node 24, create an inventory after every data/claim/correction/hold change and at least weekly. Only the manual command reads the private owner settings; it checks the exact EDEN-08 staging project, TLS CA, session-pool host and database identity and opens one read-only transaction. The restricted web role retains no raw source/correction access. No resident fields, correction text, phone numbers, addresses or credentials go into the inventory.

```sh
node scripts/maintenance/pa-inventory.mjs
# Pass the printed inventory path. The check prints a NEW directory with its receipts.
node scripts/maintenance/pa-refresh.mjs check tmp/pa-maintenance/inventory-<timestamp>.json
```

Substitute actual paths, not angle brackets. Each check emits a summary and per-source queue in a new private, ignored directory. **Exit 0:** both compared, no flags. **Exit 2:** completed but discrepancies, stale dates or other warnings require review. **Exit 1:** at least one feed/check failed; inspect the per-source status. A failure does not reset the last good date, age out protected data, or imply closure. Do not infer success from a file's existence.

For an individual queue entry, a human can record a disposition without publishing. Replace the path, record ID and alias:

```sh
node scripts/maintenance/pa-refresh.mjs review tmp/pa-maintenance/check-<run>/philly-food-sites.json <source-id> investigate <steward-alias>
```

Decisions are limited to investigate, request correction, request withdrawal, defer, or forward for manual review (the CLI uses underscore-separated names). A steward who reviewed an entirely clean plan may use ID `source-review` and disposition `reviewed_no_changes`. Each exclusive-write receipt records source, ID, plan digest, steward alias and review time. It does not certify service operation, update import dates or create an authenticated signature. Never count an automated digest comparison as independent provider verification. Keep receipts securely with the owner's decision/backup records, separately from raw data; the ignored working directory alone is not a durable audit log.

## What the checks mean

- **Philadelphia:** fetch the official City layer with bounded pagination; compare its total before/after and layer edit time at both ends. Normalize using the existing importer and apply the same whole-feed duplicate, category, privacy, address and coordinate checks with the staging Census reference. Accepted new IDs enter review, never automatic publication. The coverage boundary is Philadelphia.
- **HRSA:** download the bounded official national CSV; reject malformed/duplicate IDs, mixed source dates and unexpected scope. Compare only existing pilot IDs (including source exclusions), not the rest of Pennsylvania. A new national facility does not automatically enlarge the pilot. This file has no authoritative downloaded-row count; unusually small feeds or missing bindings require investigation. Absence is never proof of closure.
- A digest change for the same ID is a proposed update. Inactive, privacy-suppressed, failed quality checks and no-longer-seen IDs have different queues. A reappearing held record cannot become an addition. Existing local edits, organization memberships/listing access, pending claims or revisions tied to a site, pending corrections and protected statuses are flagged for review. The worker cannot resolve/delete a report, release a privacy hold or overwrite a manual decision.
- The queue keeps **source date, original import date, last import observation, comparison date and disposition date** distinct. No availability field is derived from them. Steward thresholds (not publisher promises): review HRSA feed age over **7 days**, Philadelphia over **45 days**, inventory age over **7 days** and a binding last observed by import over **30 days**. A good feed check may establish “source still matches”; it cannot establish “open now”. Retain original timestamps, publication versions and attribution.
- Halt publication review on duplicate/invalid identity, regressing source dates, inconsistent snapshots, unexpected missing volume, stale source, unreviewed license change or uncertain coordinates. Full-feed floor is 90% of the EDEN-11 row baseline; more than 10% of bindings missing also triggers a bulk-loss warning. These are alarms, not claims that a smaller loss is legitimate. Review even a single missing ID. Recalibrate thresholds only in a reviewed source-policy change.

## Triage before anything changes on the website

| Observation | Steward response |
|---|---|
| New or changed | Confirm facility, category, original public point, organization contact, source date/URL/license and current scope against the publisher. Check same-site names/addresses/points across sources. Do not merge distinct programs automatically. Preserve unknown fields. Compare revisions, check outstanding corrections and organization ownership **again in the publication transaction**. |
| Missing, obsolete, moved, inactive, out-of-bounds | Distinguish a failed download, seasonal pause, changed ID and actual withdrawal. Freeze conflicting changes. For an uncertain published record, use existing reviewed status `stale_or_needs_review`/`needs_review` so cards and EDEN say it needs review. For confirmed inactivation, use the existing inactive/unpublished state; test search **and direct detail**. Never hard-delete to reconcile a feed. |
| Source past its review window | Investigate same business day. Keep the original displayed source timestamp and imported/unverified notice. If no timely reconfirmation is possible, manually flag the affected bindings as needing review, or withhold them; do not refresh their dates to suppress a warning. The offline job cannot change live labels. Public launch requires a named person who can actually do this. |
| Sensitive or withdrawn public location | Escalate immediately. Use the existing source-specific privacy withdrawal/hold path on the exact IDs, not a broad import. Do not include the address or coordinates in tickets/logs. Check detail, map and search have stopped exposing it. No automated reactivation; reviewed release is a separate operation requiring evidence and a reviewer. Preserve correction reports under the existing retention/hold policy. |
| Owner correction or competing claim | Keep the original private report and its status. Compare the source and owner evidence in the authorized workflow. A data refresh cannot resolve the report or replace an organization-maintained field. Distinguish checking the publisher from independently confirming a specific field with a provider. |
| Feed outage, changed license or schema | Freeze publications from that source. Tell the steward when the last successful check happened; try again later. Do not reinterpret a 403, timeout or empty payload as a mass withdrawal. |

Before a separately authorized publication: save an independently recoverable encrypted checkpoint, re-inventory, recheck the exact normalized hashes and flags under lock, isolate the staging role/project, review the bounded importer plan, and capture a per-ID decision. Do not run the one-time EDEN-11 bootstrap again or use full-snapshot reconciliation on the HRSA slice. Historical migration 008 uses an obsolete HRSA URL for **new** rows; explicitly verify canonical [HRSA attribution](https://data.hrsa.gov/topics/health-centers/) before publishing additions. Recheck counts, approved coordinates, direct details, source dates, uncertainty label, empty coverage and map/list selection through the protected Preview. Restore only into a separate recovery target. No such publication was necessary in EDEN-12.

## Operating cadence

Assign one directory steward and a backup. Run the comparison daily (HRSA publishes daily; Philadelphia changes as needed); queue license reviews monthly and after any publisher notice; review ordinary changes weekly and handle reported closures/privacy withdrawals promptly. A future scheduler can invoke **only** `pa-refresh.mjs check <private-inventory-path>` with public internet access, a private writable output directory, **no DB credentials**, and notification on exits 1/2 or a missed run. Have an owner recapture the inventory; do not schedule the owner exporter, Vercel cron, the import CLI or a review decision. No scheduler was installed. Rotate/encrypt retained reports and prune scratch copies per the owner's retention policy; honor holds. Public reporting should include aggregate coverage and dates, never private queue notes or affected confidential locations.
