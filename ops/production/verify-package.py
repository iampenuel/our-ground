"""Read-only comparison of the pinned archive, Vercel project link and unpacked output."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

COMMIT = "04fbdeb7793710bec14a1e6f91ca38a4916488d2"
ARCHIVE_SHA = "40c7374aac752b2ddcdb7ab100891a30afd694aec31f770920ec86a27c4d540c"
PROJECT = "prj_4li6QnqulPgPbJpxMW2L9hczDNrS"
TEAM = "team_7zBDrVIlwYth2sXkAbBPcbYw"
BROWSER_SHA = "8049ab801e1cff55b83269dd1cb0d00be029e66fd41a5661f570b8528dc00496"


def require(value, message):
    if not value:
        raise SystemExit(message)


def checksum(stream):
    digest = hashlib.sha256()
    while chunk := stream.read(128 * 1024):
        digest.update(chunk)
    return digest.hexdigest()


def file_hash(path):
    require(path.is_file() and not path.is_symlink(), f"Expected a regular file at {path}")
    with path.open("rb") as stream:
        return checksum(stream)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("checkout", type=Path)
    args = parser.parse_args()
    checkout = args.checkout.resolve()
    require(subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip() == COMMIT,
            "Checkout differs from release commit.")
    require(file_hash(args.archive) == ARCHIVE_SHA, "Archive digest differs from release receipt.")
    project = json.loads((checkout / ".vercel/project.json").read_text())
    require((project["projectName"], project["projectId"], project["orgId"]) == ("ourground", PROJECT, TEAM),
            "Wrong production project or team.")
    output = checkout / ".vercel/output"
    archived_files = set()
    with tarfile.open(args.archive, "r:gz") as archive:
        for entry in archive:
            name = Path(entry.name)
            require(not name.is_absolute() and ".." not in name.parts and name.parts[:2] == (".vercel", "output"),
                    "Unexpected archive entry.")
            if entry.isdir():
                continue
            require(entry.isfile() and name not in archived_files, "Unsupported or duplicate packaged entry.")
            archived_files.add(name)
            with archive.extractfile(entry) as stream:
                require(checksum(stream) == file_hash(checkout / name), f"Changed production file {name}")
    unpacked = list(output.rglob("*"))
    require(not any(p.is_symlink() for p in unpacked), "Unexpected symlink.")
    require({p.relative_to(checkout) for p in unpacked if p.is_file()} == archived_files, "Output files differ.")
    require(json.loads((output / "builds.json").read_text())["target"] == "production", "Wrong build target.")
    evidence = json.loads((output / "static/ourground-build-evidence.json").read_text())
    settings = evidence["public_config"]
    require(evidence["source_commit"] == COMMIT and settings["mode"] == "production" and not settings["fixture"]
            and settings["browser_auth_enabled"] is False and settings["browser_geoapify_key_sha256"] == BROWSER_SHA,
            "Public build configuration differs from pinned receipt.")
    for name, expected in evidence["assets"].items():
        require(file_hash(output / "static" / name) == expected, f"Invalid static hash {name}")
    print(json.dumps({"source": COMMIT, "project": PROJECT, "team": TEAM, "archive_sha256": ARCHIVE_SHA,
                      "target": "production", "packaged_files": len(archived_files),
                      "hashed_static_assets": len(evidence["assets"])}, indent=2))


if __name__ == "__main__":
    main()
