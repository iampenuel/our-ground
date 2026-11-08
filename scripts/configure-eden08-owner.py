"""Privately set the EDEN-08 staging migration connection from an interactive Mac terminal."""
from getpass import getpass
from pathlib import Path
import os
import re
import sys
import tempfile
from urllib.parse import quote

REF = "hrmocmvdmshoghclxyjs"
HOST = "aws-0-us-east-1.pooler.supabase.com"
FILE = Path(__file__).resolve().parents[1] / ".env.eden08-owner.local"


def main():
    if not sys.stdin.isatty() or not sys.stderr.isatty():
        sys.exit("Run this from an interactive terminal; do not pass a password as an argument.")
    if FILE.is_symlink() or not FILE.is_file() or FILE.stat().st_mode & 0o077:
        sys.exit("The private staging template must be an existing owner-only regular file.")
    text = FILE.read_text()
    lines = text.splitlines(keepends=True)
    def assignments(key):
        return [i for i, line in enumerate(lines)
                if re.match(rf"^[ \t]*(?:export[ \t]+)?{key}[ \t]*=", line)]
    for key, value in (("SUPABASE_DEV_PROJECT_REF", REF), ("SUPABASE_URL", f"https://{REF}.supabase.co")):
        if [lines[i].rstrip("\n") for i in assignments(key)] != [f"{key}={value}"]:
            sys.exit(f"{key} must uniquely identify the staging project. No change.")
    key = "MIGRATION_DATABASE_URL"
    entries = assignments(key)
    # Match only the exact two dashboard placeholder spellings. A raw [ or ]
    # in userinfo is not accepted by Python's generic URL splitter.
    templates = {f"{scheme}://postgres.{REF}:{password}@{HOST}:5432/postgres"
                 for scheme in ("postgres", "postgresql")
                 for password in ("[YOUR-PASSWORD]", "%5BYOUR-PASSWORD%5D")}
    blanks, placeholders = [], []
    for i in entries:
        if not lines[i].startswith(key + "="):
            sys.exit("Unrecognized connection assignment. No change.")
        raw = lines[i].rstrip("\n").partition("=")[2]
        if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'":
            raw = raw[1:-1]
        if raw == "":
            blanks.append(i)
        elif raw in templates:
            placeholders.append(i)
        else:
            sys.exit("An existing credential or unrecognized target was found. No change.")
    if not entries or len(blanks) > 1 or len(placeholders) > 1:
        sys.exit("Expected one empty entry, one staging placeholder, or one of each. No change.")
    entry = (placeholders or blanks)[0]
    secret = getpass("ourground-staging database password (hidden): ")
    if secret in ("[YOUR-PASSWORD]", "%5BYOUR-PASSWORD%5D"):
        sys.exit("That is the dashboard placeholder. No change.")
    if not secret or secret != getpass("Repeat staging password (hidden): "):
        sys.exit("The two entries must match and cannot be empty. No change.")
    uri = f"postgresql://postgres.{REF}:{quote(secret, safe='')}@{HOST}:5432/postgres"
    lines[entry] = f"{key}={uri}\n"
    updated = "".join(line for i, line in enumerate(lines) if i == entry or i not in blanks)
    fd, temp = tempfile.mkstemp(prefix=".env.eden08-owner-", suffix=".local", dir=FILE.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        if FILE.is_symlink() or FILE.read_text() != text:
            sys.exit("Template changed during entry. No change.")
        os.replace(temp, FILE)
    finally:
        Path(temp).unlink(missing_ok=True)
    print("Staging owner connection saved privately. No connection was opened.")


if __name__ == "__main__":
    main()
