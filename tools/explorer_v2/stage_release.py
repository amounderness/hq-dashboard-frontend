"""Create an immutable, locally staged Explorer v2 release after verification.

Usage: python tools/explorer_v2/stage_release.py data/explorer-v2 explorer-v2-yh-2026-09-27-rc1
This never activates a Cloudflare pointer or changes the live Switchboard site.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from verify_pilot_package import check

ID = re.compile(r"^[a-z0-9][a-z0-9.-]{0,79}$")


def main(root: Path, release_id: str) -> None:
    if not ID.fullmatch(release_id):
        raise ValueError("Release ID must be lowercase letters, digits, dots or hyphens")
    pilot = root / "pilot"
    summary = check(pilot)
    target = root / "releases" / release_id
    if target.exists():
        raise FileExistsError(f"Immutable release already exists: {target}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(pilot, target)
    manifest_path = target / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["package_id"] = release_id
    manifest["created_at"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(json.dumps(manifest, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        if check(target) != summary:
            raise ValueError("Staged release differs from verified pilot")
        digest = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        db = sqlite3.connect(root / "switchboard.sqlite3")
        try:
            with db:
                db.execute("INSERT INTO release_record VALUES (?,?,?,?,?,?)", (
                    release_id, 1, "E12000003", manifest["created_at"], digest,
                    "staged_not_published"))
        finally:
            db.close()
    except Exception:
        # Preserve a failed copy for diagnosis; never remove a computed directory.
        raise
    print(json.dumps({"release_id": release_id, "manifest_sha256": digest,
                      "status": "staged_not_published", "summary": summary}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve(), sys.argv[2])
