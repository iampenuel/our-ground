"""Stream the pinned public-directory archive into an empty, identified target.

Run from the release workspace. Production credentials never enter command arguments.
The production directory-only seed is distinct from backups of post-launch corrections.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import shutil
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from urllib.parse import unquote, urlsplit

EXPECTED_SHA = "04fbdeb7793710bec14a1e6f91ca38a4916488d2"
CIPHERTEXT = "11e643399bc18cbcadd65fc69065792ab5c0ab3f45c6938a18493297e727ee17"
PLAINTEXT = "96c75e562237ff16d0f18778f7313d89b14e1b744b9591845860eb63af2d7e63"
FOLDER = "national-directory-20261108T015547Z"
EXCLUDED_REFS = {"hrmocmvdmshoghclxyjs", "cvliqzfxqennzdajbejk", "oecwyjnfrjttyuyrronv"}
COUNTS = {"hrsa-health-centers": 16417, "philly-food-sites": 324, "seattle-food-resources": 209,
          "pgc-food-assistance": 60, "hud-housing-counselors": 508}
JOURNAL_DIGEST = "c116016003b6068609ed385620b4124d6295d22ae7557c8e39aeec5d7cf1038a"
SOURCE_DIGEST = "262d2e6933b12b4cb1387c17f65d25b1518b2d23618db5866f5eca7e25d4f9ad"


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def pg_env():
    return {k: os.environ[k] for k in ("PATH","HOME","LANG","LC_ALL") if k in os.environ}


def target(workspace, args):
    if args.rehearse:
        return dict(pg_env(), PGHOST="127.0.0.1", PGPORT="19474", PGDATABASE="ourground_release_rehearsal",
                    PGUSER="postgres", PGSSLMODE="verify-full", PGSSLROOTCERT=str(workspace/"tmp/production-gates/tls/server.crt"))
    private = workspace/".env.production-owner.local"
    require(private.is_file() and not private.is_symlink() and not private.stat().st_mode & 0o077,
            "Configure the owner-only production connection first.")
    env = dict(line.split("=", 1) for line in private.read_text().splitlines() if line and not line.startswith("#"))
    ref = args.production_ref
    require(ref==env["PRODUCTION_PROJECT_REF"] and re.fullmatch("[a-z0-9]{20}",ref) and ref not in EXCLUDED_REFS,
            "Ref does not match a new independent production project.")
    u = urlsplit(env["PRODUCTION_OWNER_URL"])
    require(u.scheme in ("postgres","postgresql") and re.fullmatch(r"aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com",u.hostname or "")
            and u.port==5432 and u.username=="postgres."+ref and u.password and u.path=="/postgres" and not u.query and not u.fragment,
            "Use the exact separately confirmed production session pooler.")
    return dict(pg_env(),PGHOST=u.hostname,PGPORT="5432",PGDATABASE="postgres",PGUSER=u.username,
                PGPASSWORD=unquote(u.password),PGCONNECT_TIMEOUT="10",PGSSLMODE="verify-full",PGSSLROOTCERT=env["PRODUCTION_CA_FILE"])


def query(env, sql):
    return subprocess.check_output(["psql","-XAtq","--no-password","-v","ON_ERROR_STOP=1","-c",sql],env=env,text=True).strip()


def digest(rows):
    return hashlib.sha256(json.dumps(rows, separators=(",",":")).encode()).hexdigest()


def verify(env, check_staging_schema=True):
    inventory = dict((line.split("|")[0],int(line.split("|")[1])) for line in query(env,
        "select source_id,count(*) from app_private.public_resource_provenance group by source_id order by source_id").splitlines())
    require(inventory==COUNTS, "Unexpected public inventory.")
    for table, columns, expected in [
        ("our_ground_meta.migrations",["name","sha256"],JOURNAL_DIGEST),
        ("app_private.resource_import_runs",["source_id","checksum"],SOURCE_DIGEST)
    ]:
        where = " where completed_at is not null " if columns[0]=="source_id" else " "
        raw=query(env,"select "+",".join(columns)+" from "+table+where+"order by "+",".join(columns))
        require(digest([dict(zip(columns,r.split("|"))) for r in raw.splitlines()])==expected,"Receipt digest mismatch.")
    require(query(env,"select count(*) from app_private.postal_reference")=="33791","Postal count mismatch.")
    require(query(env,"select count(*) from app_private.resource_privacy_holds where released_at is null")=="34","Hold count mismatch.")
    if check_staging_schema:
        require(query(env,"select to_regnamespace('eden_staging_limits') is null")=="t","Unexpected staging schema.")
    require(query(env,"select not has_table_privilege('our_ground_api','app_private.correction_reports','select') and not has_table_privilege('our_ground_api','app_private.services','select') and has_function_privilege('our_ground_api','app_private.public_correction_insert(uuid,text,text,boolean)','execute')")=="t","Runtime ACL mismatch.")
    sample=query(env,"begin; set local role our_ground_api; select app_private.public_resource_search(21.3099,-157.8581,10,'healthcare','',1,20,false,false)->>'total'; rollback")
    require(sample.isdecimal() and int(sample) > 0, "Restricted search failed.")
    require(query(env, "select i.indisvalid and i.indisready from pg_index i where i.indexrelid=to_regclass('app_private.service_locations_point_gix')") == "t", "Spatial index missing or invalid.")
    size=int(query(env,"select pg_database_size(current_database())"))
    return {"inventory":inventory,"database_bytes":size,"headroom_vs_500MB":500_000_000-size,"postal":33791,
            "journal_digest":JOURNAL_DIGEST,"source_digest":SOURCE_DIGEST,"runtime_search":True}


ALLOWED_DATA = {
    "categories", "services", "service_locations", "service_categories", "organizations", "opening_hours",
    "resource_data_sources", "resource_import_runs", "resource_source_records", "resource_source_versions",
    "resource_privacy_holds", "resource_privacy_events", "geographic_reference_imports",
    "geographic_reference_records", "geographic_reference_names", "food_source_row_lineage", "postal_reference",
}
EXPECTED_IDS = {
    "hrsa-health-centers": "b79bbd4124a8413925a3afaafe08908665db9b7c2db7998b71ae6c80b845ed8c",
    "hud-housing-counselors": "98d252069e1e55d2c8411b2dc72a4b65ac84341b81cd004578eab9569a3a6420",
    "pgc-food-assistance": "321bfeb1f954f96752a1701f786b8dc21f0866d5b551e3670fc357ba9bb31f11",
    "philly-food-sites": "d488fbec1eaff81d533732ecd98c443c7dec0e4d8703b60b0f9c24074c78765b",
    "seattle-food-resources": "0565d12b188b9f084228167b8905566f716ef4c6ed23f4f109e90ddfa10c78c1",
}


def public_ids(env):
    rows = query(env, "select source_id,encode(sha256(string_agg(service_id::text,',' "
                      "order by service_id)::bytea),'hex') from app_private.public_resource_provenance "
                      "group by source_id order by source_id")
    return dict(row.split("|") for row in rows.splitlines())


def verified_local_export(workspace):
    # The immutable checkpoint's first independent restore, never the synthetic operations fixture.
    proof = json.loads((workspace / "docs/release/national-recovery.json").read_text())
    require(proof["restore_target"] == "ourground_rc_restore_db2fab9c" and proof["ciphertext_sha256"] == CIPHERTEXT
            and proof["streamed_dump_sha256"] == PLAINTEXT and proof["restored_sha256_matches"],
            "The local source is not the verified archive restore.")
    local = dict(pg_env(), PGHOST="127.0.0.1", PGPORT="19473", PGUSER="postgres",
                 PGDATABASE=proof["restore_target"], PGSSLMODE="disable")
    verify(local, check_staging_schema=False)
    require(public_ids(local) == EXPECTED_IDS, "Public service identities differ from the checkpoint.")
    tables = set(query(local, "select tablename from pg_tables where schemaname='app_private'").splitlines())
    excluded = sorted(tables - ALLOWED_DATA)
    require(ALLOWED_DATA <= tables and excluded == sorted(proof["private_tables_excluded"]),
            "Unrecognized tables in directory snapshot.")
    require(query(local, "select count(*) from app_private.correction_reports") == "0", "Unexpected reports.")
    command = ["pg_dump", "--no-password", "--format=custom", "--no-owner", "--no-tablespaces",
               "--schema=app_private", "--schema=our_ground_meta"]
    command.extend("--exclude-table-data=app_private." + table for table in excluded)
    return subprocess.Popen(command, stdout=subprocess.PIPE, env=local)


def main():
    p=argparse.ArgumentParser();p.add_argument("--workspace",type=Path,default=Path.cwd())
    mode=p.add_mutually_exclusive_group(required=True);mode.add_argument("--rehearse",action="store_true");mode.add_argument("--production-ref")
    p.add_argument("--verify-only",action="store_true")
    p.add_argument("--verified-local-restore",action="store_true", help="Seed from the separately verified directory-only checkpoint restore.")
    args=p.parse_args();w=args.workspace.resolve();env=target(w,args)
    require(subprocess.check_output(["git","-C",str(w),"rev-parse","HEAD"],text=True).strip()==EXPECTED_SHA,"Release workspace must be pinned.")
    require(query(env,"select current_user='postgres' and current_database()="+("'ourground_release_rehearsal'" if args.rehearse else "'postgres'"))=="t","Wrong database or owner.")
    if not args.verify_only:
        archive=Path("/Volumes/Penuel Back/Our Ground Backups")/FOLDER/"directory.dump.gpg"
        if not args.verified_local_restore:
            require(archive.is_file() and not archive.is_symlink() and hashlib.sha256(archive.read_bytes()).hexdigest()==CIPHERTEXT,"Mount the approved drive and verify the encrypted checkpoint.")
        key=w/".env.eden09-recovery-20261107T204816Z-471a209a.local"
        if not args.verified_local_restore:
            require(key.is_file() and not key.is_symlink() and not key.stat().st_mode & 0o077,"Secure recovery key unavailable.")
        # Refuse existing application schemas, public tables and conflicting roles.
        require(query(env,"select count(*) from pg_namespace where nspname in ('app_private','our_ground_meta','directory_ops','eden_staging_limits')")=="0","Target already contains application schemas.")
        require(query(env, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','f','v','m','S')") == "0", "Public relations already exist.")
        require(query(env,"select count(*) from pg_roles where rolname in ('our_ground_api','our_ground_steward')")=="0","Role collision. Inspect this target before retrying.")
        if not args.rehearse:
            require(query(env,"select not exists(select 1 from auth.users) and not exists(select 1 from storage.objects)")=="t", "Use an empty production project.")
        # -n on pg_restore filters out the SCHEMA TOC entries. Create the two
        # namespaces explicitly in the same transaction as the role and restore.
        setup = """begin;
