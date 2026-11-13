"""Archive NFL game context for each fantasy week.

For every week this stores, for the players that appear in the league's
matchups, which NFL team they played for and in which game, plus the kickoff
time of every NFL game. The stats builder uses it to replay each fantasy
matchup game window by game window (Thursday, Sunday early, Sunday late,
Sunday night, Monday night), which powers the Thursday curse and the score
timelines.

Sources (both public and unauthenticated, but unofficial, so any failure is
reported and skipped instead of failing the workflow):
- Sleeper weekly stats feed: api.sleeper.com/stats/nfl/<season>/<week>
- ESPN scoreboard: site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard

A week's file is frozen once the week is finished and all its NFL games are
final, the same rule as the matchup archive.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_weekly import last_completed_week  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SLEEPER_STATS = "https://api.sleeper.com/stats/nfl/{season}/{week}?season_type=regular"
ESPN_SCOREBOARD = (
    "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
    "?seasontype=2&week={week}&dates={season}"
)
# ESPN team abbreviations that differ from Sleeper's.
ESPN_TO_SLEEPER = {"WSH": "WAS"}


def get_json(url):
    request = Request(url, headers={"User-Agent": "the-league-dashboard/1.0"})
    try:
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    except HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} for {url}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach {url}: {exc.reason}") from exc


def nfl_path(season, week):
    return DATA / "seasons" / str(season) / "nfl" / f"week-{week}.json"


def league_player_ids(matchups):
    ids = set()
    for row in matchups or []:
        ids.update(str(pid) for pid in (row.get("playersPoints") or {}))
        ids.update(str(s.get("playerId")) for s in row.get("starters") or [])
        ids.update(str(b.get("playerId")) for b in row.get("bench") or [])
    ids.discard("0")
    ids.discard("None")
    return ids


def parse_espn_games(scoreboard):
    games = []
    for event in (scoreboard or {}).get("events") or []:
        competition = (event.get("competitions") or [{}])[0]
        teams = {}
        for competitor in competition.get("competitors") or []:
            abbr = (competitor.get("team") or {}).get("abbreviation")
            abbr = ESPN_TO_SLEEPER.get(abbr, abbr)
            teams[competitor.get("homeAway")] = {
                "team": abbr,
                "score": int(competitor["score"]) if str(competitor.get("score", "")).isdigit() else None,
            }
        status = ((competition.get("status") or event.get("status") or {}).get("type") or {})
        games.append({
            "espnId": event.get("id"),
            "name": event.get("shortName"),
            "kickoff": event.get("date"),
            "home": (teams.get("home") or {}).get("team"),
            "away": (teams.get("away") or {}).get("team"),
            "homeScore": (teams.get("home") or {}).get("score"),
            "awayScore": (teams.get("away") or {}).get("score"),
            "final": bool(status.get("completed")),
        })
    return games


def parse_player_teams(stats, wanted):
    players = {}
    for entry in stats or []:
        player_id = str(entry.get("player_id"))
        if player_id not in wanted or not entry.get("team"):
            continue
        players[player_id] = {
            "team": entry.get("team"),
            "opponent": entry.get("opponent"),
            "date": entry.get("date"),
        }
    return players


def main():
    live_path = DATA / "live.json"
    if not live_path.exists():
        print("data/live.json is missing; run fetch_live.py first.")
        return
    live = json.loads(live_path.read_text(encoding="utf-8"))
    league = live.get("league") or {}
    nfl_state = live.get("nflState") or {}
    season = int(league.get("season") or nfl_state.get("season"))
    current_week = int(nfl_state.get("week") or 1)
    completed = last_completed_week(league, nfl_state, season)
    matchups_by_week = live.get("matchupsByWeek") or {}

    for week in range(1, current_week + 1):
        path = nfl_path(season, week)
        if path.exists() and json.loads(path.read_text(encoding="utf-8")).get("complete"):
            continue
        try:
            games = parse_espn_games(get_json(ESPN_SCOREBOARD.format(season=season, week=week)))
            wanted = league_player_ids(matchups_by_week.get(str(week)))
            players = parse_player_teams(
                get_json(SLEEPER_STATS.format(season=season, week=week)), wanted
            )
        except RuntimeError as exc:
            print(f"Skipped NFL context for week {week}: {exc}")
            continue
        if not games:
            print(f"Skipped NFL context for week {week}: no games listed.")
            continue
        complete = week <= completed and all(game["final"] for game in games)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "season": season,
            "week": week,
            "complete": complete,
            "games": games,
            "players": players,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{'Archived' if complete else 'Updated'} NFL context: {path} "
              f"({len(games)} games, {len(players)} league players)")


if __name__ == "__main__":
    main()
