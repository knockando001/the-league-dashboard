import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
API = "https://api.sleeper.app/v1"
LEAGUE_ID = os.getenv("SLEEPER_LEAGUE_ID", "1397593463293239296")
MAX_WEEK = int(os.getenv("SLEEPER_MAX_WEEK", "18"))


def get_json(path):
    req = Request(f"{API}{path}", headers={"User-Agent": "the-league-dashboard/1.0"})
    try:
        with urlopen(req, timeout=30) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"Sleeper returned HTTP {exc.code} for {path}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach Sleeper for {path}: {exc.reason}") from exc


def write_json(name, value):
    path = DATA / name
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Created: {path}")


def archive_path(season, week):
    return DATA / "seasons" / str(season) / "weeks" / f"week-{week}.json"


def write_archive(season, week, payload):
    path = archive_path(season, week)
    if path.exists():
        print(f"Kept existing archive: {path}")
        return json.loads(path.read_text(encoding="utf-8"))
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)
    print(f"Archived: {path}")
    return payload


def read_archives(season):
    result = {}
    for week in range(1, MAX_WEEK + 1):
        path = archive_path(season, week)
        if path.exists():
            result[week] = json.loads(path.read_text(encoding="utf-8"))
    return result


def migrate_legacy_weekly(season, league, nfl_state, teams, now):
    legacy_path = DATA / "weekly.json"
    if not legacy_path.exists():
        return
    legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
    if int(legacy.get("season") or 0) != season:
        return
    transactions_path = DATA / "transactions.json"
    legacy_transactions = []
    if transactions_path.exists():
        legacy_transactions = json.loads(
            transactions_path.read_text(encoding="utf-8")
        ).get("transactions", [])
    transactions_by_week = {}
    for transaction in legacy_transactions:
        transactions_by_week.setdefault(int(transaction.get("week", 0)), []).append(transaction)
    for entry in legacy.get("weeks", []):
        week = int(entry.get("week", 0))
        matchups = entry.get("matchups") or []
        if week not in range(1, MAX_WEEK + 1) or not matchups or archive_path(season, week).exists():
            continue
        write_archive(season, week, {
            "generatedAt": legacy.get("generatedAt") or now,
            "leagueId": LEAGUE_ID,
            "leagueName": league.get("name"),
            "leagueStatus": league.get("status"),
            "season": season,
            "week": week,
            "currentWeekAtFetch": nfl_state.get("week"),
            "nflState": nfl_state,
            "teams": legacy.get("teams") or teams,
            "matchups": matchups,
            "transactions": transactions_by_week.get(week, []),
        })


def valid_matchups(rows):
    return (
        isinstance(rows, list)
        and bool(rows)
        and all(isinstance(row, dict) and row.get("roster_id") is not None for row in rows)
    )


def roster_map(rosters, users):
    users_by_id = {str(u.get("user_id")): u for u in users}
    result = {}
    for roster in rosters:
        rid = str(roster.get("roster_id"))
        owner = users_by_id.get(str(roster.get("owner_id")), {})
        metadata = owner.get("metadata") or {}
        result[rid] = {
            "rosterId": roster.get("roster_id"),
            "ownerId": roster.get("owner_id"),
            "ownerName": owner.get("display_name") or owner.get("username"),
            "teamName": metadata.get("team_name"),
            "players": roster.get("players") or [],
            "starters": roster.get("starters") or [],
        }
    return result


