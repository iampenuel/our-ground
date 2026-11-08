"""Collect an independent production owner connection in the operator's Terminal."""
import getpass
import os
from pathlib import Path
import re
import sys
from urllib.parse import quote

EXISTING_PROJECTS = {"hrmocmvdmshoghclxyjs", "cvliqzfxqennzdajbejk", "oecwyjnfrjttyuyrronv"}


def main():
    if not sys.stdin.isatty():
        sys.exit("Run this command in your own interactive Terminal.")
    ref = input("Production project ref from Supabase Project Settings: ").strip()
    host = input("Session pooler hostname from the production Connect panel: ").strip()
    if not re.fullmatch(r"[a-z0-9]{20}", ref) or ref in EXISTING_PROJECTS:
        sys.exit("A separate production project is required.")
    if not re.fullmatch(r"aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com", host):
        sys.exit("Use the session pooler hostname from the independent production project.")
    cert = Path(input("Path to the production Server root certificate: ").strip()).expanduser().resolve(strict=True)
    if "\n" in str(cert) or "\r" in str(cert) or "-----BEGIN CERTIFICATE-----" not in cert.read_text():
        sys.exit("Expected a PEM CA certificate.")
    password = getpass.getpass("Production database password (hidden): ")
    if not password or password != getpass.getpass("Repeat production password (hidden): "):
        sys.exit("Passwords do not match.")
    dest = Path(__file__).resolve().parents[2] / ".env.production-owner.local"
    os.umask(0o077)
    with dest.open("x") as private:
        private.write(f"PRODUCTION_PROJECT_REF={ref}\n"
                      f"PRODUCTION_OWNER_URL=postgresql://postgres.{ref}:{quote(password, safe='')}@{host}:5432/postgres\n"
                      f"PRODUCTION_CA_FILE={cert}\n")
    print("Saved the owner connection locally. Only the project ref is needed in chat.")


if __name__ == "__main__":
    main()
