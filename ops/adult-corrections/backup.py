"""Back up only the approved private directory tables. All plaintext streams stay in pipes."""
import argparse
import contextlib
import datetime as dt
import fcntl
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import stat
import subprocess
import tempfile
import warnings
from zoneinfo import ZoneInfo
from uuid import UUID

WORK = Path("/Users/admin/Documents/Projects/our-ground")
LAB = WORK / "tmp/production-gates"
PROOF = WORK / "tmp/adult-release/corrections"
MOUNT = Path("/Volumes/Penuel Back")
BACKUPS = MOUNT / "Our Ground Backups"
DIRECTORY = BACKUPS / "production-directory-20261108T033638Z/directory.dump.gpg"
BASE_SHA = "d3504ee9bf740cadb09e239d786aaa0f6cc973a0e975e244705e9b4ed1f1143c"
DEST = BACKUPS / "private-corrections"
KEY = WORK / ".env.production-private-reports-recovery.local"
DIRECTORY_KEY = WORK / ".env.production-directory-recovery.local"
REF = "amcqkonluwavilekgjww"
TABLES = (
    ("app_private.correction_reports", "id"),
    ("directory_ops.review_events", "id"),
    ("directory_ops.location_holds", "location_id"),
    ("app_private.resource_privacy_holds", "source_id,source_record_id"),
    ("app_private.resource_privacy_events", "id"),
)
UTC = dt.timezone.utc
EASTERN = ZoneInfo("America/New_York")
PATH_ENV = "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
CLEAN = {"PATH": PATH_ENV, "LC_ALL":"C", "HOME": str(Path.home())}


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def check_target():
    require(MOUNT.is_mount() and MOUNT.resolve() == MOUNT and BACKUPS.resolve() == BACKUPS, "Mount the original Penuel Back volume.")
    require(DIRECTORY.is_file() and DIRECTORY.resolve() == DIRECTORY and digest(DIRECTORY) == BASE_SHA, "Directory checkpoint identity or checksum mismatch.")
    DEST.mkdir(mode=0o700, exist_ok=True)
    require(DEST.is_dir() and DEST.resolve() == DEST and DEST.stat().st_dev == MOUNT.stat().st_dev, "Invalid private backup destination.")


