# EDEN-08 · Hosted database checkpoint

**EDEN-09 follow-up:** The [protected staging report](eden-09-protected-staging.md) records the subsequently verified encrypted external copy and real-data browser checks. The restore results below describe the earlier EDEN-08 checkpoint.

November 7, 2026. The separately authorized **ourground-staging** Supabase Free database is operational. The reviewed schema and limited three-clinic HRSA pilot are installed, and real queries passed through the restricted application role. Production data, website feature flags and Vercel configuration are unchanged. No deployment, billing activation or Gemini call was made. The external disk image remains a fallback.

## Verified hosted results

The signed-in dashboard identified the healthy us-east-1 project as `hrmocmvdmshoghclxyjs`. The saved owner connection was bound to that exact project reference, matching Supabase URL, session-pooler username/host and port 5432 before an authenticated read-only connection succeeded as `postgres` on database `postgres`. Supabase labels this project's main branch “Production”; this is the **staging project's own main branch**, separate from Our Ground production. The Data API enable switch was off at inspection.

| Check on this database | Observed result |
| --- | --- |
| PostgreSQL and migration journal | PostgreSQL 17.11; all **15 migrations** (001 and 003–016) committed; recorded SHA-256 hashes match the reviewed files; demo seed 002 omitted |
| Schema/security inspection | 27 application tables, 47 foreign keys and 60 indexes; no reported schema, RLS, ownership, inherited-role, privileged-function search-path or grant problems |
| Required extensions, all in `extensions` | PostGIS 3.3.7, pg_trgm 1.6, unaccent 1.1 and fuzzystrmatch 1.2 |
| Actual imported public directory | **3 healthcare services**, **3 locations**, **2 organizations**; 3 published records with HRSA lineage; 0 demo services |
| Application private-record counts | 0 app users, correction reports, claims, revisions, account audit rows and resource privacy holds; no production user data imported |
| Geographic reference, counted separately | **32,415 Census reference records**: 52 states and 32,363 places; these are location references, not healthcare listings |
| Restricted-role search at Census Harrisburg | **10 miles: 3 listings**; **5 miles: 2 listings**; ordered IDs agree between the Find Support repository/model and EDEN directory adapter |
| Detail, attribution and map-point data | All three details, HRSA IDs/source date, addresses and coordinates match the approved extract; generated marker keys/coordinates agree with the list records |
| Category and keyword filters | Harrisburg food at ten miles: **0**; healthcare keyword “Sadler”: **1** |
| Negative access checks as `our_ground_api` | Raw services, source snapshots, privacy holds, owner import and owner withdrawal each denied with SQLSTATE **42501** |
| Rendered browser selection / live Gemini | Not tested by this database acceptance run; no AI request sent |
| Manual backup/restore | A 1,957,036-byte scoped archive was restored into a separate empty database inside this staging project; counts, receipts, schema/grants, runtime denial and 3→2 spatial results matched; disposable restore database removed |

The [owner database evidence](verification/eden-08/hosted-database-verification.json) contains migration hashes, real counts, import receipts and storage measurements. The [restricted-role acceptance evidence](verification/eden-08/healthcare-verification.json) contains actual queries, ordered IDs, filters and privilege denials. The earlier [PostGIS screenshot](verification/eden-08/staging-postgis.jpg) and [initial receipt](verification/eden-08/hosted-pilot-status.json) remain **historical baseline evidence**, superseded for current import/query status by the two new receipts.

