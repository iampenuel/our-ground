"""Confirm exactly one identified synthetic candidate report using the restricted reviewer."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
from uuid import UUID
from backup import WORK, PROOF, CLEAN, REF, UTC, atomic_json, require, sql


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report",type=UUID)
    parser.add_argument("--marker",required=True,help="Exact non-personal synthetic release-test description")
    args=parser.parse_args()
    # Do not consume live resident reports or echo any returned report content.
    require(5<=len(args.marker)<=160 and args.marker.lower().startswith("synthetic") and
            re.fullmatch(r"[a-zA-Z0-9 .:-]+",args.marker),"Use the exact non-personal synthetic test marker.")
    src=WORK/".env.production-primary-reviewer.local"
    require(src.is_file() and not src.is_symlink() and not src.stat().st_mode & 0o077,"Restricted reviewer connection is unavailable.")
    cfg=dict(line.split("=",1) for line in src.read_text().splitlines() if line)
    require(set(cfg)=={"PGHOST","PGPORT","PGDATABASE","PGUSER","PGPASSWORD","PGSSLMODE","PGSSLROOTCERT"} and
            cfg["PGHOST"]=="aws-0-us-east-1.pooler.supabase.com" and cfg["PGPORT"]=="5432" and cfg["PGDATABASE"]=="postgres"
            and cfg["PGUSER"]=="ourground_reviewer_penuel."+REF and cfg["PGSSLMODE"]=="verify-full","Unexpected reviewer identity.")
    env={**CLEAN,**cfg}
    uid=str(args.report)
    prefix="begin; set local role our_ground_steward; "
    visible=sql(env,prefix+"select json_build_object('in_queue',exists(select 1 from directory_ops.next_reports() where report_id='"
                +uid+"'::uuid),'matching',exists(select 1 from directory_ops.read_report('"+uid+"'::uuid) where description='"+args.marker
                +"' and status='open'),'raw_denied',not has_table_privilege(current_user,'app_private.correction_reports','select')); commit;")
    observed=json.loads(visible)
    require(all(observed.values()),"The named synthetic report is not safely reviewable; no report was changed.")
    sql(env,prefix+"select directory_ops.resolve_report('"+uid+"'::uuid,'confirmed','ADULT-RC-CHECK'); commit;")
    state=sql(env,prefix+"select status from directory_ops.read_report('"+uid+"'::uuid); commit;")
    require(state=="resolved","Synthetic review was not confirmed.")
    atomic_json(PROOF/"synthetic-review.json",{"report_id":uid,"queue_visible":True,"matching_synthetic_marker":True,
                "direct_private_table_read_denied":True,"reviewer":"ourground_reviewer_penuel","decision":"confirmed",
                "ticket":"ADULT-RC-CHECK","target":"independent production","at":dt.datetime.now(UTC).isoformat()})
    print("PASS: restricted reviewer found and confirmed the named synthetic report.")


if __name__=="__main__":
    os.umask(0o077)
    try: main()
    except (OSError,ValueError,RuntimeError) as e:
        raise SystemExit(str(e) if isinstance(e,RuntimeError) else "Synthetic verification unavailable.") from None
