"""
Builds src/data/rosters.json from the public NBA roster page.

Usage:
  python3 scripts/build_rosters.py
  python3 scripts/build_rosters.py --season 2025-26
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

PUBLIC_ROSTER_URL = "https://www.nba.com/players"
OUT_PATH = Path("src/data/rosters.json")
REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "User-Agent": "Mozilla/5.0 (compatible; NBA Dashboard Roster Builder)",
}
EXPECTED_TEAM_IDS = {
    "1610612737",
    "1610612738",
    "1610612751",
    "1610612766",
    "1610612741",
    "1610612739",
    "1610612742",
    "1610612743",
    "1610612765",
    "1610612744",
    "1610612745",
    "1610612754",
    "1610612746",
    "1610612747",
    "1610612763",
    "1610612748",
    "1610612749",
    "1610612750",
    "1610612740",
    "1610612752",
    "1610612760",
    "1610612753",
    "1610612755",
    "1610612756",
    "1610612757",
    "1610612758",
    "1610612759",
    "1610612761",
    "1610612762",
    "1610612764",
}


def log(message: str) -> None:
    print(message, file=sys.stderr)


def current_season_start_year() -> int:
    now = datetime.utcnow()
    # NBA regular season starts in October, but offseason roster construction
    # for the next season is already live by July.
    return now.year if now.month >= 7 else now.year - 1


def default_season_string() -> str:
    start = current_season_start_year()
    return f"{start}-{str(start + 1)[-2:]}"


def fetch_text(url: str, timeout: int = 20, attempts: int = 3) -> str:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        log(f"[request {attempt}/{attempts}] GET {url}")
        request = Request(url, headers=REQUEST_HEADERS)
        started = time.time()
        try:
            with urlopen(request, timeout=timeout) as response:
                body = response.read().decode("utf-8", errors="replace")
            elapsed = time.time() - started
            log(f"[request {attempt}/{attempts}] OK {url} ({elapsed:.1f}s)")
            return body
        except (HTTPError, URLError, TimeoutError) as exc:
            elapsed = time.time() - started
            log(f"[request {attempt}/{attempts}] FAIL {url} ({elapsed:.1f}s): {exc}")
            last_error = exc
            if attempt < attempts:
                time.sleep(2)
    raise RuntimeError(f"Unable to fetch {url}") from last_error


def extract_next_data(html: str) -> dict[str, Any]:
    match = re.search(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        html,
        flags=re.DOTALL,
    )
    if not match:
        raise RuntimeError("Unable to locate __NEXT_DATA__ payload on the NBA players page.")
    return json.loads(match.group(1))


def to_sortable_jersey(value: Any) -> tuple[int, str]:
    text = str(value or "").strip()
    if not text:
        return (10_000, "")
    try:
        return (int(text), text)
    except ValueError:
        return (9_999, text)


def normalize_player(entry: dict[str, Any]) -> dict[str, Any] | None:
    if entry.get("ROSTER_STATUS") != 1:
        return None
    team_id = str(entry.get("TEAM_ID") or "").strip()
    person_id = entry.get("PERSON_ID")
    first_name = str(entry.get("PLAYER_FIRST_NAME") or "").strip()
    family_name = str(entry.get("PLAYER_LAST_NAME") or "").strip()
    full_name = " ".join(part for part in [first_name, family_name] if part).strip()
    if not team_id or not person_id or not full_name:
        return None
    return {
        "teamId": team_id,
        "personId": person_id,
        "firstName": first_name,
        "familyName": family_name,
        "fullName": full_name,
        "jerseyNum": str(entry.get("JERSEY_NUMBER") or "").strip(),
        "position": str(entry.get("POSITION") or "").strip(),
    }


def build_rosters_from_public_page(season: str) -> dict[str, list[dict[str, Any]]]:
    current_season = default_season_string()
    if season != current_season:
        raise RuntimeError(
            f"Public roster source only reflects the current roster view ({current_season}), "
            f"but season {season} was requested."
        )

    html = fetch_text(PUBLIC_ROSTER_URL)
    next_data = extract_next_data(html)
    players = next_data.get("props", {}).get("pageProps", {}).get("players", [])
    if not isinstance(players, list) or not players:
        raise RuntimeError("NBA players page did not expose a usable player list.")

    roster_map: dict[str, list[dict[str, Any]]] = {}
    active_players = 0
    for raw_player in players:
        if not isinstance(raw_player, dict):
            continue
        player = normalize_player(raw_player)
        if player is None:
            continue
        active_players += 1
        team_id = player.pop("teamId")
        roster_map.setdefault(team_id, []).append(player)

    if not roster_map:
        raise RuntimeError("No active roster players were parsed from the NBA players page.")

    missing_team_ids = sorted(EXPECTED_TEAM_IDS - set(roster_map))
    unexpected_team_ids = sorted(set(roster_map) - EXPECTED_TEAM_IDS)
    if missing_team_ids or unexpected_team_ids:
        raise RuntimeError(
            "Roster validation failed. "
            f"missing_team_ids={missing_team_ids} unexpected_team_ids={unexpected_team_ids}"
        )

    for team_id, players_for_team in roster_map.items():
        players_for_team.sort(key=lambda player: (to_sortable_jersey(player["jerseyNum"]), player["fullName"]))
        if len(players_for_team) < 10:
            raise RuntimeError(f"Roster validation failed for team {team_id}: only {len(players_for_team)} active players.")
        log(f"[team {team_id}] {len(players_for_team)} active players")

    log(f"[source] {PUBLIC_ROSTER_URL}")
    log(f"[summary] Parsed {active_players} active players across {len(roster_map)} teams")
    return {team_id: roster_map[team_id] for team_id in sorted(roster_map)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--season", default=default_season_string())
    args = parser.parse_args()

    log(f"[season] Building rosters for {args.season}")
    roster_map = build_rosters_from_public_page(args.season)
    OUT_PATH.write_text(json.dumps(roster_map, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"[write] Wrote {OUT_PATH}")
    print(f"Wrote {OUT_PATH} for season {args.season}")


if __name__ == "__main__":
    main()
