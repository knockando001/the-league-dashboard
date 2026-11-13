import datetime
import json
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fetch_weekly import normalise_matchup, roster_map  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUTPUT_FILE = DATA_DIR / "live.json"
LEAGUE_ID = "1397593463293239296"
BASE_URL = "https://api.sleeper.app/v1"
MAX_WEEK = 18


def get_json(path):
    request = urllib.request.Request(
        BASE_URL + path,
        headers={"Accept": "application/json", "User-Agent": "the-league-dashboard/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def points_from_settings(settings):
    return float(settings.get("fpts", 0) or 0) + float(settings.get("fpts_decimal", 0) or 0) / 100


def user_team_name(user):
    metadata = user.get("metadata") or {}
    return metadata.get("team_name") or user.get("display_name") or user.get("username")


def archive_path(season, week):
    return DATA_DIR / "seasons" / str(season) / "weeks" / f"week-{week}.json"


def load_archive(season, week):
    path = archive_path(season, week)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def pairings(rows):
    """Group matchup rows into [rosterId, rosterId] pairs by matchupId."""
    groups = {}
    for row in rows or []:
        if row.get("matchupId") is None or row.get("rosterId") is None:
            continue
        groups.setdefault(row["matchupId"], []).append(int(row["rosterId"]))
    return [sorted(ids) for _, ids in sorted(groups.items()) if len(ids) == 2]


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    league = get_json(f"/league/{LEAGUE_ID}")
    if not league:
        raise RuntimeError(f"Sleeper league {LEAGUE_ID} was not found")

    state = get_json("/state/nfl") or {}
    users = get_json(f"/league/{LEAGUE_ID}/users") or []
    rosters = get_json(f"/league/{LEAGUE_ID}/rosters") or []
    drafts = get_json(f"/league/{LEAGUE_ID}/drafts") or []

    users_by_id = {str(user.get("user_id")): user for user in users}
    standings = []

    for roster in rosters:
        owner_id = roster.get("owner_id")
        user = users_by_id.get(str(owner_id), {}) if owner_id else {}
        settings = roster.get("settings") or {}
        roster_id = int(roster.get("roster_id") or 0)
        team_name = user_team_name(user) or f"Roster {roster_id}"
        standings.append(
            {
                "rosterId": roster_id,
                "ownerId": owner_id,
                "owner": user.get("display_name") or user.get("username"),
                "team": team_name,
                "wins": int(settings.get("wins", 0) or 0),
                "losses": int(settings.get("losses", 0) or 0),
                "ties": int(settings.get("ties", 0) or 0),
                "pointsFor": points_from_settings(settings),
                "waiverPosition": settings.get("waiver_position"),
                "players": roster.get("players") or [],
                "starters": roster.get("starters") or [],
            }
        )

    standings.sort(key=lambda row: (-row["wins"], row["losses"], -row["pointsFor"], row["rosterId"]))

    season = int(league.get("season") or state.get("season"))
    current_week = max(1, min(MAX_WEEK, int(state.get("week") or 1)))
    teams = roster_map(rosters, users)
    matchup_weeks = {}
    transaction_weeks = {}
    for week in range(1, current_week + 1):
        # Finished weeks come from the archive; the week in progress (and any
        # week not archived yet) is read live so scores keep updating.
        archive = load_archive(season, week) if week < current_week else None
        if archive:
            matchups = archive.get("matchups") or []
            transactions = archive.get("transactions") or []
        else:
            raw_matchups = get_json(f"/league/{LEAGUE_ID}/matchups/{week}") or []
            raw_transactions = get_json(f"/league/{LEAGUE_ID}/transactions/{week}") or []
            matchups = [normalise_matchup(row, season, week, teams) for row in raw_matchups]
            transactions = [{"week": week, **tx} for tx in raw_transactions]
        if matchups:
            matchup_weeks[str(week)] = matchups
        if transactions:
            transaction_weeks[str(week)] = transactions

    # Regular-season pairings for every week. Sleeper publishes future weeks as
    # 0-point matchups, which is exactly what the playoff-odds simulation needs.
    settings = league.get("settings") or {}
    regular_season_end = max(1, min(MAX_WEEK, int(settings.get("playoff_week_start") or 15) - 1))
    schedule = {}
    for week in range(1, regular_season_end + 1):
        rows = matchup_weeks.get(str(week))
        if rows is None:
            raw = get_json(f"/league/{LEAGUE_ID}/matchups/{week}") or []
            rows = [{"rosterId": r.get("roster_id"), "matchupId": r.get("matchup_id")} for r in raw]
        schedule[str(week)] = pairings(rows)

    draft_picks = {}
    for draft in drafts:
        draft_id = str(draft.get("draft_id") or "")
        if draft_id:
            draft_picks[draft_id] = get_json(f"/draft/{draft_id}/picks") or []

    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "leagueId": LEAGUE_ID,
        "season": league.get("season"),
        "status": league.get("status"),
        "league": league,
        "nflState": state,
        "users": users,
        "standings": standings,
        "matchupsByWeek": matchup_weeks,
        "transactionsByWeek": transaction_weeks,
        "regularSeasonEnd": regular_season_end,
        "schedule": schedule,
        "drafts": drafts,
        "draftPicks": draft_picks,
    }

    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Created {OUTPUT_FILE}")
    print(f"League: {league.get('name')} ({league.get('season')})")
    print(f"Standings rows: {len(standings)}")
    print(f"Matchup weeks with data: {len(matchup_weeks)}")


if __name__ == "__main__":
    main()