def open_key(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    s = os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o077 or s.st_nlink != 1 or s.st_size < 32:
        os.close(fd)
        raise RuntimeError("Recovery material must be an existing owner-only regular file.")
    return os.fdopen(fd, "rb")


def init_key():
    check_target()
    if KEY.exists():
        with open_key(KEY):
            return
    require(not any(DEST.iterdir()), "An archive exists; recover its original secret instead of creating one.")
    fd = os.open(KEY, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(secrets.token_hex(48).encode() + b"\n")
        f.flush()
        os.fsync(f.fileno())


def atomic_json(path, value):
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as f:
        json.dump(value, f, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(f.name, path)


def safe_run(cmd, *, env=CLEAN):
    p = subprocess.run(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
    require(p.returncode == 0, f"{Path(cmd[0]).name} failed.")
    return p.stdout.decode().strip()


def sql(env, statement):
    return safe_run(["psql","-XAtq","--no-password","-v","ON_ERROR_STOP=1","-c",statement], env=env)


def state_sql():
    tables = []
    for table, ordering in TABLES:
        tables.append(f"'{table}',(select json_build_array(count(*),encode(sha256(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by {ordering}), '')::bytea),'hex')) from {table} t)")
    tables += ["'public',(select json_build_array(count(*),encode(sha256(coalesce(string_agg(service_id::text,',' order by service_id),'')::bytea),'hex')) from app_private.public_resource_provenance)",
               "'active_source_holds',(select count(*) from app_private.resource_privacy_holds where released_at is null)",
               "'unexpected_retention_holds',(select count(*) from app_private.privacy_retention_holds)",
               "'acl',not has_table_privilege('our_ground_api','app_private.correction_reports','select') and not has_table_privilege('our_ground_steward','directory_ops.review_events','update') and has_function_privilege('our_ground_steward','directory_ops.next_reports()','execute')"]
    return "select json_build_object(" + ",".join(tables) + ")"


@contextlib.contextmanager
def snapshot(owner):
    with subprocess.Popen(["psql","-XAtq","--no-password","-v","ON_ERROR_STOP=1"], env=owner, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1) as p:
        try:
            p.stdin.write("begin isolation level repeatable read read only;\nselect pg_export_snapshot();\n"+state_sql()+";\n")
            p.stdin.flush()
            sid = p.stdout.readline().strip()
            require(re.fullmatch(r"[0-9A-F]+-[0-9A-F]+-[0-9]+",sid), "Production snapshot unavailable.")
            source = json.loads(p.stdout.readline())
            require(source["acl"] and not source["unexpected_retention_holds"],"Review recovery scope for changed ACLs or retention holds before backing up.")
            yield sid, source
        finally:
            p.stdin.close()
            p.wait(timeout=10)


@contextlib.contextmanager
def isolated_gpg(password):
    with tempfile.TemporaryDirectory(prefix="og-private-gpg-",dir="/private/tmp") as home:
        common = ["gpg","--homedir",home,"--no-options","--no-tty","--batch","--no-symkey-cache","--pinentry-mode","loopback","--passphrase-fd",str(password.fileno())]
        try:
            yield common
        finally:
            subprocess.run(["gpgconf","--homedir",home,"--kill","gpg-agent"],env=CLEAN,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


def stream(source_args, sink_args, source_env, sink_env, fd):
    with subprocess.Popen(source_args, env=source_env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, pass_fds=(fd,)) as source:
        try:
            with subprocess.Popen(sink_args, env=sink_env, stdin=source.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, pass_fds=(fd,)) as sink:
                source.stdout.close()
                sink_status = sink.wait()
            require(source.wait()==0 and sink_status==0, "Encrypted export or verified restore stream failed.")
        finally:
            if source.poll() is None:
                source.terminate()


def encrypt(owner, sid, output):
    with open_key(KEY) as f, isolated_gpg(f) as gpg:
        dump=["pg_dump","-Fc","--strict-names","--data-only","--no-owner","--no-privileges","--no-password","--snapshot="+sid]
        for table,_ in TABLES:
            dump += ["--table="+table]
        stream(dump,gpg+["--symmetric","--cipher-algo","AES256","--output",str(output)],owner,CLEAN,f.fileno())


def unpack(local, encrypted, secret, *, data_only=False):
    with open_key(secret) as password, isolated_gpg(password) as gpg:
        args = ["pg_restore","--exit-on-error","--single-transaction","--no-owner","--no-password","--dbname",local["PGDATABASE"]]
        if data_only:
            args.append("--data-only")
        stream(gpg+["--output","-","--decrypt",str(encrypted)],args,CLEAN,local,password.fileno())


@contextlib.contextmanager
def restore_target():
    # The private drill never starts the shared rehearsal cluster. Only this OS
    # user's private Unix socket can reach the new server. Its data and WAL are
    # removed together after a clean shutdown.
    with tempfile.TemporaryDirectory(prefix="og-private-restore-",dir="/private/tmp") as temp:
        root=Path(temp)
        cluster=root/"data"
        sockets=root/"socket"
        sockets.mkdir(mode=0o700)
        safe_run(["initdb","-D",str(cluster),"-U","postgres","--encoding=UTF8","--locale=C",
                  "--auth-local=trust","--auth-host=reject","--no-instructions"])
        safe_run(["pg_ctl","-w","-D",str(cluster),"-l",str(root/"postgres.log"),
                  "-o",f"-c listen_addresses='' -p 19476 -k '{sockets}' -c unix_socket_permissions=0700","start"])
        try:
            local=dict(CLEAN,PGHOST=str(sockets),PGPORT="19476",PGDATABASE="postgres",PGUSER="postgres",
                       PGOPTIONS="-c timezone=UTC -c datestyle=ISO,YMD")
            require(sql(local,"select inet_server_addr() is null and current_setting('listen_addresses')='' and current_user='postgres'")=="t","Unexpected restore server.")
            sql(local,"create role our_ground_api nologin; create role our_ground_steward nologin; create role anon nologin; create role authenticated nologin; create role service_role nologin;")
            sql(local,"create schema extensions; create extension postgis schema extensions; create extension unaccent schema extensions; create extension fuzzystrmatch schema extensions; create extension pg_trgm schema extensions; grant usage on schema extensions to our_ground_api")
            yield local
        finally:
            safe_run(["pg_ctl","-w","-D",str(cluster),"-m","fast","stop"])


def state_digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(",",":")).encode()).hexdigest()


def verify_restore(expected_hash, encrypted, case=None):
    with restore_target() as local:
        unpack(local,DIRECTORY,DIRECTORY_KEY)
        sql(local,"truncate "+", ".join(t for t,_ in TABLES))
        unpack(local,encrypted,KEY,data_only=True)
        # Operational suppression affects the location shared by every colocated service.
        # Reconstruct suppression from the audit even after an owner releases its hold.
        sql(local,"update app_private.service_locations l set status='hidden' where exists(select 1 from directory_ops.review_events e where e.location_id=l.id and e.action='suppressed')")
        restored=json.loads(sql(local,state_sql()))
        require(state_digest(restored)==expected_hash, "The recovered private rows, holds, permissions or published identities differ from the snapshot.")
        for table in ("app_private.resource_privacy_events","directory_ops.review_events"):
            sequence_ok=sql(local,f"select not exists(select 1 from {table}) or coalesce(pg_sequence_last_value(pg_get_serial_sequence('{table}','id')::regclass)>=(select max(id) from {table}),false)")
            require(sequence_ok=="t","The event sequence did not recover safely.")
        if case is not None:
            uid=str(case)
            require(json.loads((PROOF/"synthetic-review.json").read_text())["report_id"]==uid,"Expected the individually reviewed synthetic report.")
            match=sql(local,"select count(*) from app_private.correction_reports r join directory_ops.review_events e on r.id=e.report_id where r.id='"
                      +uid+"'::uuid and r.status='resolved' and e.actor='ourground_reviewer_penuel' and e.action='confirmed' and e.ticket='ADULT-RC-CHECK'")
            require(match=="1","Named synthetic review missing or duplicated in restored data.")
            atomic_json(PROOF/"synthetic-restore.json",{"report_id":uid,"recognized_reviewer":True,"confirmed_and_recovered":True,"archive_sha256":digest(encrypted)})
        require(sql(local,"select (select count(*) from app_private.app_users)=0 and (select count(*) from app_private.organization_claims)=0 and (select count(*) from app_private.organization_memberships)=0")=="t","An account or claim row appeared in the isolated restore.")


def prune():
    daily=sorted((p for p in DEST.iterdir() if re.fullmatch(r"\d{4}-\d\d-\d\d\.dump\.gpg",p.name)),key=lambda p:p.name,reverse=True)
    cutoff=dt.datetime.now(EASTERN).date()-dt.timedelta(days=29)
    for index,old in enumerate(daily):
        if index<30 and dt.date.fromisoformat(old.name[:10])>=cutoff: continue
        require(old.resolve()==old and old.is_file(),"Unexpected retention path.")
        old.unlink()
        for suffix in (".sha256",".proof.json"):
            sidecar=old.with_suffix(old.suffix+suffix)
            if sidecar.exists():
                require(sidecar.resolve()==sidecar and sidecar.is_file(),"Unexpected retention sidecar.")
                sidecar.unlink()


def latest():
    receipt=json.loads((PROOF/"last-verified.json").read_text())
    name=receipt["file"]
    require(re.fullmatch(r"\d{4}-\d\d-\d\d\.dump\.gpg",name) and digest(DEST/name)==receipt["sha256"],"Latest ciphertext differs from verified receipt.")
    return receipt,DEST/name


def backup(case=None):
    check_target()
    with open_key(KEY):
        pass
    seed=runpy.run_path(str(WORK/"ops/production/restore.py"))
    owner=seed["target"](WORK,argparse.Namespace(rehearse=False,production_ref=REF))
    owner.update(PATH=PATH_ENV,PGOPTIONS="-c default_transaction_read_only=on -c timezone=UTC -c datestyle=ISO,YMD")
    now=dt.datetime.now(UTC)
    path=DEST/(now.astimezone(EASTERN).strftime("%Y-%m-%d")+".dump.gpg")
    require(path.resolve()==path,"Unexpected destination path.")
    with tempfile.TemporaryDirectory(prefix=".in-progress-",dir=DEST) as work:
        tmp=Path(work)/"corrections.dump.gpg"
        with snapshot(owner) as (sid,source):
            encrypt(owner,sid,tmp)
        original=digest(tmp)
        fingerprint=state_digest(source)
        verify_restore(fingerprint,tmp,case)
        with tmp.open("rb") as f: os.fsync(f.fileno())
        os.replace(tmp,path)
        require(digest(path)==original,"Off-device checksum mismatch after rename.")
        checkfile=path.with_suffix(path.suffix+".sha256")
        checksum=Path(work)/"checksum"
        with checksum.open("x") as check:
            check.write(original+"  "+path.name+"\n");check.flush();os.fsync(check.fileno())
        os.replace(checksum,checkfile)
        require(checkfile.read_text()==original+"  "+path.name+"\n","Off-device checksum receipt mismatch.")
        receipt={"source_ref":REF,"scope":[name for name,_ in TABLES],"snapshot_started":now.isoformat(),
                 "restored_at":dt.datetime.now(UTC).isoformat(),"directory_sha256":BASE_SHA,"file":path.name,
                 "sha256":original,"bytes":path.stat().st_size,"counts":{t:source[t][0] for t,_ in TABLES},
                 "published_ids":source["public"][0],"active_source_holds":source["active_source_holds"],
                 "private_rows_match":True,"acl_verified":True,"no_account_rows":True}
        attestation={"archive_sha256":original,"directory_sha256":BASE_SHA,"restored_state_sha256":fingerprint,
                     "source_ref":REF,"snapshot_started":receipt["snapshot_started"]}
        proof_path=path.with_suffix(path.suffix+".proof.json")
        atomic_json(proof_path,attestation)
        require(json.loads(proof_path.read_text())==attestation,"Off-device verification receipt mismatch.")
        prune()
        atomic_json(PROOF/"last-verified.json",receipt)
        print("Verified encrypted backup and isolated restore:",path.name)


def rehearse(day):
    check_target()
    date=dt.date.fromisoformat(day)
    path=DEST/(date.isoformat()+".dump.gpg")
    proof=path.with_suffix(path.suffix+".proof.json")
    require(path.resolve()==path and proof.resolve()==proof,"Invalid restore path.")
    facts=json.loads(proof.read_text())
    require(facts["source_ref"]==REF and facts["directory_sha256"]==BASE_SHA and facts["archive_sha256"]==digest(path),"Restore artifact does not match its verified receipt.")
    verify_restore(facts["restored_state_sha256"],path)
    print("PASS: isolated replay reproduced the verified private checkpoint",date.isoformat())


def verify_value(password,receipt,archive):
    with isolated_gpg(password) as gpg:
        p=subprocess.run(gpg+["--status-fd","2","--output","-","--decrypt",str(archive)],env=CLEAN,pass_fds=(password.fileno(),),stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        statuses={row.split()[1] for row in p.stderr.splitlines() if row.startswith(b"[GNUPG:] ") and len(row.split())>1}
        require(p.returncode==0 and {b"DECRYPTION_OKAY",b"END_DECRYPTION"}<=statuses,"Vault decryption failed.")
    st=KEY.lstat()
    atomic_json(PROOF/"vault-verified.json",{"file":receipt["file"],"verified":dt.datetime.now(UTC).isoformat(),"archive_sha256":receipt["sha256"],"key_inode":st.st_ino,"key_mtime":st.st_mtime_ns})
    print("PASS: fresh personal-vault value decrypted the verified archive.")


def vault_clipboard(generation):
    check_target()
    receipt,archive=latest()
    reader,writer=os.pipe()
    with os.fdopen(reader,"rb") as password:
        with os.fdopen(writer,"wb") as stream:
            p=subprocess.run([str(PROOF/"private-transfer"),"retrieve-to-pipe",str(generation),str(stream.fileno())],pass_fds=(stream.fileno(),),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        require(p.returncode==0,"A fresh Copy Password from the named private corrections entry is needed.")
        verify_value(password,receipt,archive)


def vault_verify():
    check_target()
    receipt,archive=latest()
    require(os.isatty(0),"Run this vault check in your own Terminal.")
    with warnings.catch_warnings():
        warnings.simplefilter("error",getpass.GetPassWarning)
        value=getpass.getpass("Paste the passphrase copied from the saved personal vault entry (hidden): ")
    require(0<len(value)<=512 and "\n" not in value,"Invalid passphrase input.")
    read,write=os.pipe()
    with os.fdopen(write,"wb") as out:out.write(value.encode()+b"\n")
    del value
    with os.fdopen(read,"rb") as password:
        verify_value(password,receipt,archive)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action",choices=("init-key","backup","rehearse","verify-vault","verify-vault-copy"))
    parser.add_argument("--before-copy",type=int)
    parser.add_argument("--check-synthetic",type=UUID)
    parser.add_argument("--day",help="Local ISO date of the private archive to replay")
    args=parser.parse_args()
    action=args.action
    if action=="rehearse" and not args.day: parser.error("Specify --day YYYY-MM-DD.")
    if action=="verify-vault-copy" and (args.before_copy is None or args.before_copy<0): parser.error("Supply the clipboard counter recorded before Copy Password.")
    os.umask(0o077)
    PROOF.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(PROOF,0o700)
    with (PROOF/"operations.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        {"init-key":init_key,"backup":lambda:backup(args.check_synthetic),"rehearse":lambda:rehearse(args.day),"verify-vault":vault_verify,"verify-vault-copy":lambda:vault_clipboard(args.before_copy)}[action]()


if __name__=="__main__":
    try: main()
    except (RuntimeError,OSError,ValueError,subprocess.SubprocessError) as e:
        raise SystemExit(str(e) if isinstance(e,RuntimeError) else "Backup unavailable: "+type(e).__name__) from None
