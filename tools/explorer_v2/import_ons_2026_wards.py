"""Import the pinned ONS May 2026 Yorkshire ward edition into a working copy.

Usage: python tools/explorer_v2/import_ons_2026_wards.py WORK_ROOT
The raw GeoJSON and code snapshot live in the ignored research folder. This
does not map any election results or mutate an immutable release.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

from build_geography import compact, write_json

GEOMETRY_SHA256 = "48e49138e4c5c3f59ef1772d221b59f4c3d7d7bed418d58fa0fc78208db418c7"
CODES_SHA256 = "3fadaacf8b87d819cb2aeb539b6024a57c3966e97073d04fb955c32a0a9780b4"
SOURCE_URL = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/WD_MAY_2026_UK_BSC/FeatureServer/0/query"
SOURCE_ID = "ons-wards-2026-05"
YORKSHIRE = "E12000003"


def verified_json(path: Path, expected_hash: str) -> dict:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise ValueError(f"ONS source checksum mismatch: {path}")
    return json.loads(raw)


def main(root: Path, raw_root: Path) -> dict:
    raw_geo = raw_root / "yorkshire-wards-2026.geojson"
    raw_codes = raw_root / "yorkshire-wards-2026-codes.json"
    geo = verified_json(raw_geo, GEOMETRY_SHA256)
    codes = verified_json(raw_codes, CODES_SHA256)
    expected = {row["attributes"]["WD26CD"]: row["attributes"] for row in codes["features"]}
    if len(expected) != 411 or len(geo.get("features", [])) != 411:
        raise ValueError("Expected all 411 Yorkshire wards in both ONS snapshots")
    features = sorted(geo["features"], key=lambda row: row["properties"]["WD26CD"])
    seen = set()
    for feature in features:
        props = feature["properties"]
        code = props["WD26CD"]
        if code in seen or code not in expected or any(props[key] != expected[code][key] for key in ("WD26NM", "LAD26CD")):
            raise ValueError(f"ONS code/geometry disagreement: {code}")
        seen.add(code)
        if not feature.get("geometry"):
            raise ValueError(f"Missing geometry: {code}")
    db = sqlite3.connect(root / "switchboard.sqlite3")
    db.execute("PRAGMA foreign_keys=ON")
    try:
        with db:
            db.execute("INSERT OR IGNORE INTO source_record VALUES (?,?,?,?,?,?)", (
                SOURCE_ID, "Office for National Statistics", SOURCE_URL, "2026-05",
                datetime.now(timezone.utc).isoformat(), GEOMETRY_SHA256))
            source = db.execute("SELECT publisher,url,vintage,sha256 FROM source_record WHERE source_id=?", (SOURCE_ID,)).fetchone()
            if source != ("Office for National Statistics", SOURCE_URL, "2026-05", GEOMETRY_SHA256):
                raise ValueError("ONS 2026 source record changed")
            for feature in features:
                props = feature["properties"]
                code, authority = props["WD26CD"], props["LAD26CD"]
                council = db.execute("SELECT region_area_id FROM area WHERE area_id=? AND area_type='local_authority'", (authority,)).fetchone()
                if not council or council[0] != YORKSHIRE:
                    raise ValueError(f"Ward outside Yorkshire pilot: {code}")
                db.execute("INSERT OR IGNORE INTO area VALUES (?,?,?,?,?,?,?)", (
                    code, "ward", props["WD26NM"], "E92000001", authority, YORKSHIRE, "pilot"))
                area = db.execute("SELECT area_type,parent_area_id,region_area_id FROM area WHERE area_id=?", (code,)).fetchone()
                if area != ("ward", authority, YORKSHIRE):
                    raise ValueError(f"Ward identity conflicts with existing area: {code}")
                encoded = compact(feature["geometry"])
                boundary = (f"{code}:2026-05", code, "2026-05", SOURCE_ID, encoded,
                            hashlib.sha256(encoded.encode("utf-8")).hexdigest())
                db.execute("INSERT OR IGNORE INTO boundary_version VALUES (?,?,?,?,?,?)", boundary)
                existing = db.execute("SELECT * FROM boundary_version WHERE boundary_id=?", (boundary[0],)).fetchone()
                if existing != boundary:
                    raise ValueError(f"ONS 2026 boundary changed: {code}")
        output = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "id": row["properties"]["WD26CD"],
             "properties": {"code": row["properties"]["WD26CD"], "name": row["properties"]["WD26NM"]},
             "geometry": row["geometry"]} for row in features]}
        object_hash = write_json(root / "pilot" / "yorkshire-wards-2026.geojson", output)
        return {"source_sha256": GEOMETRY_SHA256, "source_url": SOURCE_URL,
                "code_snapshot_sha256": CODES_SHA256, "object_sha256": object_hash, "wards": len(features)}
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    working_root = Path(sys.argv[1]).resolve()
    source_root = (Path(sys.argv[2]).resolve() if len(sys.argv) == 3 else
                   working_root.parent / "raw" / "ons-yorkshire-ward-editions-2026-10-05")
    print(json.dumps(main(working_root, source_root)))
