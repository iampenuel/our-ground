"""Create and verify a prelaunch production directory checkpoint in the private workspace.

Use from the pinned release checkout with the isolated TLS rehearsal database available.
If real corrections or operational holds exist, private operational recovery is required.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import secrets
import subprocess
import tempfile
import time
import uuid

REF = "amcqkonluwavilekgjww"


def main():
    os.umask(0o077)
    workspace = Path.cwd()
    scratch = workspace / "tmp/production-gates"
    seed = runpy.run_path(str(Path(__file__).with_name("restore.py")))
    owner = seed["target"](workspace, argparse.Namespace(rehearse=False, production_ref=REF))
    query = seed["query"]
    for table in ("app_private.correction_reports", "directory_ops.location_holds", "directory_ops.review_events"):
        if query(owner, f"select exists(select 1 from {table})") != "f":
            raise SystemExit("Private operational records exist. Use the owner-approved private backup procedure.")
    if seed["public_ids"](owner) != seed["EXPECTED_IDS"]:
        raise SystemExit("The public inventory differs from the pinned release.")
    tables = set(query(owner, "select tablename from pg_tables where schemaname='app_private'").splitlines())
    excluded = sorted(tables - seed["ALLOWED_DATA"])
    manifest = json.loads((workspace / "docs/release/national-recovery.json").read_text())
    if excluded != sorted(manifest["private_tables_excluded"]) or not seed["ALLOWED_DATA"] <= tables:
        raise SystemExit("The data exclusion inventory has changed.")
    key = workspace / ".env.production-directory-recovery.local"
    if not key.exists():
        with key.open("x") as stream:
            stream.write(secrets.token_hex(48) + "\n")
    if key.is_symlink() or key.stat().st_mode & 0o077:
        raise SystemExit("Use a private, owner-only production recovery key.")
    folder = Path(tempfile.mkdtemp(prefix="prod-directory-", dir=scratch))
    archive = folder / "directory.dump.gpg"
    started = time.monotonic()
    with tempfile.TemporaryDirectory(dir=scratch) as home, key.open("rb") as password:
        gpg = ["gpg","--no-options","--homedir",home,"--batch","--no-tty","--no-symkey-cache",
               "--pinentry-mode","loopback","--passphrase-fd",str(password.fileno())]
        dump = ["pg_dump","--no-password","-Fc","--no-owner","--no-tablespaces","--schema=app_private",
                "--schema=our_ground_meta","--schema=directory_ops","--exclude-table-data=directory_ops.*",
                *("--exclude-table-data=app_private." + t for t in excluded)]
        with subprocess.Popen(dump, env=owner, stdout=subprocess.PIPE) as source:
            try:
                subprocess.run(gpg + ["--symmetric","--cipher-algo","AES256","--output",str(archive)],
                               pass_fds=(password.fileno(),), stdin=source.stdout, check=True)
            finally:
                source.stdout.close()
            if source.wait():
                raise SystemExit("Directory export failed. Checkpoint is unverified.")
        ciphertext_sha = hashlib.sha256(archive.read_bytes()).hexdigest()
        local = seed["target"](workspace, argparse.Namespace(rehearse=True))
        database = "ourground_prod_restore_" + uuid.uuid4().hex[:8]
        query(dict(local,PGDATABASE="postgres"), "create database " + database + " template template0")
        local["PGDATABASE"] = database
        query(local, "create schema extensions; create extension postgis schema extensions; "
                     "create extension unaccent schema extensions; create extension fuzzystrmatch schema extensions; "
                     "create extension pg_trgm schema extensions; grant usage on schema extensions to our_ground_api")
        password.seek(0)
        with subprocess.Popen(gpg + ["--decrypt",str(archive)], stdout=subprocess.PIPE,
                              pass_fds=(password.fileno(),)) as source:
            try:
                subprocess.run(["pg_restore","--exit-on-error","--single-transaction","--no-owner","--dbname",database],
                               env=local, stdin=source.stdout, check=True)
            finally:
                source.stdout.close()
            if source.wait():
                raise SystemExit("Decryption failed. Checkpoint is unverified.")
        result = seed["verify"](local)
        if seed["public_ids"](local) != seed["EXPECTED_IDS"] or query(local, "select count(*) from app_private.correction_reports") != "0":
            raise SystemExit("The recovered directory or private data boundary is invalid.")
        if query(local, "select has_function_privilege('our_ground_steward','directory_ops.next_reports()','execute') "
                       "and not has_table_privilege('our_ground_steward','directory_ops.review_events','update')") != "t":
            raise SystemExit("Recovered steward permissions differ.")
    receipt = {"source_ref": REF, "scope":"directory-only prelaunch checkpoint; private table data excluded",
               "archive":str(archive.relative_to(scratch)), "ciphertext_sha256":ciphertext_sha,
               "encrypted_bytes":archive.stat().st_size, "elapsed_seconds":round(time.monotonic()-started,1),
               "restored_database":database, "restored":result, "public_id_digests_match":True, "off_device_copy":False}
    (folder / "receipt.json").write_text(json.dumps(receipt,indent=2) + "\n")
    print(json.dumps(receipt,indent=2))


if __name__ == "__main__":
    main()
