#!/usr/bin/env python3
import json
import re
import sys

import pdfplumber


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


def extract_rows(pdf_path):
    rows = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            table = page.extract_table() or []
            for row_index, row in enumerate(table):
                if not row or clean(row[0]).count("/") != 2:
                    continue
                values = [clean(cell) for cell in row[: len(COLUMNS)]]
                if len(values) < len(COLUMNS):
                    values.extend([""] * (len(COLUMNS) - len(values)))
                record = dict(zip(COLUMNS, values))
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
