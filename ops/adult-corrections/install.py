"""Install or update the logged-in operator's nightly macOS backup job."""
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
from backup import WORK, PROOF, PATH_ENV, require

LABEL="org.ourground.private-corrections"


def main():
    os.umask(0o077)
    runtime=PROOF/"runtime"
    runtime.mkdir(exist_ok=True,mode=0o700,parents=True)
    here=Path(__file__).resolve().parent
    for name in ("backup.py","availability.py"):
        target=runtime/name
        if (here/name)!=target:
            staged=target.with_suffix(".new")
            shutil.copyfile(here/name,staged)
            os.replace(staged,target)
    plist=Path.home()/"Library/LaunchAgents"/(LABEL+".plist")
    program={"Label":LABEL,"ProgramArguments":["/opt/homebrew/bin/python3",str(runtime/"availability.py"),"scheduled"],
             "WorkingDirectory":str(WORK),"RunAtLoad":True,"StartCalendarInterval":{"Hour":18,"Minute":15},
             "StartInterval":3600,"ProcessType":"Background","Umask":0o077,
             "EnvironmentVariables":{"PATH":PATH_ENV,"LANG":"C","TZ":"America/New_York"},
             "StandardOutPath":str(PROOF/"nightly.log"),"StandardErrorPath":str(PROOF/"nightly-errors.log")}
    require(not plist.is_symlink(),"Unexpected LaunchAgent path.")
    domain=f"gui/{os.getuid()}"
    loaded=subprocess.run(["launchctl","print",domain+"/"+LABEL],capture_output=True).returncode==0
    if loaded:
        previous=plistlib.loads(plist.read_bytes())
        require(previous.get("Label")==LABEL and previous.get("ProgramArguments")[-2:]==program["ProgramArguments"][-2:],"Unexpected installed job.")
        subprocess.run(["launchctl","bootout",domain+"/"+LABEL],check=True,capture_output=True)
    plist.parent.mkdir(exist_ok=True,parents=True)
    stage=plist.with_suffix(".new")
    with stage.open("wb") as out: plistlib.dump(program,out)
    os.replace(stage,plist)
    subprocess.run(["launchctl","bootstrap",domain,str(plist)],check=True,capture_output=True)
    require(subprocess.run(["launchctl","print",domain+"/"+LABEL],capture_output=True).returncode==0,"Backup job was not registered.")
    print("Installed nightly backup at 18:15 local time with hourly wake/login catch-up.")


if __name__=="__main__":
    try: main()
    except (OSError,RuntimeError,subprocess.SubprocessError) as e:
        raise SystemExit(str(e) if isinstance(e,RuntimeError) else "Installation failed: "+type(e).__name__) from None
