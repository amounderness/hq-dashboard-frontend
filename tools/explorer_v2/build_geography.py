"""Build a dated England geography store from ONS Feature Services.

Usage: python tools/explorer_v2/build_geography.py data/explorer-v2
The output is local staging, never an automatically published site release.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services"
SERVICES = {
    "regions": "Regions_December_2025_Boundaries_EN_BSC",
    "authorities": "Local_Authority_Districts_DEC_2025_Boundaries_UK_BSC",
    "wards": "WD_MAY_2025_UK_BSC_V2",
    "lookup": "LAD25_RGN25_EN_LU_v2",
}
YORKSHIRE = "E12000003"


def request(service: str, *, fields: str, where: str, geometry: bool) -> dict:
    params = urllib.parse.urlencode({
        "where": where, "outFields": fields, "returnGeometry": str(geometry).lower(),
        "outSR": 4326, "f": "geojson" if geometry else "json",
        "resultRecordCount": 1000, "resultOffset": request.offset,
    })
    url = f"{BASE}/{SERVICES[service]}/FeatureServer/0/query?{params}"
    with urllib.request.urlopen(url, timeout=90) as response:
        data = json.load(response)
    if "error" in data:
        raise RuntimeError(f"ONS {service}: {data['error']}")
    return data


request.offset = 0


def all_rows(service: str, fields: str, where: str, geometry: bool) -> list[dict]:
    rows = []
    while True:
        request.offset = len(rows)
        data = request(service, fields=fields, where=where, geometry=geometry)
        batch = data["features"]
        rows.extend(batch)
        if len(batch) < 1000:
            return rows


def compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def write_json(path: Path, value: object) -> str:
    content = (compact(value) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return hashlib.sha256(content).hexdigest()


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS source_record (
  source_id TEXT PRIMARY KEY, publisher TEXT NOT NULL, url TEXT NOT NULL,
  vintage TEXT NOT NULL, retrieved_at TEXT NOT NULL, sha256 TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS area (
  area_id TEXT PRIMARY KEY, area_type TEXT NOT NULL, name TEXT NOT NULL,
  country_code TEXT NOT NULL, parent_area_id TEXT REFERENCES area(area_id),
  region_area_id TEXT REFERENCES area(area_id), status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS area_parent_idx ON area(parent_area_id);
CREATE INDEX IF NOT EXISTS area_region_idx ON area(region_area_id);
CREATE TABLE IF NOT EXISTS area_relation (
  child_area_id TEXT NOT NULL REFERENCES area(area_id),
  parent_area_id TEXT NOT NULL REFERENCES area(area_id),
  relation_type TEXT NOT NULL, valid_from TEXT NOT NULL, valid_to TEXT,
  source_id TEXT NOT NULL REFERENCES source_record(source_id),
  PRIMARY KEY(child_area_id,parent_area_id,relation_type,valid_from)
);
CREATE TABLE IF NOT EXISTS area_alias (
  source_id TEXT NOT NULL REFERENCES source_record(source_id),
  source_code TEXT NOT NULL, canonical_area_id TEXT REFERENCES area(area_id),
  match_method TEXT NOT NULL, status TEXT NOT NULL,
  PRIMARY KEY(source_id,source_code)
);
CREATE TABLE IF NOT EXISTS election_type (
  type_id TEXT PRIMARY KEY, label TEXT NOT NULL, elected_area_type TEXT NOT NULL,
  notes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS boundary_version (
  boundary_id TEXT PRIMARY KEY, area_id TEXT NOT NULL REFERENCES area(area_id),
  vintage TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES source_record(source_id),
  geometry_json TEXT NOT NULL, geometry_sha256 TEXT NOT NULL,
  UNIQUE(area_id, vintage, source_id)
);
CREATE TABLE IF NOT EXISTS election_event (
  event_id TEXT PRIMARY KEY, election_date TEXT NOT NULL, election_type TEXT NOT NULL,
  event_kind TEXT NOT NULL, authority_id TEXT NOT NULL REFERENCES area(area_id),
  status TEXT NOT NULL, source_url TEXT
);
CREATE TABLE IF NOT EXISTS event_detail (
  event_id TEXT PRIMARY KEY REFERENCES election_event(event_id),
  voting_system TEXT NOT NULL, authority_tier TEXT NOT NULL,
  notes TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contest (
  contest_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES election_event(event_id),
  area_id TEXT NOT NULL REFERENCES area(area_id), seats_available INTEGER NOT NULL,
  electorate INTEGER, turnout_rate REAL, candidate_votes INTEGER,
  source_id TEXT, quality_note TEXT, result_boundary_id TEXT,
  display_boundary_id TEXT, comparability_note TEXT
);
CREATE INDEX IF NOT EXISTS contest_area_idx ON contest(area_id);
CREATE TABLE IF NOT EXISTS ballot_round (
  round_id TEXT PRIMARY KEY, contest_id TEXT NOT NULL REFERENCES contest(contest_id),
  round_number INTEGER NOT NULL CHECK(round_number >= 1),
  round_kind TEXT NOT NULL, UNIQUE(contest_id,round_number)
);
CREATE TABLE IF NOT EXISTS ballot_option (
  option_id TEXT PRIMARY KEY, contest_id TEXT NOT NULL REFERENCES contest(contest_id),
  option_kind TEXT NOT NULL, display_name TEXT NOT NULL, party_label TEXT
);
CREATE TABLE IF NOT EXISTS vote_tally (
  round_id TEXT NOT NULL REFERENCES ballot_round(round_id),
  option_id TEXT NOT NULL REFERENCES ballot_option(option_id),
  votes INTEGER CHECK(votes IS NULL OR votes >= 0),
  seats_won INTEGER CHECK(seats_won IS NULL OR seats_won >= 0),
  source_id TEXT REFERENCES source_record(source_id),
  PRIMARY KEY(round_id,option_id)
);
CREATE TABLE IF NOT EXISTS candidate_result (
  result_id TEXT PRIMARY KEY, contest_id TEXT NOT NULL REFERENCES contest(contest_id),
  candidate_name TEXT NOT NULL, party_label TEXT NOT NULL,
  votes INTEGER, elected INTEGER NOT NULL, source_id TEXT,
  CHECK(votes IS NULL OR votes >= 0)
);
CREATE TABLE IF NOT EXISTS coverage (
  area_id TEXT NOT NULL REFERENCES area(area_id), election_type TEXT NOT NULL,
  year INTEGER NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL,
  source_url TEXT, checked_at TEXT,
  PRIMARY KEY(area_id, election_type, year)
);
CREATE TABLE IF NOT EXISTS release_record (
  release_id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, scope_area_id TEXT NOT NULL,
  created_at TEXT NOT NULL, manifest_sha256 TEXT NOT NULL, status TEXT NOT NULL
);
"""