select pg_advisory_xact_lock(hashtext('ourground-production-seed'));
create schema if not exists extensions;
create extension if not exists postgis schema extensions;
create extension if not exists unaccent schema extensions;
create extension if not exists fuzzystrmatch schema extensions;
create extension if not exists pg_trgm schema extensions;
do $$ begin
 if (select count(*) from pg_extension where extname in ('postgis','unaccent','fuzzystrmatch','pg_trgm') and extnamespace='extensions'::regnamespace) <> 4 then raise exception 'Unexpected extension schema'; end if;
end $$;
create role our_ground_api nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit;
grant our_ground_api to postgres with set true, inherit false;
create schema app_private; create schema our_ground_meta;
revoke all on schema app_private,our_ground_meta from public,anon,authenticated,service_role;
grant usage on schema extensions,app_private to our_ground_api;
"""
        harden = """revoke all on schema app_private,our_ground_meta from public,anon,authenticated,service_role;
revoke all on all tables in schema app_private,our_ground_meta from public,anon,authenticated,service_role;
revoke all on all functions in schema app_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema app_private,our_ground_meta from public,anon,authenticated,service_role;
do $$ begin
 if (select count(*) from app_private.public_resource_provenance)<>17518
 or (select count(*) from our_ground_meta.migrations)<>19
 or (select count(*) from app_private.postal_reference)<>33791
 or (select count(*) from app_private.resource_privacy_holds where released_at is null)<>34
 or has_table_privilege('our_ground_api','app_private.correction_reports','select') then raise exception 'Restored directory guard failed'; end if;
