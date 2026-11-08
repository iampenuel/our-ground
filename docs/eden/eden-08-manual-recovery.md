# EDEN-08 staging manual recovery

**EDEN-09 follow-up:** The [protected staging report](eden-09-protected-staging.md) records the subsequently verified encrypted external copy and real-data browser checks. The restore results below describe the earlier EDEN-08 checkpoint.

Verified November 7, 2026, only in Supabase staging project `hrmocmvdmshoghclxyjs`. See the [executed drill receipt](verification/eden-08/manual-recovery.json). This restores public directory data and application objects. Managed Auth, platform settings, global role passwords and website configuration are separate recovery concerns.

## Result and retained archive

- Owner/session endpoint authenticated with certificate and hostname validation. PostgreSQL 18.6 client tools backed up PostgreSQL 17.11.
- Private account/workflow table counts were zero before export. Only `app_private` and `our_ground_meta` were dumped, preserving source history, privacy safeguards, migration receipts, object ownership, ACLs and RLS. No managed `auth`, `storage` or `vault` data, and no global password hashes, were exported.
- Local archive: `tmp/eden08-hosted/staging-public-directory-20261107.dump`, mode 0600, ignored by Git and Vercel; 1,957,036 bytes. SHA-256 `6180d83b1f893d9a4828368361a7d2ac393b20a87d0c92d991153cfb529b3ad1`.
- The empty test database `ourground_eden08_restore_20261107` was created in this staging cluster. Four prerequisite extensions were created in `extensions`, then the archive was restored in one transaction without `--clean`. Existing cluster roles were used; no existing password was changed.
- Restored counts: three services, three source bindings, 32,415 active geographic records, 15 migration receipts and zero privacy holds. Receipt hashes/HRSA import summary matched. The existing schema/RLS/grant checker passed. The restricted role could search three results at ten miles and two at five miles; its raw service-table read was denied.
- Supavisor kept idle connections after the clients closed. The first ordinary DROP returned SQLSTATE 55006. Only the newly created disposable test database was then removed with `DROP DATABASE ourground_eden08_restore_20261107 WITH (FORCE)`. Its absence was verified. The source database remained 66,336,435 bytes.

This tests logical restore within the same staging cluster. It does not test project loss, cross-project restore, Auth recovery or an independent backup copy. Keep an access-controlled copy on an independently recoverable destination before depending on hosted staging. The external APFS image remains optional; no disk image or local PostgreSQL cluster was initialized.

## Repeating the backup safely

1. Select only this staging project, verify its identity and measured size, and verify private account/workflow tables remain empty. If they contain data, stop and review an export that excludes private content while preserving referential integrity; do not reuse this whole-schema export blindly.
2. Use the session endpoint on port 5432 with full certificate verification. Obtain the CA from the staging dashboard's Database Settings. Its certificate fingerprint was recorded in the [pilot receipt](verification/eden-08/hosted-pilot-status.json). Avoid owner URLs on the command line.
3. From the project root, choose a new, unused output filename in an owner-only ignored directory. This example prompts privately for the staging owner's password:

```sh
PGSSLMODE=verify-full \
PGSSLROOTCERT="$PWD/tmp/eden08-hosted/supabase-ca.crt" \
/opt/homebrew/opt/postgresql@18/bin/pg_dump \
  -h aws-0-us-east-1.pooler.supabase.com -p 5432 \
  -U postgres.hrmocmvdmshoghclxyjs -d postgres -W \
  --format=custom --schema=app_private --schema=our_ground_meta \
  --no-tablespaces --file=/ABSOLUTE/PRIVATE/UNUSED/backup.dump
```

Do not overwrite the verified archive. Set the new archive's mode to 0600, compute its SHA-256 and inspect `pg_restore --list`. Record PostgreSQL/extension versions, migration and source checksums, counts, privacy state and object grants alongside the digest. Copy to the independently approved backup destination, verify the copied digest, and record when recovery was last tested.

## Repeating the restore safely

Use a separately identified **empty** recovery target, with an explicit storage budget and approval for that target. For a repeat in this same staging cluster, a new disposable database name can be used; never select the source `postgres` database for the restore. Custom databases are outside Supabase's Dashboard/Auth/Data API integration. [Supabase explanation](https://supabase.com/kb/troubleshooting/manually-created-databases-are-not-visible-in-the-supabase-dashboard-4415aa) (retrieved November 7, 2026).

Provision the same prerequisite roles without copying passwords, and install `postgis`, `pg_trgm`, `unaccent` and `fuzzystrmatch` in `extensions`. Use `pg_restore --exit-on-error --single-transaction` with the reviewed archive, verified TLS and the owner's hidden password prompt. Do not use `--clean` or weaken ACL checks to make a restore succeed. Do not overwrite source data.

Compare the migration hashes, source receipts, privacy holds/withdrawals, real published IDs, geometry, restricted-role searches and negative access checks. Restore corrected/withdrawn records with their state intact. A future archive containing holds must preserve and test those holds; this first pilot has none. Cross-project recovery also needs the global restricted role and compatible provider configuration recreated privately.

Close clients before removing an explicitly disposable restore target. Supavisor may retain idle connections; any forced cleanup must be restricted to the exact test database created for that drill. Verify the original source still responds and the scratch target is absent. No backup or restore step authorizes deploying the website or activating Gemini.
