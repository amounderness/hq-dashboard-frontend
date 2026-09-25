"""Build audited Leeds ward Census/Tribes context from the research outputs.

The published object contains only ward aggregates. It is deliberately separate
from election results and never includes OA rows or individual voter records.
"""

import csv
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

TRIBES = [
    "Student & Transient Youth",
    "Rooted Older Homeowners",
    "Stable Suburban Professionals",
    "Cosmopolitan Young Professional Core",
    "Settled Working Families / Skilled Trades Suburbs",
    "Settled Diverse Urban Communities",
    "Post-Industrial Estates / Deprived Working Communities",
]

# Numerator, denominator, plain-language label, display group.
METRICS = {
    "age_0_14": ("age_0_14_count", "total_residents", "Age 0–14", "Age"),
    "age_15_24": ("age_15_24_count", "total_residents", "Age 15–24", "Age"),
    "age_25_34": ("age_25_34_count", "total_residents", "Age 25–34", "Age"),
    "age_65_plus": ("age_65_plus_count", "total_residents", "Age 65+", "Age"),
    "one_person_household": ("one_person_household_count", "household_composition_total", "One-person households", "Households and housing"),
    "owned": ("owned_count", "tenure_total", "Owner-occupied households", "Households and housing"),
    "social_rented": ("social_rented_count", "tenure_total", "Social-rented households", "Households and housing"),
    "private_rented": ("private_rented_count", "tenure_total", "Private-rented households", "Households and housing"),
    "flats": ("flat_type_count", "accommodation_total", "Flats", "Households and housing"),
    "employed": ("employed_count", "economic_activity_total", "Employed people aged 16+", "Work and education"),
    "unemployed": ("unemployed_count", "economic_activity_total", "Unemployed people aged 16+", "Work and education"),
    "full_time_student": ("full_time_student_count", "economic_activity_total", "Full-time students aged 16+", "Work and education"),
    "retired": ("retired_count", "economic_activity_total", "Retired people aged 16+", "Work and education"),
    "level_4_plus": ("level_4_plus_count", "qualification_total", "Level 4+ qualification, aged 16+", "Work and education"),
    "no_qualifications": ("no_qualifications_count", "qualification_total", "No qualifications, aged 16+", "Work and education"),
    "non_uk_born": ("non_uk_born_count", "country_of_birth_total", "Born outside the UK", "Population"),
    "non_white": ("non_white_count", "ethnic_group_total", "Ethnic group other than White", "Population"),
}


