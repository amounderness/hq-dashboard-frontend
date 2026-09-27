"""Add dated county, combined-authority and parish geography to the canonical store.

Usage: python tools/explorer_v2/enrich_geography.py data/explorer-v2
Parish polygons are staged for Yorkshire and Humber; national parish identifiers
and council links are indexed without claiming that every parish has a poll.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services"
SERVICES = {
    "counties": ("Counties_and_Unitary_Authorities_December_2025_Boundaries_UK_BSC", 0),
    "combined": ("Combined_Authorities_December_2025_Boundaries_EN_BSC", 1),
    "parishes": ("PARNCP_DEC_2025_EW_BSC", 0),
    "county_lookup": ("LAD25_CTYUA25_UK_LU_v2", 0),
    "combined_lookup": ("LAD25_CAUTH25_EN_LU", 0),
}
YORKSHIRE = "E12000003"


def service_url(name: str) -> str:
    slug, _ = SERVICES[name]
    return f"{BASE}/{slug}/FeatureServer"


def rows(name: str, fields: str, where: str = "1=1", geometry: bool = False) -> list[dict]:
    slug, layer = SERVICES[name]
    result = []
    while True:
        query = urllib.parse.urlencode({"where": where, "outFields": fields,
            "returnGeometry": str(geometry).lower(), "outSR": 4326,
            "resultRecordCount": 1000, "resultOffset": len(result),
            "f": "geojson" if geometry else "json"})
        url = f"{BASE}/{slug}/FeatureServer/{layer}/query?{query}"
        with urllib.request.urlopen(url, timeout=90) as response:
            data = json.load(response)
        if "error" in data:
            raise RuntimeError(f"ONS {name}: {data['error']}")
        batch = data["features"]
        result.extend(batch)
        if len(batch) < 1000:
            return result


def dump(path: Path, value: object) -> str:
    content = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return hashlib.sha256(content).hexdigest()


def main(root: Path) -> None:
    db = sqlite3.connect(root / "switchboard.sqlite3")
    db.execute("PRAGMA foreign_keys=ON")
    now = datetime.now(timezone.utc).isoformat()
    council_region = dict(db.execute("SELECT area_id,region_area_id FROM area WHERE area_type='local_authority'"))
    if len(council_region) < 250:
        raise ValueError("Load the England council catalogue first")
    counties = rows("counties", "CTYUA25CD,CTYUA25NM", "CTYUA25CD LIKE 'E%'", True)
    combined = rows("combined", "CAUTH25CD,CAUTH25NM", "1=1", True)
    county_links = rows("county_lookup", "LAD25CD,CTYUA25CD")
    combined_links = rows("combined_lookup", "LAD25CD,CAUTH25CD")
    parishes = rows("parishes", "PARNCP25CD,PARNCP25NM,LAD25CD", "PARNCP25CD LIKE 'E%'", False)
    parish_codes = [row["attributes"]["PARNCP25CD"] for row in parishes]
    if len(parish_codes) != len(set(parish_codes)):
        raise ValueError("ONS parish response has duplicate area codes")
    yh_codes = [code for code, region in council_region.items() if region == YORKSHIRE]
    clause = "LAD25CD IN (" + ",".join(f"'{code}'" for code in yh_codes) + ")"
    yh_parish_geometry = rows("parishes", "PARNCP25CD,PARNCP25NM,LAD25CD", clause, True)
    data = {"counties": counties, "combined": combined, "county_lookup": county_links,
            "combined_lookup": combined_links, "parishes": parishes,
            "yorkshire_parish_geometry": yh_parish_geometry}
    hashes = {key: dump(root / "raw" / f"ons-{key}.json", value) for key, value in data.items()}
    counts = Counter()
    try:
        with db:
            for key in SERVICES:
                db.execute("INSERT OR IGNORE INTO source_record VALUES (?,?,?,?,?,?)", (
                    f"ons-{key}-2025", "Office for National Statistics", service_url(key),
                    "2025-12" if key in {"counties", "combined", "parishes"} else "2025",
                    now, hashes[key]))
            for name, records, codekey, labelkey, area_type in (
                ("counties", counties, "CTYUA25CD", "CTYUA25NM", "county_or_unitary"),
                ("combined", combined, "CAUTH25CD", "CAUTH25NM", "combined_authority")):
                for row in records:
                    p = row["properties"]
                    code = p[codekey]
                    if code in council_region:  # Unitary code is already a council area.
                        continue
                    db.execute("INSERT OR IGNORE INTO area VALUES (?,?,?,?,?,?,?)", (
                        code, area_type, p[labelkey], "E92000001", "E92000001", None, "catalogued"))
                    geo = json.dumps(row["geometry"], ensure_ascii=False, separators=(",", ":"))
                    db.execute("INSERT OR IGNORE INTO boundary_version VALUES (?,?,?,?,?,?)", (
                        f"{code}:2025-12", code, "2025-12", f"ons-{name}-2025",
                        geo, hashlib.sha256(geo.encode()).hexdigest()))
                    counts[name] += 1
            for name, records, field, relation in (
                ("county_lookup", county_links, "CTYUA25CD", "within_county_or_unitary"),
                ("combined_lookup", combined_links, "CAUTH25CD", "member_of_combined_authority")):
                for row in records:
                    p = row["attributes"]
                    child, parent = p.get("LAD25CD"), p.get(field)
                    if child not in council_region or not parent:
                        continue
                    if not db.execute("SELECT 1 FROM area WHERE area_id=?", (parent,)).fetchone():
                        counts["unmatched_parent"] += 1
                        continue
                    if child != parent:
                        db.execute("INSERT OR IGNORE INTO area_relation VALUES (?,?,?,?,?,?)", (
                            child, parent, relation, "2025-01-01", None,
                            f"ons-{name}-2025"))
                        counts["relations"] += 1
            for row in parishes:
                p = row["attributes"]
                council = p.get("LAD25CD")
                if council not in council_region:
                    counts["parishes_without_current_council"] += 1
                    continue
                code = p["PARNCP25CD"]
                db.execute("INSERT OR IGNORE INTO area VALUES (?,?,?,?,?,?,?)", (
                    code, "parish_or_non_parished_area", p["PARNCP25NM"], "E92000001",
                    council, council_region[council], "catalogued"))
                counts["parishes_indexed"] += 1
            for row in yh_parish_geometry:
                p = row["properties"]
                code = p["PARNCP25CD"]
                if not db.execute("SELECT 1 FROM area WHERE area_id=?", (code,)).fetchone():
                    raise ValueError(f"Parish geometry lacks area record: {code}")
                geo = json.dumps(row["geometry"], ensure_ascii=False, separators=(",", ":"))
                db.execute("INSERT OR IGNORE INTO boundary_version VALUES (?,?,?,?,?,?)", (
                    f"{code}:2025-12", code, "2025-12", "ons-parishes-2025",
                    geo, hashlib.sha256(geo.encode()).hexdigest()))
                counts["yorkshire_parish_boundaries"] += 1
        dump(root / "geography-enrichment-review.json", {"counts": counts,
             "source_hashes": hashes, "limitation": "Parish and non-civil-parished areas share the ONS layer; this is geography, not a register of parish councils or elections."})
        print(json.dumps(counts))
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve())
