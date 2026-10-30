#!/usr/bin/env python3
import json
import re
import sys

COLUMNS = [
    "date",
    "away_team",
    "home_team",
    "trigger",
    "initial_call",
    "final_ruling",
    "ruling_description",
    "team_challenged",
    "challenge_outcome",
    "period",
    "game_clock",
    "video_url",
]


def clean(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def game_id_from_video_url(value):
    match = re.search(r"/ON-AIR/((?:00[124])\d{7})_", value or "")
    return match.group(1) if match else ""


def column_indexes(header):
    """NBA added '# Challenge' and 'Timeout' to some historical reports."""
    aliases = dict(zip([
        "date", "away team", "home team", "trigger", "initial call",
        "final ruling", "ruling description", "team challenged",
        "challenge outcome", "period", "game clock - review is triggered", "video link",
    ], COLUMNS))
    found = {}
    for index, label in enumerate(header):
        key = aliases.get(clean(label).lower())
        if key:
            found[key] = index
    if set(found) != set(COLUMNS):
        raise ValueError("Unrecognized challenge report columns: " + repr(header))
    return found


def extract_rows(pdf_path):
    import pdfplumber

    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            table = page.extract_table() or []
            if not table:
                continue
            indexes = column_indexes(table[0])
            for row_index, row in enumerate(table):
                if not row or clean(row[0]).count("/") != 2:
                    continue
                record = {key: clean(row[index]) if index < len(row) else ""
                          for key, index in indexes.items()}
                if (record["challenge_outcome"].lower() not in ("successful", "unsuccessful")
                        or not re.fullmatch(r"\d+", record["period"])
                        or not re.fullmatch(r"\d+:\d{2}(?:\.\d+)?", record["game_clock"])):
                    raise ValueError("Invalid challenge outcome/period/clock on page " + str(page_index + 1))
                record["page"] = page_index + 1
                record["row_on_page"] = row_index + 1
                record["game_id"] = game_id_from_video_url(record["video_url"])
                rows.append(record)
    return rows


def main():
    if len(sys.argv) != 2:
        print("Usage: extract-nba-challenge-pdf.py path/to/challenge.pdf", file=sys.stderr)
        raise SystemExit(2)
    print(json.dumps(extract_rows(sys.argv[1])))


if __name__ == "__main__":
    main()
