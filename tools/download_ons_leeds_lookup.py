"""Fetch the official 2025 OA-to-ward best-fit Leeds subset for validation."""

import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
import sys

ENDPOINT = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/OA21_WD25_LAD25_EW_LU_v3/FeatureServer/0/query"


def query(**params):
    url = ENDPOINT + "?" + urlencode({"where": "LAD25CD='E08000035'", "f": "json", **params})
    with urlopen(url, timeout=40) as response:
        data = json.load(response)
    if "error" in data:
        raise ValueError(data["error"])
    return data


def main(output):
    count = query(returnCountOnly="true")["count"]
    rows = []
    for offset in range(0, count, 1000):
        page = query(outFields="OA21CD,WD25CD,WD25NM,LAD25CD", returnGeometry="false",
                     resultOffset=offset, resultRecordCount=1000)
        rows.extend(feature["attributes"] for feature in page["features"])
    if len(rows) != count or len({row["OA21CD"] for row in rows}) != count:
        raise ValueError("Official lookup returned incomplete or duplicate Leeds rows")
    if any(row["LAD25CD"] != "E08000035" for row in rows):
        raise ValueError("Official lookup returned a non-Leeds row")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"source": ENDPOINT, "rows": sorted(rows, key=lambda row: row["OA21CD"])},
                                 ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Downloaded {count} official Leeds OA-to-ward rows")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