def normalise_matchup(row, season, week, teams):
    rid = str(row.get("roster_id"))
    starter_ids = row.get("starters") or []
    starter_points = row.get("starters_points") or []
    points_by_player = row.get("players_points") or {}
    starters = []
    for index, player_id in enumerate(starter_ids):
        points = starter_points[index] if index < len(starter_points) else points_by_player.get(str(player_id))
        starters.append({"playerId": str(player_id), "points": points})
    starter_set = {str(x) for x in starter_ids}
    bench = [
        {"playerId": str(pid), "points": points_by_player.get(str(pid))}
        for pid in (row.get("players") or [])
        if str(pid) not in starter_set
    ]
    return {
        "season": season,
        "week": week,
        "matchupId": row.get("matchup_id"),
        "rosterId": row.get("roster_id"),
        "ownerId": teams.get(rid, {}).get("ownerId"),
        "ownerName": teams.get(rid, {}).get("ownerName"),
        "teamName": teams.get(rid, {}).get("teamName"),
        "points": row.get("points", 0),
        "customPoints": row.get("custom_points"),
        "starters": starters,
        "bench": bench,
        "playersPoints": points_by_player,
    }


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()
    league = get_json(f"/league/{LEAGUE_ID}")
    users = get_json(f"/league/{LEAGUE_ID}/users")
    rosters = get_json(f"/league/{LEAGUE_ID}/rosters")
    nfl_state = get_json("/state/nfl")
    teams = roster_map(rosters, users)
    season = int(league.get("season") or nfl_state.get("season"))

    current_week = nfl_state.get("week")
    if current_week is None:
        raise RuntimeError("Sleeper did not provide the current NFL week")
    current_week = max(1, min(MAX_WEEK, int(current_week)))
    migrate_legacy_weekly(season, league, nfl_state, teams, now)
    archives = read_archives(season)
    weeks_to_fetch = [week for week in range(1, current_week + 1) if week not in archives]
    for week in weeks_to_fetch:
        raw_matchups = get_json(f"/league/{LEAGUE_ID}/matchups/{week}")
        raw_transactions = get_json(f"/league/{LEAGUE_ID}/transactions/{week}")
        if not valid_matchups(raw_matchups):
            print(f"Skipped empty or incomplete matchup response for week {week}.")
            continue
        if not isinstance(raw_transactions, list) or not all(
            isinstance(transaction, dict) for transaction in raw_transactions
        ):
            raise RuntimeError(f"Sleeper returned an invalid transaction response for week {week}")
        candidate = {
            "generatedAt": now,
            "leagueId": LEAGUE_ID,
            "leagueName": league.get("name"),
            "leagueStatus": league.get("status"),
            "season": season,
            "week": week,
            "currentWeekAtFetch": current_week,
            "nflState": nfl_state,
            "teams": teams,
            "matchups": [normalise_matchup(x, season, week, teams) for x in raw_matchups],
            "transactions": [{"week": week, **tx} for tx in raw_transactions],
        }
        archives[week] = write_archive(season, week, candidate)

    weeks = [
        {"week": week, "matchups": archives.get(week, {}).get("matchups", [])}
        for week in range(1, MAX_WEEK + 1)
    ]
    transactions = [
        tx
        for week in range(1, MAX_WEEK + 1)
        for tx in archives.get(week, {}).get("transactions", [])
    ]
    non_empty_weeks = sum(bool(item["matchups"]) for item in weeks)

    weekly = {
        "generatedAt": now,
        "leagueId": LEAGUE_ID,
        "leagueName": league.get("name"),
        "leagueStatus": league.get("status"),
        "season": season,
        "nflState": nfl_state,
        "teams": teams,
        "weeks": weeks,
    }
    write_json("weekly.json", weekly)
    write_json("transactions.json", {
        "generatedAt": now,
        "leagueId": LEAGUE_ID,
        "season": season,
        "transactions": transactions,
    })

    players_path = DATA / "players.json"
    should_refresh_players = not players_path.exists() or time.time() - players_path.stat().st_mtime > 23 * 3600
    if should_refresh_players:
        players = get_json("/players/nfl?active=true")
        write_json("players.json", {
            "generatedAt": now,
            "players": players,
        })
    else:
        print("Kept existing data/players.json; cache is less than 23 hours old.")

    print(f"League: {league.get('name')} ({season})")
    print(f"League status: {league.get('status')}")
    print(f"Rosters: {len(rosters)}")
    print(f"Weeks with matchup data: {non_empty_weeks}")
    print(f"Transactions: {len(transactions)}")


if __name__ == "__main__":
    main()