ELECTION_TYPES = (
    ("local_council", "Local council", "ward_or_division", "District, metropolitan, unitary, county and London borough contests; council tier is held on the governing area."),
    ("parish_council", "Civil parish or town council", "parish_ward", "Parish polls require a distinct parish and, where used, parish-ward geography."),
    ("local_authority_mayor", "Local authority mayor", "local_authority", "Voting system and round structure must be recorded on each event."),
    ("combined_authority_mayor", "Combined authority mayor", "combined_authority", "Includes combined county authorities where applicable."),
    ("london_mayor", "Mayor of London", "greater_london", "Voting system differs across historical elections."),
    ("london_assembly_constituency", "London Assembly constituency", "assembly_constituency", "Constituency ballot; separate from the London-wide list."),
    ("london_assembly_list", "London Assembly list", "greater_london", "List ballot, multi-seat allocation."),
)


def ensure_election_types(db: sqlite3.Connection) -> None:
    db.executemany("INSERT OR IGNORE INTO election_type VALUES (?,?,?,?)", ELECTION_TYPES)


def main(output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    regions = all_rows("regions", "RGN25CD,RGN25NM", "1=1", True)
    authorities = all_rows("authorities", "LAD25CD,LAD25NM", "LAD25CD LIKE 'E%'", True)
    wards = all_rows("wards", "WD25CD,WD25NM,LAD25CD", "WD25CD LIKE 'E%'", True)
    lookup = all_rows("lookup", "LAD25CD,RGN25CD", "1=1", False)
    for name, records, field in (("regions", regions, "RGN25CD"),
                                 ("authorities", authorities, "LAD25CD"),
                                 ("wards", wards, "WD25CD")):
        codes = [row["properties"][field] for row in records]
        if len(codes) != len(set(codes)):
            raise ValueError(f"ONS {name} response has duplicate area codes")
    region_by_lad = {row["attributes"]["LAD25CD"]: row["attributes"]["RGN25CD"] for row in lookup}
    if len(region_by_lad) != len(lookup):
        raise ValueError("ONS authority-to-region lookup has duplicate authority codes")
    missing = {row["properties"]["LAD25CD"] for row in authorities} - region_by_lad.keys()
    if missing:
        raise ValueError(f"Authorities missing from dated region lookup: {sorted(missing)}")
    y_lads = {code for code, region in region_by_lad.items() if region == YORKSHIRE}
    files = {
        "regions": ("2025-12", regions),
        "authorities": ("2025-12", authorities),
        "wards": ("2025-05", wards),
        "lookup": ("2025-04", lookup),
    }
    hashes = {}
    for name, (_, rows) in files.items():
        hashes[name] = write_json(output / "raw" / f"ons-{name}.json", rows)
    db_path = output / "switchboard.sqlite3"
    if db_path.exists():
        raise FileExistsError(f"Refusing to overwrite existing staging database: {db_path}")
    db = sqlite3.connect(db_path)
    try:
        db.executescript(SCHEMA)
        ensure_election_types(db)
        for name, (vintage, _) in files.items():
            db.execute("INSERT INTO source_record VALUES (?,?,?,?,?,?)", (
                f"ons-{name}-{vintage}", "Office for National Statistics",
                f"{BASE}/{SERVICES[name]}/FeatureServer", vintage, now, hashes[name],
            ))
        db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
            "E92000001", "country", "England", "E92000001", None, None, "catalogued",
        ))
        for row in regions:
            p = row["properties"]
            db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
                p["RGN25CD"], "region", p["RGN25NM"], "E92000001", "E92000001", None,
                "pilot" if p["RGN25CD"] == YORKSHIRE else "catalogued",
            ))
            add_boundary(db, p["RGN25CD"], "2025-12", "ons-regions-2025-12", row["geometry"])
        for row in authorities:
            p = row["properties"]
            region = region_by_lad[p["LAD25CD"]]
            db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
                p["LAD25CD"], "local_authority", p["LAD25NM"], "E92000001", region,
                region, "pilot" if region == YORKSHIRE else "catalogued",
            ))
            add_boundary(db, p["LAD25CD"], "2025-12", "ons-authorities-2025-12", row["geometry"])
            for year in range(2021, 2027):
                db.execute("INSERT INTO coverage VALUES (?,?,?,?,?,?,?)", (
                    p["LAD25CD"], "local_council", year, "not_audited",
                    "No result source has been audited for this authority and year.", None, None,
                ))
        for row in wards:
            p = row["properties"]
            authority = p["LAD25CD"]
            if authority not in region_by_lad:
                continue
            region = region_by_lad[authority]
            db.execute("INSERT INTO area VALUES (?,?,?,?,?,?,?)", (
                p["WD25CD"], "ward", p["WD25NM"], "E92000001", authority,
                region, "pilot" if region == YORKSHIRE else "catalogued",
            ))
            add_boundary(db, p["WD25CD"], "2025-05", "ons-wards-2025-05", row["geometry"])
        db.commit()
    finally:
        db.close()

    def feature(row: dict, code_key: str, name_key: str) -> dict:
        p = row["properties"]
        return {"type": "Feature", "id": p[code_key],
                "properties": {"code": p[code_key], "name": p[name_key]},
                "geometry": row["geometry"]}

    public = output / "pilot"
    objects = {
        "regions.geojson": {"type": "FeatureCollection", "features": [feature(r, "RGN25CD", "RGN25NM") for r in regions]},
        "authorities.geojson": {"type": "FeatureCollection", "features": [feature(r, "LAD25CD", "LAD25NM") for r in authorities]},
        "yorkshire-wards.geojson": {"type": "FeatureCollection", "features": [feature(r, "WD25CD", "WD25NM") for r in wards if r["properties"]["LAD25CD"] in y_lads]},
    }
    output_hashes = {name: write_json(public / name, value) for name, value in objects.items()}
    manifest = {
        "schema_version": 1, "package_id": "england-geography-v2-pilot-2025",
        "created_at": now, "release_status": "staged_not_published",
        "pilot_region": YORKSHIRE, "coverage": {
            "regions": len(regions), "authorities": len(authorities),
            "english_wards_in_store": sum(1 for r in wards if r["properties"]["LAD25CD"] in region_by_lad),
            "yorkshire_authorities": len(y_lads),
            "yorkshire_wards_in_pilot": len(objects["yorkshire-wards.geojson"]["features"]),
        },
        "source_sha256": hashes, "object_sha256": output_hashes,
        "source_urls": {name: f"{BASE}/{SERVICES[name]}/FeatureServer" for name in SERVICES},
        "limits": [
            "2025 geography is a display edition, not proof that every 2021–2026 contest used the same boundaries.",
            "Only Leeds election results have been imported and audited in this first v2 staging build.",
            "Unreviewed authority-years are unknown, not confirmed no-election years.",
        ],
    }
    write_json(public / "manifest.json", manifest)
    print(compact(manifest["coverage"]))


def add_boundary(db: sqlite3.Connection, area_id: str, vintage: str, source_id: str, geometry: dict) -> None:
    encoded = compact(geometry)
    db.execute("INSERT INTO boundary_version VALUES (?,?,?,?,?,?)", (
        f"{area_id}:{vintage}", area_id, vintage, source_id, encoded,
        hashlib.sha256(encoded.encode("utf-8")).hexdigest(),
    ))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]).resolve())
