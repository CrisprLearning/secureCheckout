#!/usr/bin/env python3
"""Builds src/data/pincodes.json from India Post's All India Pincode Directory.

Source: https://data.gov.in/resource/all-india-pincode-directory-till-last-month (Government Open Data License).
Columns used: Pincode, District, StateName.

    python3 scripts/build-pincodes.py /path/to/pincode.csv

Output shape (kept small because it ships in the browser bundle):
    states:    ["Andhra Pradesh", ...]
    districts: [["Anantapur", 1], ...]          name and index into states
    pins:      {"515": [631, 0, 581, 0, ...]}   first three digits -> pairs of (last three digits, district index)
"""
import collections
import csv
import json
import pathlib
import re
import sys

SMALL_WORDS = {"and", "of", "the"}
STATE_NAMES = {"THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "Dadra and Nagar Haveli and Daman and Diu"}


def title(text: str) -> str:
    words = re.sub(r"\s+", " ", text.strip()).lower().split(" ")
    out = []
    for i, word in enumerate(words):
        if i and word in SMALL_WORDS:
            out.append(word)
        else:
            # Capitalise after the start, a hyphen, a dot or an opening bracket: "Y.S.R.", "North-East", "(Rural)".
            out.append(re.sub(r"(^|[-.(])([a-z])", lambda m: m.group(1) + m.group(2).upper(), word))
    return " ".join(out)


def district_name(state: str, district: str) -> str:
    name = title(district)
    # Delhi's districts are published as "Central", "East", ...; on their own they do not read as a place.
    if state == "Delhi" and "Delhi" not in name:
        name = f"{name} Delhi"
    return name


def main() -> None:
    source = pathlib.Path(sys.argv[1])
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    with source.open(encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.DictReader(handle):
            pin = row["Pincode"].strip()
            if not re.fullmatch(r"[1-9]\d{5}", pin):
                continue
            state = STATE_NAMES.get(row["StateName"].strip().upper()) or title(row["StateName"])
            votes[pin][(state, district_name(state, row["District"]))] += 1

    # A pincode served from several districts goes to the one with the most post offices.
    chosen = {pin: counter.most_common(1)[0][0] for pin, counter in votes.items()}
    # The dropdowns still list every district in the directory, not only the winners.
    all_districts = sorted({key for counter in votes.values() for key in counter})

    states = sorted({state for state, _ in all_districts})
    districts = [[name, states.index(state)] for state, name in all_districts]
    index = {key: i for i, key in enumerate(all_districts)}

    pins: dict[str, list[int]] = collections.defaultdict(list)
    for pin in sorted(chosen):
        pins[pin[:3]] += [int(pin[3:]), index[chosen[pin]]]

    target = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "pincodes.json"
    target.write_text(json.dumps({"states": states, "districts": districts, "pins": pins}, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(chosen)} pincodes, {len(districts)} districts, {len(states)} states -> {target} ({target.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
