"""Open the restricted production corrections queue from the reviewer's Terminal."""
import argparse
import os
from pathlib import Path
import re
import subprocess
from uuid import UUID

REF = "amcqkonluwavilekgjww"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--connection", type=Path, default=Path(".env.production-primary-reviewer.local"))
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--show", type=UUID)
    action.add_argument("--suppress", type=UUID)
    action.add_argument("--confirm", type=UUID)
    parser.add_argument("--ticket", help="Non-personal case reference for a review decision.")
    args = parser.parse_args()
    connection = args.connection
    if not connection.is_file() or connection.is_symlink() or connection.stat().st_mode & 0o077:
        parser.error("The individual reviewer connection must be an owner-only regular file.")
    data = dict(line.split("=", 1) for line in connection.read_text().splitlines() if line)
    allowed = {"PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGSSLROOTCERT"}
    if (set(data) != allowed or data["PGHOST"] != "aws-0-us-east-1.pooler.supabase.com"
            or data["PGPORT"] != "5432" or data["PGDATABASE"] != "postgres"
            or not re.fullmatch(r"ourground_reviewer_[a-z0-9_]+\." + REF, data["PGUSER"])
            or data["PGSSLMODE"] != "verify-full"):
        parser.error("Use your individual restricted production session-pooler connection.")
    decision = args.suppress or args.confirm
    if decision and (not args.ticket or not re.fullmatch(r"[A-Za-z0-9][-A-Za-z0-9_.]{2,79}", args.ticket)):
        parser.error("A decision requires a non-personal case reference of 3 to 80 characters.")
    if args.ticket and not decision:
        parser.error("--ticket is only valid with a decision.")
    params = []
    query = "select * from directory_ops.next_reports();"
    if args.show:
        query = "select * from directory_ops.read_report(:'report'::uuid);"
        params = ["-v", f"report={args.show}"]
    if decision:
        query = "select directory_ops.resolve_report(:'report'::uuid, :'decision', :'ticket');"
        params = ["-v", f"report={decision}", "-v", "decision=" + ("suppressed" if args.suppress else "confirmed"),
                  "-v", f"ticket={args.ticket}"]
    env = {k: os.environ[k] for k in ("PATH","HOME","LANG") if k in os.environ}
    subprocess.run(["psql", "-X", "--no-password", "-v", "ON_ERROR_STOP=1", *params, "-f", "-"],
                   input="begin; set local role our_ground_steward;\n" + query + "\ncommit;\n",
                   env={**env, **data}, text=True, check=True)


if __name__ == "__main__":
    main()
