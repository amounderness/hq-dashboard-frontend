"""Build a new Leeds-only Explorer v2 viewer package from a verified staged package.

Usage: python tools/explorer_v2/build_leeds_viewer_package.py INPUT_RELEASE OUTPUT_RELEASE
The output directory must not exist. This does not stage or publish anything.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

LEEDS = "E08000035"
YORKSHIRE = "E12000003"
YEARS = list(range(2021, 2027))
SOURCE_MANIFEST_SHA256 = "5e50816f9f6c5e72f6236c06d172665a2556c3fd4fd18e253a41109010d3e660"
LEEDS_RESULT_SHA256 = {
    2021: "2cd877f45e7e8c47c6fa5ed794196a9222d02800138aaf4db6cd2dd0a402922e",
    2022: "54941796150de6e0f744d404982c7526cd1d0f18cc78a3489e8b81eb49436cc0",
    2023: "30085a5f267edb886005d122a38a01c771f650959d75b93be74eb380c4515682",
    2024: "a62fc44d802153037c82bd56d3cf31dffa9f3cec2a261f6ed2aa6680d26d7046",
    2025: "fbd95cd884ed462d937f9e29f63ee87838f6e0482eb8793b8750d919cc84ebdf",
    2026: "91fd656ee0f6debcbd1c328bf094b14b097f9569fd527943162b32ea25930690",
}


def raw(source: Path, name: str, expected: str) -> bytes:
    content = (source / name).read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise ValueError(f"Source object checksum failed: {name}")
    return content


def add_json(output: Path, hashes: dict[str, str], name: str, value: object) -> None:
    content = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    path = output / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    hashes[name] = hashlib.sha256(content).hexdigest()


def build(source: Path, output: Path) -> dict:
    if output.exists():
        raise ValueError("Choose a new output directory; releases are immutable")
    source_manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
    if hashlib.sha256((source / "manifest.json").read_bytes()).hexdigest() != SOURCE_MANIFEST_SHA256:
        raise ValueError("Input is not the hash-pinned rc9 source package")
    listed = source_manifest["object_sha256"]
    catalog = json.loads(raw(source, "catalog.json", listed["catalog.json"]))
    if catalog.get("pilot_region") != YORKSHIRE or catalog.get("years") != YEARS:
        raise ValueError("Input is not the expected Yorkshire 2021–2026 catalogue")
    leeds = next((area for area in catalog["authorities"] if area["code"] == LEEDS), None)
    if not leeds or any(leeds["coverage"][str(year)]["status"] not in {"checked_published", "partial_by_election_only"} for year in YEARS):
        raise ValueError("Input Leeds source decisions are not the audited release")
    results: dict[str, bytes] = {}
    for year in YEARS:
        name = f"results/{LEEDS}/{year}.json"
        if listed[name] != LEEDS_RESULT_SHA256[year]:
            raise ValueError(f"Audited Leeds result hash changed: {name}")
        content = raw(source, name, listed[name])
        result = json.loads(content)
        if result.get("authority_code") != LEEDS or result.get("year") != year or result.get("source_release") != "leeds-pulse-v0.6.0":
            raise ValueError(f"Result is not the audited Leeds import: {name}")
        results[name] = content
    regions = json.loads(raw(source, "regions.geojson", listed["regions.geojson"]))
    authorities = json.loads(raw(source, "authorities.geojson", listed["authorities.geojson"]))
    wards = json.loads(raw(source, "yorkshire-wards.geojson", listed["yorkshire-wards.geojson"]))
    leeds_wards = [item for item in catalog["pilot_wards"] if item["authority_code"] == LEEDS]
    ward_codes = {item["code"] for item in leeds_wards}
    ward_geometry = [item for item in wards["features"] if item["properties"]["code"] in ward_codes]
    if len(leeds_wards) != 33 or len(ward_geometry) != 33:
        raise ValueError("Exactly 33 Leeds ward records and shapes are required")
    package_id = output.name
    if not package_id.startswith("explorer-v2-leeds-viewer-"):
        raise ValueError("Output folder name must identify a Leeds viewer release")
    output.mkdir(parents=True)
    hashes: dict[str, str] = {}
    for name, value in [("regions.geojson", regions), ("authorities.geojson", authorities),
                        ("yorkshire-wards.geojson", {**wards, "features": ward_geometry})]:
        add_json(output, hashes, name, value)
    viewer_catalog = {
        **catalog,
        "schema_version": 1,
        "audience_scope": "leeds_viewers",
        "released_authorities": [LEEDS],
        "pilot_wards": leeds_wards,
        "activity": {LEEDS: catalog["activity"][LEEDS]},
        "sources": [item for item in catalog.get("sources", []) if "leeds" in item.get("source_id", "").lower()],
        "coverage_definition": {**catalog.get("coverage_definition", {}), "not_released": "Council indexed for geographic context; no results are released to viewers."},
    }
    viewer_catalog.pop("ward_editions", None)
    viewer_catalog.pop("pilot_wards_by_edition", None)
    viewer_catalog["geography_summary"] = {**catalog.get("geography_summary", {}), "yorkshire_wards_in_pilot": 33}
    for area in viewer_catalog["authorities"]:
        if area["code"] != LEEDS:
            area["coverage"] = {str(year): {"status": "not_released", "reason": "Outside the Leeds viewer release.", "source_url": None} for year in YEARS}
    add_json(output, hashes, "catalog.json", viewer_catalog)
    for name, content in results.items():
        path = output / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        hashes[name] = hashlib.sha256(content).hexdigest()
    manifest = {
        "schema_version": 1,
        "package_id": package_id,
        "release_status": "staged_not_published",
        "audience_scope": "leeds_viewers",
        "pilot_region": YORKSHIRE,
        "released_authorities": [LEEDS],
        "source_package": source_manifest["package_id"],
        "source_manifest_sha256": SOURCE_MANIFEST_SHA256,
        "leeds_result_sha256": {name: hashes[name] for name in results},
        "limits": ["Leeds City Council results only; other councils are geographic context, not released data.",
                   "Latest recorded ward polls do not establish current council composition or a forecast.",
                   "2021 Census and Electoral Tribes are exploratory area context for Leeds only."],
        "object_sha256": hashes,
    }
    add_json(output, {}, "manifest.json", manifest)
    return {"package_id": package_id, "manifest_sha256": hashlib.sha256((output / "manifest.json").read_bytes()).hexdigest(),
            "leeds_result_objects": len(results), "objects": len(hashes)}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    print(json.dumps(build(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()), indent=2))