def csv_rows(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        yield from csv.DictReader(stream)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main(research, official_file, wards_file, output):
    atlas_file = research / "data/processed/atlas_outputs_v1/k7_ward25_atlas_profile_v1.csv"
    base_file = research / "data/processed/aggregations_v1/k7_oa_geo_cluster_base_v1.csv"
    feature_file = research / "data/processed/oa_derived_features_full_v1.csv"
    raw_population = research / "data/raw/census_oa/census2021-ts001-oa.csv"
    raw_age = research / "data/raw/census_oa/census2021-ts007a-oa.csv"
    files = [atlas_file, base_file, feature_file, raw_population, raw_age, official_file]
    official = {row["OA21CD"]: row["WD25CD"] for row in json.loads(official_file.read_text(encoding="utf-8"))["rows"]}
    wards = {row["ward_code"]: row["ward_name"] for row in json.loads(wards_file.read_text(encoding="utf-8"))}
    atlas = {row["WD25CD"]: row for row in csv_rows(atlas_file) if row["LAD25CD"] == "E08000035"}
    if len(official) != 2607 or len(atlas) != 33 or set(atlas) != set(wards):
        raise ValueError("Leeds geography coverage is incomplete")

    oa_ward = {}
    oa_population = {}
    cluster_counts = defaultdict(Counter)
    ward_oas = Counter()
    for row in csv_rows(base_file):
        if row["LAD25CD"] != "E08000035":
            continue
        oa, ward = row["OA21CD"], row["WD25CD"]
        if oa in oa_ward or official.get(oa) != ward or row["ward_lookup_status"] != "ward_lookup_matched":
            raise ValueError(f"OA-to-ward conflict: {oa}")
        oa_ward[oa] = ward
        oa_population[oa] = int(row["population"])
        ward_oas[ward] += 1
        cluster_counts[ward][int(row["cluster_id"])] += int(row["population"])
    if oa_ward != official:
        raise ValueError("Research OA assignments differ from the official ONS lookup")

    count_columns = {value for key in METRICS.values() for value in key[:2]} | {"total_residents"}
    ward_counts = defaultdict(Counter)
    seen_features = set()
    for row in csv_rows(feature_file):
        oa = row["OA21CD"]
        if oa not in oa_ward:
            continue
        if oa in seen_features or int(row["total_residents"]) != oa_population[oa]:
            raise ValueError(f"Duplicate or population mismatch in Census features: {oa}")
        seen_features.add(oa)
        for column in count_columns:
            ward_counts[oa_ward[oa]][column] += int(row[column])
    if seen_features != set(official):
        raise ValueError("Missing Census feature OAs")

    raw_pop_count = 0
    for row in csv_rows(raw_population):
        oa = row["geography code"]
        if oa in official:
            raw_pop_count += 1
            if int(row["Residence type: Total; measures: Value"]) != oa_population[oa]:
                raise ValueError(f"Raw ONS population differs from model input: {oa}")
    raw_age_count = 0
    raw_age_0_14 = Counter()
    raw_age_65_plus = Counter()
    for row in csv_rows(raw_age):
        oa = row["geography code"]
        if oa in official:
            raw_age_count += 1
            raw_age_0_14[official[oa]] += sum(int(row[label]) for label in (
                "Age: Aged 4 years and under", "Age: Aged 5 to 9 years", "Age: Aged 10 to 14 years"))
            raw_age_65_plus[official[oa]] += sum(int(row[label]) for label in (
                "Age: Aged 65 to 69 years", "Age: Aged 70 to 74 years", "Age: Aged 75 to 79 years",
                "Age: Aged 80 to 84 years", "Age: Aged 85 years and over"))
    if raw_pop_count != 2607 or raw_age_count != 2607:
        raise ValueError("Missing Leeds rows in raw ONS Census files")

    profiles = []
    for ward in sorted(wards):
        source = atlas[ward]
        if int(source["population"]) != ward_counts[ward]["total_residents"] or int(source["oa_count"]) != ward_oas[ward]:
            raise ValueError(f"Census population/coverage mismatch: {ward}")
        if raw_age_0_14[ward] != ward_counts[ward]["age_0_14_count"] or raw_age_65_plus[ward] != ward_counts[ward]["age_65_plus_count"]:
            raise ValueError(f"Raw age Census mismatch: {ward}")
        for column in count_columns:
            if int(source[column]) != ward_counts[ward][column]:
                raise ValueError(f"Atlas Census mismatch: {ward} {column}")
        tribes = []
        for index, name in enumerate(TRIBES):
            residents = cluster_counts[ward][index]
            if residents != int(source[f"cluster_{index}_population"]):
                raise ValueError(f"Tribe aggregation mismatch: {ward} {index}")
            tribes.append({"id": index, "name": name, "residents": residents,
                           "share": residents / int(source["population"])})
        if sum(item["residents"] for item in tribes) != int(source["population"]):
            raise ValueError(f"Tribe shares do not cover the ward: {ward}")
        metrics = []
        for key, (numerator, denominator, label, group) in METRICS.items():
            count = ward_counts[ward][numerator]
            base = ward_counts[ward][denominator]
            if base <= 0 or count < 0 or count > base:
                raise ValueError(f"Invalid Census measure: {ward} {key}")
            metrics.append({"key": key, "label": label, "group": group,
                            "count": count, "denominator": base, "share": count / base})
        profiles.append({"ward_code": ward, "ward_name": wards[ward], "census_year": 2021,
                         "display_boundary_id": "wards-2025", "population": int(source["population"]),
                         "oa_count": ward_oas[ward], "metrics": metrics,
                         "tribes": tribes, "dominant_tribe_id": max(tribes, key=lambda item: item["residents"])["id"]})

    output.mkdir(parents=True, exist_ok=True)
    (output / "ward-profiles.json").write_text(json.dumps(profiles, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    audit = {"ward_count": len(profiles), "oa_count": len(official), "allocated_census_population": sum(p["population"] for p in profiles),
             "source_sha256": {path.name: digest(path) for path in files},
             "official_lookup_url": "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/OA21_WD25_LAD25_EW_LU_v3/FeatureServer/0",
             "census_topic_summaries_url": "https://www.ons.gov.uk/census/aboutcensus/censusproducts/topicsummaries",
             "method": "2021 Census OA counts summed by the official OA21-to-2025-ward best-fit lookup; model K=7 OA assignment weighted by 2021 OA residents. No individual records."}
    (output / "audit.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Built Pulse profiles for {len(profiles)} wards, {len(official)} OAs, {audit['allocated_census_population']} allocated residents")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]))
