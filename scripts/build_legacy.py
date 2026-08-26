import json
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source"
DATA_DIR = ROOT / "data"

TEAMS_FILE = SOURCE_DIR / "teams.xlsx"
HISTORY_FILE = SOURCE_DIR / "history.xlsx"

FRANCHISES_FILE = DATA_DIR / "franchises.json"
HISTORY_JSON_FILE = DATA_DIR / "history.json"


def clean_text(value):
    if value is None:
        return None

    text = str(value).strip()
    return text if text else None


def number_or_zero(value):
    if value is None or value == "":
        return 0

    return float(value)


def integer_or_zero(value):
    if value is None or value == "":
        return 0

    return int(value)


def read_worksheet(path):
    workbook = load_workbook(path, read_only=True, data_only=True)
    worksheet = workbook.active

    rows = list(worksheet.iter_rows(values_only=True))

    if not rows:
        return []

    headers = [clean_text(value) for value in rows[0]]
    records = []

    for row in rows[1:]:
        record = {}

        for index, header in enumerate(headers):
            if header:
                record[header] = row[index] if index < len(row) else None

        if any(value is not None for value in record.values()):
            records.append(record)

    workbook.close()
    return records


def build_franchises(team_rows):
    grouped = {}

    for row in team_rows:
        franchise_id = str(integer_or_zero(row.get("TeamId")))
        season = integer_or_zero(row.get("Season"))
        team_name = clean_text(row.get("TeamName"))

        if not franchise_id or franchise_id == "0" or not season or not team_name:
            continue

        franchise = grouped.setdefault(
            franchise_id,
            {
                "franchiseId": franchise_id,
                "currentName": None,
                "firstSeason": season,
                "lastSeason": season,
                "namesBySeason": [],
            },
        )

        franchise["firstSeason"] = min(franchise["firstSeason"], season)
        franchise["lastSeason"] = max(franchise["lastSeason"], season)

        franchise["namesBySeason"].append(
            {
                "season": season,
                "teamName": team_name,
            }
        )

    franchises = []

    for franchise in grouped.values():
        franchise["namesBySeason"].sort(key=lambda item: item["season"])

        latest_name = franchise["namesBySeason"][-1]["teamName"]
        franchise["currentName"] = latest_name

        historical_names = []

        for item in franchise["namesBySeason"]:
            if item["teamName"] not in historical_names:
                historical_names.append(item["teamName"])

        franchise["historicalNames"] = historical_names
        franchises.append(franchise)

    franchises.sort(key=lambda item: int(item["franchiseId"]))
    return franchises


def build_history(history_rows):
    output = []

    for row in history_rows:
        season = integer_or_zero(row.get("Season"))
        franchise_id = str(integer_or_zero(row.get("TeamId")))

        if not season or franchise_id == "0":
            continue

        output.append(
            {
                "season": season,
                "franchiseId": franchise_id,
                "teamName": clean_text(row.get("TeamName")),
                "location": clean_text(row.get("Location")),
                "owner": clean_text(row.get("Owner")),
                "wins": integer_or_zero(row.get("Wins")),
                "losses": integer_or_zero(row.get("Losses")),
                "ties": integer_or_zero(row.get("Ties")),
                "winPct": number_or_zero(row.get("WinPct")),
                "pointsFor": number_or_zero(row.get("PointsFor")),
                "pointsAgainst": number_or_zero(row.get("PointsAgainst")),
                "playoffSeed": integer_or_zero(row.get("PlayoffSeed")),
                "finalRank": integer_or_zero(row.get("FinalRank")),
            }
        )

    output.sort(
        key=lambda item: (
            item["season"],
            item["finalRank"] if item["finalRank"] else 999,
            int(item["franchiseId"]),
        )
    )

    return output


def main():
    if not TEAMS_FILE.exists():
        raise FileNotFoundError(f"Missing source file: {TEAMS_FILE}")

    if not HISTORY_FILE.exists():
        raise FileNotFoundError(f"Missing source file: {HISTORY_FILE}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    teams = read_worksheet(TEAMS_FILE)
    history_rows = read_worksheet(HISTORY_FILE)

    franchises = build_franchises(teams)
    history = build_history(history_rows)

    FRANCHISES_FILE.write_text(
        json.dumps(franchises, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    HISTORY_JSON_FILE.write_text(
        json.dumps(history, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"Created {FRANCHISES_FILE}")
    print(f"Created {HISTORY_JSON_FILE}")
    print(f"Franchises: {len(franchises)}")
    print(f"Historical season rows: {len(history)}")


if __name__ == "__main__":
    main()
