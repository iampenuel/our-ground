"""Private backup heartbeat and sticky absence pause for the production correction form."""
import argparse
import datetime as dt
import fcntl
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from backup import WORK, PROOF, DEST, KEY, UTC, EASTERN, atomic_json, backup, check_target, latest, require

KEYS = ["og:corrections:production:coverage", "og:corrections:production:intake"]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def command(*args):
    # Select only the already configured Redis pair and pin its verified host.
    source=WORK/".env.local"
    require(source.is_file() and not source.is_symlink() and not source.stat().st_mode & 0o077, "Owner-only Redis configuration required.")
    values={}
    for line in source.read_text().splitlines():
        name,sep,value=line.partition("=")
        if name in {"UPSTASH_REDIS_REST_URL","UPSTASH_REDIS_REST_TOKEN"} and sep:
            values[name]=value.strip().strip('"').strip("'")
    url=values.get("UPSTASH_REDIS_REST_URL","").rstrip("/")
    parts=urllib.parse.urlsplit(url)
    require(parts.scheme=="https" and parts.hostname=="glowing-grub-239584.upstash.io" and not parts.username and not parts.password and not parts.port and not parts.path and not parts.query and not parts.fragment and values.get("UPSTASH_REDIS_REST_TOKEN"),"Unexpected Redis destination.")
    req=urllib.request.Request(url,data=json.dumps(list(args)).encode(),headers={"Content-Type":"application/json","Authorization":"Bearer "+values["UPSTASH_REDIS_REST_TOKEN"]})
    client=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        with client.open(req,timeout=8) as response: data=json.load(response)
    except (OSError,ValueError): raise RuntimeError("Redis availability change was not acknowledged.") from None
    require("result" in data and "error" not in data,"Redis rejected the intake operation.")
    return data["result"]


def expire_at():
    check_target()
    receipt,_=latest()
    vault=json.loads((PROOF/"vault-verified.json").read_text())
    st=KEY.lstat()
    require(vault.get("key_inode")==st.st_ino and vault.get("key_mtime")==st.st_mtime_ns,"Verify this recovery material from the personal vault.")
    start=dt.datetime.fromisoformat(receipt["snapshot_started"]).timestamp()
    expiry=int(start+86400)
    require(start<=time.time()<expiry,"A fresh verified backup is required.")
    return expiry


PAUSE="redis.call('SET',KEYS[1],'absent'); redis.call('DEL',KEYS[2]); return 1"
UPDATE="""
local ttl=tonumber(ARGV[1])
if ttl<=0 or ttl>86400 then redis.call('DEL',KEYS[2]);return 0 end
if ARGV[2]=='resume' then redis.call('SET',KEYS[1],'present') end
if redis.call('GET',KEYS[1])~='present' then redis.call('DEL',KEYS[2]);return 0 end
redis.call('SET',KEYS[2],'monitored','EX',ttl);return 1
"""


def update(mode):
    if mode=="pause":
        command("EVAL",PAUSE,2,*KEYS)
        return "paused"
    try:
        expiry=expire_at()
    except (OSError,RuntimeError,ValueError):
        command("DEL",KEYS[1])
        raise
    # Use a relative expiry so provider/workstation clock skew cannot extend the loss window.
    opened=command("EVAL",UPDATE,2,*KEYS,int(expiry-time.time())-2,mode)
    return "open" if opened else "paused"


def nightly():
    try:
        backup()
        try:
            state=update("refresh")
        except FileNotFoundError:
            # Custody enrollment can follow the first successful backup.
            state="paused (vault check pending)"
        return state
    except (OSError,RuntimeError,ValueError):
        command("DEL",KEYS[1])
        raise


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['nightly','scheduled','pause','resume','status','refresh'])
    args=parser.parse_args()
    os.umask(0o077)
    PROOF.mkdir(mode=0o700,parents=True,exist_ok=True)
    with (PROOF/"operations.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if args.action=='status':
            current=command("MGET",*KEYS)
            print(json.dumps({"coverage":current[0] or "unassigned","intake":current[1] or "closed","seconds_remaining":command("TTL",KEYS[1])}))
            return
        if args.action=='scheduled':
            now=dt.datetime.now(EASTERN)
            # Run on wake/login as well as in the evening. Outside the evening
            # refresh window a still-fresh backup can stand until its expiry.
            try:
                check_target()
                receipt,_=latest()
                start=dt.datetime.fromisoformat(receipt["snapshot_started"])
                today=start.astimezone(EASTERN)
                due=(now.timestamp()-start.timestamp()>23*3600 or
                     ((now.hour,now.minute)>=(18,15) and (today.date()<now.date() or (today.hour,today.minute)<(18,15))))
            except (OSError,ValueError,RuntimeError):
                due=True
            if not due:
                print("Last verified checkpoint is current.")
                return
        if args.action in ('nightly','scheduled'):
            state=nightly()
        else: state=update(args.action)
        atomic_json(PROOF/'last-availability.json',{"action":args.action,"intake":state,"at":dt.datetime.now(UTC).isoformat()})
        print("Correction intake",state)


if __name__=="__main__":
    try: main()
    except (OSError,ValueError,RuntimeError) as e:
        raise SystemExit(str(e) if isinstance(e,RuntimeError) else "Correction operations unavailable: "+type(e).__name__) from None