**Healthcare provenance.** The existing importer applied only the [three-row extract](verification/eden-08/healthcare-pilot.csv), with slice SHA-256 `69f274ad859db78d35861642fa5a9f8132f22250ff3f46e453061cb7315cfacd`, dated November 6, 2026. Its completed receipt reports 3 created, 0 updated, 0 needing review, 0 excluded in this preselected slice and `full_snapshot: false`; no nationwide stale marking was used. The [source receipt](verification/eden-08/healthcare-pilot-source.json) records its parent-feed digest, official IDs and provider location pages. Each selected site matched an active fixed-location HRSA row, its previously published identity/point/address, and a public facility address in the [Hamilton](https://www.hamiltonhealthcenter.com/locations/) or [Sadler](https://www.sadlerhealth.org/contact/mechanicsburg/) directory. All records remain `imported_unverified`; this is evidence of facility identity, not independently confirmed services, hours, eligibility or current availability.

The actual Census lookup returned Harrisburg, PA (`census:2026:place:4232800`) at 40.275891, −76.885020. The restricted repository returned South Allison Hill, Steelton and Mechanicsburg at rounded public distances of 1.3, 3.6 and 6.4 miles. Refining to five miles retained South Allison Hill and Steelton. Both source ZIP checksums and completed geographic import receipts were verified. The preceding literal-coordinate PostGIS control predicted this outcome; the current acceptance now reads persisted listings through the real repository and EDEN adapter.

**Connection separation.** The owner migration/import connection remains in the mode-0600, ignored `.env.eden08-owner.local`, explicitly loaded only for owner operations. A distinct restricted `our_ground_api` credential is stored in mode-0600, ignored `.env.eden08-runtime.local` for these local acceptance checks, using transaction-pooler port 6543. It is not copied into the browser, production settings or Vercel. Both ports passed CA and hostname verification with TLS 1.3 using the [Supabase dashboard CA](https://supabase.com/docs/guides/platform/ssl-enforcement); the default Node trust store alone did not validate this pooler. Server-side SSL enforcement is a separate dashboard setting and was not changed. Local website feature flags and running application configuration have not been switched by these checks.

With Node 24 selected, repeat the bounded **read-only healthcare** acceptance using the private runtime configuration:

~~~sh
node --env-file=.env.eden08-runtime.local scripts/verify-eden-healthcare-pilot.mjs --confirmed-nonproduction
~~~

This verifies the repository, EDEN directory adapter and Find Support marker-data contract against staging. It does not test the rendered browser, actual selected marker, Auth sign-in, conversational model/function calls or speech. Keep the existing full-directory probe's food requirement intact; the three-clinic pilot contains no food records.

The new import does not recover historical privacy holds or corrections. Zero holds in this fresh database does not establish that none existed in an older directory. Reconcile relevant historical decisions before any public release; keep this pilot private while that evidence remains missing.

## Account and staging evidence

The signed-in Supabase dashboard showed one organization, **Penuel's Project**, on Free. Its two previously existing projects, **Mediasis** and **NittanyBuddy**, were both paused. Neither is an Our Ground target. The dashboard offered the Free new-project form without an upgrade prompt. Paused projects do not count toward the two active free projects allowed across organizations where an account is Owner or Administrator. The owner subsequently created **ourground-staging**, with the Data API and automatic table exposure deselected on the form. The application uses backend PostgreSQL connections and the separate Auth API. [Supabase billing rules](https://supabase.com/docs/guides/platform/billing-on-supabase) · [Organization project list](https://supabase.com/dashboard/org/wqprpikzdjwlkucmqylx)

At the initial inspection there was no applicable Supabase project linkage, Auth or restricted runtime configuration, and the full-directory probe stopped before SQL. The owner subsequently created and authorized the isolated project. The successful schema, import and restricted-role query evidence above supersedes that initial database checkpoint; protected website staging remains a separate gate.

Read-only Vercel metadata for the separate **ourground-staging** project returned zero deployments and zero environment entries, including hidden production entries. Protection mode is **all_except_custom_domains**. Node is set to **26.x** and this repository requires **24.x**. The canonical checkout points to the production Vercel project. The staging preflight reported a link mismatch and missing matching build, Preview origin, Supabase Auth/DB, dedicated Redis and Geoapify configuration. A local review API health response succeeded; it does not test the database. A protected Preview URL, Auth session, shared rate limits, provider restrictions and rendered selection have not been verified. Hosted Gemini stays disabled. [Existing Vercel setup and isolation checks](../implementation/phase-7e-staging-setup.md)

## Compatibility, capacity and operation

- The reviewed runner successfully applied 001 and 003–016 in one transaction with a lock and migration checksums, skipping demo seed 002. Actual hosted extension placement, restricted-role privileges and negative access checks passed. The runtime role owns no application objects, inherits no roles and has no RLS bypass or elevated role attributes. Continue owner-only migrations and imports; do not grant them to the application login. [Migration runner](../../backend/manage-db.mjs) · [Supabase PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)
- Use the exact project's owner session pooler on 5432 for reviewed migrations/backups and its restricted transaction pooler on 6543 for serverless runtime. The repository uses one connection per instance, disables prepared statements and verifies remote TLS. Configure Auth URL/publishable key, exact callback origins and server token validation separately before website staging. No service-role or migration secret in browser/Preview. [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres) · [Repository TLS and role guard](../../backend/database-security.ts)
- The original full HRSA dry run found **499 Pennsylvania candidates**, including 3 whose site city was Harrisburg; those were source-selection counts, not live radius counts. Only the explicit three-clinic extract was applied. Preserve source exclusions, correction/privacy decisions and checksum receipts for future reviewed refreshes. Never run full-snapshot stale marking on a slice. The Census import installed the complete reviewed state/place bundle. Food apply remains guarded to a named local disposable database; no guard was removed and no food record imported. The existing full-directory probe still requires positive food coverage. [HRSA source](https://data.hrsa.gov/topics/healthcenters) · [HRSA importer](../../scripts/import-hrsa.mjs) · [Census importer](../../scripts/import-gazetteer.mjs) · [Healthcare acceptance](../../scripts/verify-eden-healthcare-pilot.mjs)
- Actual `pg_database_size` after schema, healthcare and Census import was **66,336,435 bytes** (about 66.34 MB), below the published **500 MB** Free database allowance. Application tables including indexes used 45,924,352 bytes; migration receipts used 32,768 bytes. Their indexes alone used 32,407,552 and 16,384 bytes respectively. The initial empty database used 10,942,131 bytes and PostGIS-only checkpoint used 19,117,747 bytes. These are point-in-time SQL measurements, not a bound on WAL, temporary disk use, backup restore peaks or growth. Keep a reserve and remeasure before imports/restores. Free may pause after low activity and has no automatic backups. [Owner measurement](verification/eden-08/hosted-database-verification.json) · [Free plan](https://supabase.com/pricing) · [Database and disk size](https://supabase.com/docs/guides/platform/database-size)

Owner read-only measurements, in bytes:

~~~sql
SELECT current_user, current_database(), current_setting('server_version'),
       pg_database_size(current_database()) AS database_bytes;

SELECT e.extname, e.extversion, n.nspname AS schema
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN ('postgis','pg_trgm','unaccent','fuzzystrmatch');

SELECT schemaname, sum(pg_indexes_size(relid)) AS index_bytes,
       sum(pg_total_relation_size(relid)) AS tables_including_indexes_bytes
FROM pg_stat_user_tables
WHERE schemaname IN ('app_private','our_ground_meta')
GROUP BY schemaname;
~~~

## Manual recovery verification

The [manual recovery procedure](eden-08-manual-recovery.md) records the exact backup scope, safe command pattern, restore prerequisites, cleanup and recovery limits.

A consistent custom-format logical dump of `app_private` and `our_ground_meta` was restored into the separately created empty database `ourground_eden08_restore_20261107` **inside this same nonproduction Supabase project**. The [recovery receipt](verification/eden-08/manual-recovery.json) records the archive SHA-256 (`6180d83b1f893d9a4828368361a7d2ac393b20a87d0c92d991153cfb529b3ad1`), its **1,957,036 bytes** and 28 table-data entries. Managed Auth data and global role-password hashes were excluded. The private archive is stored at ignored, mode-0600 `tmp/eden08-hosted/staging-public-directory-20261107.dump`.

The restored target had **3 services, 3 source-lineage rows, 0 holds, 32,415 geographic reference records and 15 migration receipts**. Migration/source receipts, schema, role grants and restricted runtime behavior matched the source; direct private reads were denied, and ten-/five-mile searches returned the same ordered three/two records. The restored database used 53,371,407 bytes at its measurement checkpoint. Logical restoration need not reproduce the source database's physical byte size.

Supavisor retained idle connections after verification, so the first disposable-database cleanup encountered SQLSTATE 55006. Cleanup was limited to that explicitly disposable restore database; the final catalog confirmed it absent. The source database remained at **66,336,435 bytes**. This did not drop, reset or restore over the staging source or any production database.

This passes the measured logical restore drill within the current project. An independent backup copy has **not** been verified, and recovery after loss of the entire Supabase project or onto a second project has **not** been tested. Retain an access-controlled independent copy with its digest and versions, preserve the reviewed extension/role layout and source/hold/correction state, and test a separately authorized empty destination before claiming project-disaster recovery readiness. The external drive's independent-backup prerequisite remains unresolved. [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups)

The database/repository/EDEN adapter checks now pass. Next, when the isolated local or protected staging configuration is selected and verified, exercise the rendered Find Support list, details and actual marker selection against the same project and restricted role. Compare Harrisburg at ten and five miles with the ordered IDs and source metadata in the acceptance receipt. Capture browser evidence under real-directory mode and keep imported listings labeled unverified. Auth, protected deployment and live Gemini remain independent gates. [EDEN-08 database acceptance](eden-08-infrastructure-recovery.md)
