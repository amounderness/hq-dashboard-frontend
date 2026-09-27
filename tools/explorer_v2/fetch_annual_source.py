"""Download and verify the immutable secondary annual-results snapshot.

Usage: python tools/explorer_v2/fetch_annual_source.py data/explorer-v2
"""

from __future__ import annotations

import hashlib
import sys
import urllib.request
from pathlib import Path

from import_annual_results import EXPECTED_SHA256

URL = "https://raw.githubusercontent.com/fsargent/electionresults.uk/29f587a2e761357c34cb828b0204861d8ec1c015/data-export/results.sqlite"


def main(root: Path) -> None:
    target = root / "raw" / "electionresults-2026-06-04.sqlite"
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest() != EXPECTED_SHA256:
            raise ValueError("Existing source file has the wrong checksum")
        print(f"Verified existing source: {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(URL, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != EXPECTED_SHA256:
        raise ValueError("Downloaded source checksum does not match the pinned snapshot")
    target.write_bytes(data)
    print(f"Downloaded and verified: {target}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve())
