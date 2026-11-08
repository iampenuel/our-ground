"""Exercise private backup and restore using only the local synthetic fixture.

Production exports require a separate approved destination and recovery key.
This drill persists only a receipt. The new local database stays available for inspection.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
from uuid import uuid4

SCHEMAS = ["--schema=app_private", "--schema=directory_ops", "--schema=our_ground_meta"]
VERIFY = """
select json_build_object(
    'source_records', (select count(*) from app_private.public_resource_provenance),
    'source_holds', (select count(*) from app_private.resource_privacy_holds where released_at is null),
    'reviewer', e.actor, 'action', e.action, 'case', e.ticket, 'report_status', r.status,
    'location_status', l.status, 'held', h.location_id is not null,
    'associated_services', (select count(*) from app_private.services s where s.location_id=l.id),
    'runtime_read_denied', not has_table_privilege('our_ground_api','app_private.correction_reports','select'),
    'reviewer_write_denied', not has_table_privilege('our_ground_steward','directory_ops.review_events','update'),
    'reviewer_queue_granted', has_function_privilege('our_ground_steward','directory_ops.next_reports()','execute'),
    'spatial_index', to_regclass('app_private.service_locations_point_gix') is not null)
from directory_ops.review_events e
join app_private.correction_reports r on r.id=e.report_id
join app_private.service_locations l on l.id=e.location_id
left join directory_ops.location_holds h on h.location_id=l.id
where e.ticket='RELEASE-FIXTURE-001';
"""
EXPECTED = {
    "source_records": 17518, "source_holds": 34, "reviewer": "gate_reviewer_fixture",
    "action": "suppressed", "case": "RELEASE-FIXTURE-001", "report_status": "resolved",
    "location_status": "hidden", "held": True, "associated_services": 2,
    "runtime_read_denied": True, "reviewer_write_denied": True,
    "reviewer_queue_granted": True, "spatial_index": True,
}


def sql(env, statement):
    return subprocess.check_output(
        ["psql", "-XAtq", "--no-password", "-v", "ON_ERROR_STOP=1", "-c", statement],
        env=env, text=True,
    ).strip()


def stream(producer, consumer, env, pass_fd):
    with subprocess.Popen(producer, stdout=subprocess.PIPE, pass_fds=(pass_fd,), env=env) as source:
        try:
            with subprocess.Popen(consumer, stdin=source.stdout, pass_fds=(pass_fd,), env=env) as sink:
                source.stdout.close()
                consumer_status = sink.wait()
            if source.wait() or consumer_status:
                raise SystemExit("Recovery stream failed.")
        finally:
            if source.poll() is None:
                source.terminate()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    work = parser.parse_args().workspace.resolve() / "tmp/production-gates"
    cert = work / "tls/server.crt"
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG") if k in os.environ}
    env.update(PGHOST="127.0.0.1", PGPORT="19474", PGUSER="postgres",
               PGDATABASE="ourground_release_rehearsal", PGSSLMODE="verify-full", PGSSLROOTCERT=str(cert))
    if json.loads(sql(env, VERIFY)) != EXPECTED:
        raise SystemExit("Expected isolated synthetic suppression and audit fixture.")
    with tempfile.TemporaryDirectory(dir=work) as scratch, tempfile.TemporaryFile() as key:
        archive = Path(scratch) / "synthetic.dump.gpg"
        key.write(secrets.token_hex(40).encode() + b"\n")
        key.seek(0)
        gpg = ["gpg", "--no-options", "--homedir", scratch, "--batch", "--no-tty",
               "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-fd", str(key.fileno())]
        stream(["pg_dump", "--format=custom", "--no-owner", "--strict-names", *SCHEMAS],
               gpg + ["--symmetric", "--cipher-algo", "AES256", "--output", str(archive)], env, key.fileno())
        ciphertext = hashlib.sha256(archive.read_bytes()).hexdigest()
        target = "ourground_recovered_" + uuid4().hex[:12]
        sql(dict(env, PGDATABASE="postgres"), f"create database {target} template template0")
        restored = dict(env, PGDATABASE=target)
        sql(restored, "create schema extensions; create extension postgis schema extensions; "
            "create extension unaccent schema extensions; create extension fuzzystrmatch schema extensions; "
            "create extension pg_trgm schema extensions; grant usage on schema extensions to our_ground_api")
        key.seek(0)
        stream(gpg + ["--decrypt", str(archive)],
               ["pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--dbname", target],
               restored, key.fileno())
        observed = json.loads(sql(restored, VERIFY))
        if observed != EXPECTED:
            raise SystemExit("Restored operational controls or national inventory differ.")
        sql(restored, "select directory_ops.release_hold(location_id,'RESTORE-DRILL-002') "
                      "from directory_ops.location_holds where ticket='RELEASE-FIXTURE-001'")
        hidden = sql(restored, "select l.status from app_private.service_locations l "
                               "join directory_ops.review_events e on e.location_id=l.id where e.ticket='RESTORE-DRILL-002'")
        if hidden != "hidden":
            raise SystemExit("Release of a hold unexpectedly made the location public.")
        receipt = {"environment": "isolated local TLS rehearsal, synthetic private data",
                   "ciphertext_sha256": ciphertext, "encrypted_bytes": archive.stat().st_size,
                   "restored_database": target, "preserved": observed, "after_owner_release": hidden}
        (work / "recovery-drill.json").write_text(json.dumps(receipt, indent=2) + "\n")
        print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