end $$; commit;
"""
        with ExitStack() as resources:
            if args.verified_local_restore:
                dec = verified_local_export(w)
            else:
                home = resources.enter_context(tempfile.TemporaryDirectory())
                k = resources.enter_context(key.open("rb"))
                dec = subprocess.Popen(["gpg", "--no-options", "--homedir", home, "--batch", "--no-tty",
                                        "--pinentry-mode", "loopback", "--no-symkey-cache", "--passphrase-fd",
                                        str(k.fileno()), "--decrypt", str(archive)],
                                       pass_fds=(k.fileno(),), stdout=subprocess.PIPE)
            unpack=subprocess.Popen(["pg_restore","--exit-on-error","--no-owner","-n","app_private","-n","our_ground_meta","--file=-"],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
            apply=subprocess.Popen(["psql","-Xq","--no-password","-v","ON_ERROR_STOP=1","-f","-"],env=env,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL)
            try:
                apply.stdin.write(setup.encode())
                h=hashlib.sha256()
                def stream_sql():
                    with unpack.stdout as sql_stream:
                        shutil.copyfileobj(sql_stream, apply.stdin)
                with ThreadPoolExecutor(max_workers=1) as worker:
                    copied = worker.submit(stream_sql)
                    try:
                        while chunk := dec.stdout.read(65536):
                            h.update(chunk)
                            unpack.stdin.write(chunk)
                    finally:
                        unpack.stdin.close()
                    copied.result()
                require(dec.wait()==0 and unpack.wait()==0,"Source export or restore stream failed.")
                if not args.verified_local_restore:
                    require(h.hexdigest()==PLAINTEXT,"Plaintext archive checksum mismatch.")
                apply.stdin.write(harden.encode());apply.stdin.close()
                require(apply.wait()==0,"Restore transaction failed.")
            finally:
                for child in (dec,unpack,apply):
                    if child.poll() is None:child.terminate()
                    child.wait()
    result = verify(env)
    require(public_ids(env) == EXPECTED_IDS, "Target public service identities differ from the checkpoint.")
    print(json.dumps(result,indent=2))

if __name__=="__main__":main()
