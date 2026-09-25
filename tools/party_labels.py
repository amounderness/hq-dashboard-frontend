"""Leeds party-name equivalences for display and longitudinal analysis.

The Handbook abbreviation tables for 2021-24 define these local party names.
Unknown labels are preserved verbatim; an independent candidate is not assumed
to belong to any local independent party.
"""

from collections import defaultdict


ALIASES = {
    "AGS": "Alliance for Green Socialism",
    "BREAK": "Breakthrough Party",
    "FBM": "For Britain Movement",
    "FREE": "Freedom Alliance",
    "GARF IND": "Garforth & Swillington Independents Party",
    "G & S IND": "Garforth & Swillington Independents Party",
    "G and S IND": "Garforth & Swillington Independents Party",
    "Garforth and Swillington Independents Party": "Garforth & Swillington Independents Party",
    "MBI": "Morley Borough Independents",
    "MBOR IND": "Morley Borough Independents",
    "MB IND": "Morley Borough Independents",
    "MORL IND": "Morley Borough Independents",
    "NIP": "Northern Independence Party",
    "SOB IND": "Save Our Beeston and Holbeck Independents",
    "WEP": "Women's Equality Party",
    "YORKS": "Yorkshire Party",
}


def canonical_party(label: str) -> str:
    return ALIASES.get(label, label)


def canonical_vote_counts(votes: dict[str, int]) -> dict[str, int]:
    result = defaultdict(int)
    for label, count in votes.items():
        result[canonical_party(label)] += count
    return dict(result)
