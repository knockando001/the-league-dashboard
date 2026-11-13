"""Build data/stats.json: every number the season pages show.

Runs offline from files the fetch scripts already wrote, so it needs no
network and no AI:
- data/seasons/<season>/weeks/week-N.json   finished weeks (frozen archive)
- data/live.json                            league settings, schedule, week in progress
- data/seasons/<season>/nfl/week-N.json     NFL teams and kickoff times per week
- data/players.json                         player names and positions
- data/history.json, data/franchises.json   2011-2025 league history

Run after fetch_weekly.py, fetch_live.py and fetch_nfl.py.
"""

import json
import random
import statistics
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SIMULATIONS = 10000
SIM_SEED = 2011  # the league's first season; fixed so odds don't jitter between runs
SHRINK_GAMES = 3  # weight of the league average when estimating a team's strength

SLOT_ELIGIBILITY = {
    "QB": {"QB"}, "RB": {"RB"}, "WR": {"WR"}, "TE": {"TE"}, "K": {"K"}, "DEF": {"DEF"},
    "FLEX": {"RB", "WR", "TE"}, "WRRB_FLEX": {"RB", "WR"}, "REC_FLEX": {"WR", "TE"},
    "SUPER_FLEX": {"QB", "RB", "WR", "TE"},
}


# ---------------------------------------------------------------- loading

def read_json(path, default=None):
    path = Path(path)
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def round2(value):
    return None if value is None else round(float(value), 2)


def norm(text):
    return " ".join(str(text or "").lower().split())


# ---------------------------------------------------------------- lineups

def optimal_points(players_points, player_ids, slots, positions):
    """Best possible starting lineup from the roster that week.

    Slots are filled from the most restrictive to the most flexible, which is
    optimal for nested eligibility sets like QB/RB/WR/TE/K/DEF + RB/WR flex.
    """
    pool = []
    for pid in player_ids:
        pos = set(positions.get(str(pid)) or [])
        if not pos and str(pid).isalpha():
            pos = {"DEF"}  # team defences use the team abbreviation as id
        pool.append((float(players_points.get(str(pid)) or 0), str(pid), pos))
    pool.sort(reverse=True)
    used = set()
    total = 0.0
    for slot in sorted(slots, key=lambda s: len(SLOT_ELIGIBILITY.get(s, {s}))):
        eligible = SLOT_ELIGIBILITY.get(slot, {slot})
        for points, pid, pos in pool:
            if pid not in used and pos & eligible:
                used.add(pid)
                total += points
                break
    return total


def all_play(scores):
    """Wins/losses/ties of each team against every other team that week."""
    result = {}
    for rid, points in scores.items():
        wins = sum(1 for other, p in scores.items() if other != rid and p < points)
        ties = sum(1 for other, p in scores.items() if other != rid and p == points)
        losses = len(scores) - 1 - wins - ties
        result[rid] = (wins, losses, ties)
    return result


def average_ranks(values, higher_is_better=True):
    """Rank values 1..n, giving tied values the average of their ranks."""
    order = sorted(values.items(), key=lambda kv: kv[1], reverse=higher_is_better)
    ranks = {}
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and order[j + 1][1] == order[i][1]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k][0]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


# ---------------------------------------------------------------- game windows

def us_eastern(dt):
    """Convert a UTC datetime to US Eastern time (DST rules since 2007)."""
    year = dt.year
    march = datetime(year, 3, 8, 7, tzinfo=timezone.utc)
    dst_start = march + timedelta(days=(6 - march.weekday()) % 7)  # 2nd Sunday of March, 2am ET
    november = datetime(year, 11, 1, 6, tzinfo=timezone.utc)
    dst_end = november + timedelta(days=(6 - november.weekday()) % 7)  # 1st Sunday of Nov, 2am ET
    offset = -4 if dst_start <= dt < dst_end else -5
    return dt + timedelta(hours=offset)


def window_of(kickoff_iso):
    """Name the TV window an NFL game belongs to, from its kickoff time."""
    utc = datetime.fromisoformat(kickoff_iso.replace("Z", "+00:00"))
    local = us_eastern(utc)
    day = local.strftime("%A")
    if day == "Sunday":
        if local.hour < 12:
            name = "Sunday morning"
        elif local.hour < 16:
            name = "Sunday early"
        elif local.hour < 19:
            name = "Sunday late"
        else:
            name = "Sunday night"
    elif day == "Monday":
        name = "Monday night"
    else:
        name = day
    return name, utc


def build_windows(nfl_week):
    """Ordered list of windows and a team -> window index map."""
    windows = {}
    for game in (nfl_week or {}).get("games") or []:
        if not game.get("kickoff"):
            continue
        name, utc = window_of(game["kickoff"])
        entry = windows.setdefault(name, {"name": name, "start": utc, "teams": set()})
        entry["start"] = min(entry["start"], utc)
        entry["teams"].update(t for t in (game.get("home"), game.get("away")) if t)
    ordered = sorted(windows.values(), key=lambda w: w["start"])
    team_window = {}
    for index, window in enumerate(ordered):
        for team in window["teams"]:
            team_window[team] = index
    return ordered, team_window


def player_team(pid, nfl_week, players):
    info = ((nfl_week or {}).get("players") or {}).get(str(pid))
    if info and info.get("team"):
        return info["team"]
    if str(pid).isalpha():
        return str(pid)
    return (players.get(str(pid)) or {}).get("team")


def timeline(row, nfl_week, windows, team_window, players):
    """Cumulative starter points after each game window."""
    per_window = [0.0] * len(windows)
    for starter in row.get("starters") or []:
        pid = starter.get("playerId")
        points = float(starter.get("points") or 0)
        if not points:
            continue
        index = team_window.get(player_team(pid, nfl_week, players))
        per_window[index if index is not None else len(windows) - 1] += points
    running, out = 0.0, []
    for value in per_window:
        running += value
        out.append(round(running, 2))
    return out


# ---------------------------------------------------------------- season build

class Season:
    def __init__(self, data_dir=DATA):
        self.data = Path(data_dir)
        self.live = read_json(self.data / "live.json", {})
        self.league = self.live.get("league") or {}
        self.settings = self.league.get("settings") or {}
        self.state = self.live.get("nflState") or {}
        self.season = int(self.league.get("season") or self.state.get("season"))
        self.current_week = int(self.state.get("week") or 1)
        self.players = (read_json(self.data / "players.json", {}) or {}).get("players") or {}
        self.positions = {pid: p.get("fantasyPositions") or [p.get("position")] for pid, p in self.players.items()}
        self.slots = [s for s in self.league.get("roster_positions") or [] if s not in ("BN", "IR", "TAXI")]
        self.regular_end = int(self.live.get("regularSeasonEnd") or max(1, int(self.settings.get("playoff_week_start") or 15) - 1))
        self.playoff_teams = int(self.settings.get("playoff_teams") or 4)
        self.franchises = read_json(self.data / "franchises.json", []) or []
        self.history = read_json(self.data / "history.json", []) or []
        self.teams = self.load_teams()
        self.archives = self.load_archives()

    # -- teams
    def load_teams(self):
        by_name = {}
        for franchise in self.franchises:
            for name in [franchise.get("currentName"), *(franchise.get("historicalNames") or [])]:
                by_name[norm(name)] = str(franchise.get("franchiseId"))
        owners = {}
        for row in sorted(self.history, key=lambda r: r.get("season") or 0):
            owners[str(row.get("franchiseId"))] = row.get("owner")
        teams = {}
        for row in self.live.get("standings") or []:
            rid = int(row["rosterId"])
            franchise_id = by_name.get(norm(row.get("team")))
            teams[rid] = {
                "rosterId": rid,
                "team": row.get("team") or f"Roster {rid}",
                "short": short_name(row.get("team") or f"Roster {rid}"),
                "sleeperUser": row.get("owner"),
                "manager": owners.get(franchise_id),
                "franchiseId": franchise_id,
            }
        return teams

    def name(self, rid):
        return (self.teams.get(int(rid)) or {}).get("team") or f"Roster {rid}"

    def player_name(self, pid):
        player = self.players.get(str(pid))
        if player:
            return player.get("name")
        return f"{pid} D/ST" if str(pid).isalpha() else str(pid)

    def player_position(self, pid):
        player = self.players.get(str(pid))
        if player:
            return player.get("position")
        return "DEF" if str(pid).isalpha() else None

    # -- weeks
    def load_archives(self):
        archives = {}
        weeks_dir = self.data / "seasons" / str(self.season) / "weeks"
        for path in sorted(weeks_dir.glob("week-*.json")):
            try:
                week = int(path.stem.split("-")[1])
            except (IndexError, ValueError):
                continue
            archives[week] = read_json(path)
        return archives

    def nfl_week(self, week):
        return read_json(self.data / "seasons" / str(self.season) / "nfl" / f"week-{week}.json")

    def week_rows(self, week):
        if week in self.archives:
            return self.archives[week].get("matchups") or [], self.archives[week].get("transactions") or [], False
        rows = (self.live.get("matchupsByWeek") or {}).get(str(week)) or []
        txs = (self.live.get("transactionsByWeek") or {}).get(str(week)) or []
        return rows, txs, True

    def build_week(self, week):
        rows, transactions, live = self.week_rows(week)
        if not rows:
            return None
        nfl = self.nfl_week(week)
        windows, team_window = build_windows(nfl)
        scores = {int(r["rosterId"]): float(r.get("points") or 0) for r in rows}
        ap = all_play(scores)
        team_weeks = {}
        for row in rows:
            rid = int(row["rosterId"])
            player_ids = [s["playerId"] for s in row.get("starters") or []] + [b["playerId"] for b in row.get("bench") or []]
            optimal = optimal_points(row.get("playersPoints") or {}, player_ids, self.slots, self.positions)
            bench_points = sum(float(b.get("points") or 0) for b in row.get("bench") or [])
            starters = sorted(
                ({"playerId": s["playerId"], "points": float(s.get("points") or 0)} for s in row.get("starters") or []),
                key=lambda s: s["points"], reverse=True,
            )
            bench = sorted(
                ({"playerId": b["playerId"], "points": float(b.get("points") or 0)} for b in row.get("bench") or []),
                key=lambda s: s["points"], reverse=True,
            )
            team_weeks[rid] = {
                "rosterId": rid,
                "matchupId": row.get("matchupId"),
                "points": scores[rid],
                "optimal": round2(max(optimal, scores[rid])),
                "coach": round(scores[rid] / optimal, 4) if optimal else None,
                "benchPoints": round2(bench_points),
                "allPlay": ap[rid],
                "timeline": timeline(row, nfl, windows, team_window, self.players) if windows else [],
                "starters": starters,
                "bench": bench,
                "starterIds": {str(s["playerId"]) for s in row.get("starters") or []},
            }
        matchups = []
        groups = defaultdict(list)
        for tw in team_weeks.values():
            if tw["matchupId"] is not None:
                groups[tw["matchupId"]].append(tw)
        for matchup_id, pair in sorted(groups.items()):
            if len(pair) != 2:
                continue
            a, b = sorted(pair, key=lambda t: -t["points"])
            margin = round(a["points"] - b["points"], 2)
            winner = None if live or margin == 0 else a["rosterId"]
            for me, opp in ((a, b), (b, a)):
                me["opponent"] = opp["rosterId"]
                me["opponentPoints"] = opp["points"]
                me["result"] = None if live else ("T" if margin == 0 else ("W" if me is a else "L"))
            matchups.append({
                "matchupId": matchup_id,
                "teams": [self.public_team_week(a), self.public_team_week(b)],
                "winner": winner,
                "leader": a["rosterId"] if margin else None,
                "margin": margin,
                "total": round2(a["points"] + b["points"]),
            })
        return {
            "week": week,
            "live": live,
            "playoffs": week > self.regular_end,
            "windows": [{"name": w["name"], "start": w["start"].isoformat()} for w in windows],
            "teamWeeks": team_weeks,
            "matchups": matchups,
            "transactions": transactions,
        }

    def public_team_week(self, tw):
        return {
            "rosterId": tw["rosterId"],
            "points": round2(tw["points"]),
            "optimal": tw["optimal"],
            "coach": tw["coach"],
            "benchPoints": tw["benchPoints"],
            "timeline": tw["timeline"],
            "topStarters": [self.player_line(p) for p in tw["starters"][:3]],
            "topBench": [self.player_line(p) for p in tw["bench"][:2] if p["points"] > 0],
        }

    def player_line(self, p):
        return {
            "playerId": str(p["playerId"]),
            "name": self.player_name(p["playerId"]),
            "position": self.player_position(p["playerId"]),
            "points": round2(p["points"]),
        }


def short_name(team):
    """'Gdynia Moustache Admirers' -> 'Gdynia' (first word, as the newsletter does)."""
    first = str(team).split()[0] if team else ""
    return first.replace("Potega", "Potęga")


# ---------------------------------------------------------------- awards and curse

def week_awards(season, week):
    tws = list(week["teamWeeks"].values())
    if not tws:
        return {}
    name = season.name
    by_points = sorted(tws, key=lambda t: t["points"], reverse=True)
    awards = {
        "topScore": {"rosterId": by_points[0]["rosterId"], "team": name(by_points[0]["rosterId"]), "points": round2(by_points[0]["points"])},
        "lowScore": {"rosterId": by_points[-1]["rosterId"], "team": name(by_points[-1]["rosterId"]), "points": round2(by_points[-1]["points"])},
    }
    coaches = [t for t in tws if t["coach"] is not None]
    if coaches:
        best = max(coaches, key=lambda t: t["coach"])
        worst = max(tws, key=lambda t: (t["optimal"] or 0) - t["points"])
        awards["bestCoach"] = {"rosterId": best["rosterId"], "team": name(best["rosterId"]), "coach": best["coach"]}
        awards["mostLeftOnBench"] = {
            "rosterId": worst["rosterId"], "team": name(worst["rosterId"]),
            "left": round2((worst["optimal"] or 0) - worst["points"]), "coach": worst["coach"],
        }
    starters = [(p, t) for t in tws for p in t["starters"]]
    if starters:
        p, t = max(starters, key=lambda x: x[0]["points"])
        awards["playerOfWeek"] = {**season.player_line(p), "rosterId": t["rosterId"], "team": name(t["rosterId"])}
    bench = [(p, t) for t in tws for p in t["bench"]]
    if bench:
        p, t = max(bench, key=lambda x: x[0]["points"])
        if p["points"] > 0:
            entry = {**season.player_line(p), "rosterId": t["rosterId"], "team": name(t["rosterId"])}
            if t.get("result") == "L":
                entry["lostBy"] = round2(t["opponentPoints"] - t["points"])
            awards["benchOfWeek"] = entry
    if not week["live"] and week["matchups"]:
        by_margin = sorted(week["matchups"], key=lambda m: m["margin"])
        awards["closest"] = matchup_award(season, by_margin[0])
        awards["blowout"] = matchup_award(season, by_margin[-1])
        losers = [t for t in tws if t.get("result") == "L"]
        winners = [t for t in tws if t.get("result") == "W"]
        if losers:
            t = max(losers, key=lambda x: x["points"])
            awards["unluckiest"] = {"rosterId": t["rosterId"], "team": name(t["rosterId"]), "points": round2(t["points"]),
                                    "allPlayWins": t["allPlay"][0]}
        if winners:
            t = min(winners, key=lambda x: x["points"])
            awards["luckiest"] = {"rosterId": t["rosterId"], "team": name(t["rosterId"]), "points": round2(t["points"]),
                                  "allPlayWins": t["allPlay"][0]}
    return awards


def matchup_award(season, m):
    a, b = m["teams"]
    return {"winner": a["rosterId"], "loser": b["rosterId"], "winnerTeam": season.name(a["rosterId"]),
            "loserTeam": season.name(b["rosterId"]), "score": [a["points"], b["points"]], "margin": m["margin"]}


def week_curse(season, week):
    """Thursday curse: who led after the games before Sunday, and did they win?"""
    windows = week["windows"]
    if not windows:
        return None
    pre_sunday = [i for i, w in enumerate(windows) if not w["name"].startswith(("Sunday", "Monday"))]
    if not pre_sunday:
        return None
    cut = pre_sunday[-1]
    label = " + ".join(windows[i]["name"] for i in pre_sunday)
    leaders, comebacks = [], []
    for m in week["matchups"]:
        a, b = m["teams"]
        if not a["timeline"] or not b["timeline"]:
            continue
        ta, tb = a["timeline"][cut], b["timeline"][cut]
        if ta != tb:
            leader, trailer = (a, b) if ta > tb else (b, a)
            lead = round(abs(ta - tb), 2)
            held = None if week["live"] else m["winner"] == leader["rosterId"]
            leaders.append({"rosterId": leader["rosterId"], "team": season.name(leader["rosterId"]),
                            "opponent": trailer["rosterId"], "opponentTeam": season.name(trailer["rosterId"]),
                            "lead": lead, "held": held})
        if not week["live"] and m["winner"] is not None:
            winner = a if a["rosterId"] == m["winner"] else b
            loser = b if winner is a else a
            deficit = max(lt - wt for wt, lt in zip(winner["timeline"], loser["timeline"]))
            if deficit > 0:
                comebacks.append({"rosterId": winner["rosterId"], "team": season.name(winner["rosterId"]),
                                  "opponentTeam": season.name(loser["rosterId"]), "deficit": round2(deficit)})
    decided = [x for x in leaders if x["held"] is not None]
    return {
        "window": label,
        "leaders": sorted(leaders, key=lambda x: -x["lead"]),
        "leadersLost": sum(1 for x in decided if not x["held"]),
        "leadersDecided": len(decided),
        "biggestComeback": max(comebacks, key=lambda x: x["deficit"]) if comebacks else None,
    }


# ---------------------------------------------------------------- season table

def season_table(season, weeks):
    rows = {rid: {"rosterId": rid, "team": t["team"], "wins": 0, "losses": 0, "ties": 0, "pf": 0.0, "pa": 0.0,
                  "apW": 0, "apL": 0, "apT": 0, "optimal": 0.0, "bench": 0.0, "scores": [], "results": []}
            for rid, t in season.teams.items()}
    for week in weeks:
        if week["live"] or week["playoffs"]:
            continue
        for rid, tw in week["teamWeeks"].items():
            r = rows.setdefault(rid, {"rosterId": rid, "team": season.name(rid), "wins": 0, "losses": 0, "ties": 0,
                                      "pf": 0.0, "pa": 0.0, "apW": 0, "apL": 0, "apT": 0, "optimal": 0.0,
                                      "bench": 0.0, "scores": [], "results": []})
            r["wins"] += tw.get("result") == "W"
            r["losses"] += tw.get("result") == "L"
            r["ties"] += tw.get("result") == "T"
            r["pf"] += tw["points"]
            r["pa"] += tw.get("opponentPoints") or 0
            w, l, t = tw["allPlay"]
            r["apW"] += w
            r["apL"] += l
            r["apT"] += t
            r["optimal"] += tw["optimal"] or 0
            r["bench"] += tw["benchPoints"] or 0
            r["scores"].append(round2(tw["points"]))
            r["results"].append(tw.get("result"))
    out = []
    for r in rows.values():
        games = len(r["scores"])
        ap_games = r["apW"] + r["apL"] + r["apT"]
        expected = (r["apW"] + 0.5 * r["apT"]) / ap_games * games if ap_games else 0
        streak = current_streak(r["results"])
        last3 = r["scores"][-3:]
        out.append({
            "rosterId": r["rosterId"], "team": r["team"],
            "wins": r["wins"], "losses": r["losses"], "ties": r["ties"],
            "pointsFor": round2(r["pf"]), "pointsAgainst": round2(r["pa"]),
            "avgPoints": round2(r["pf"] / games) if games else None,
            "allPlay": {"wins": r["apW"], "losses": r["apL"], "ties": r["apT"],
                        "pct": round((r["apW"] + 0.5 * r["apT"]) / ap_games, 4) if ap_games else None},
            "expectedWins": round2(expected),
            "luck": round2(r["wins"] + 0.5 * r["ties"] - expected),
            "coach": round(r["pf"] / r["optimal"], 4) if r["optimal"] else None,
            "benchPoints": round2(r["bench"]),
            "leftOnBench": round2(r["optimal"] - r["pf"]),
            "high": max(r["scores"]) if r["scores"] else None,
            "low": min(r["scores"]) if r["scores"] else None,
            "last3": round2(sum(last3) / len(last3)) if last3 else None,
            "streak": streak or None,
            "form": r["results"][-5:],
            "scores": r["scores"],
        })
    # Ranking True, as defined in The League Insider: rank on all-play record +
    # rank on Coach % + rank on points for. Lowest total is best.
    ap_rank = average_ranks({r["rosterId"]: r["allPlay"]["pct"] or 0 for r in out})
    coach_rank = average_ranks({r["rosterId"]: r["coach"] or 0 for r in out})
    pf_rank = average_ranks({r["rosterId"]: r["pointsFor"] or 0 for r in out})
    for r in out:
        r["trueScore"] = ap_rank[r["rosterId"]] + coach_rank[r["rosterId"]] + pf_rank[r["rosterId"]]
    true_order = sorted(out, key=lambda r: (r["trueScore"], -(r["allPlay"]["pct"] or 0)))
    for i, r in enumerate(true_order, 1):
        r["trueRank"] = i
    out.sort(key=lambda r: (-(r["wins"] + 0.5 * r["ties"]), -(r["pointsFor"] or 0)))
    for i, r in enumerate(out, 1):
        r["rank"] = i
    return out


def current_streak(results):
    """'W3' for three wins in a row at the end of the list, '' when empty."""
    if not results or results[-1] is None:
        return ""
    last, count = results[-1], 0
    for res in reversed(results):
        if res != last:
            break
        count += 1
    return f"{last}{count}"


def rank_by_week(season, weeks):
    """Standings position after each finished regular-season week."""
    wins = defaultdict(float)
    pf = defaultdict(float)
    history = defaultdict(list)
    done = []
    for week in weeks:
        if week["live"] or week["playoffs"]:
            continue
        for rid, tw in week["teamWeeks"].items():
            wins[rid] += {"W": 1, "T": 0.5}.get(tw.get("result"), 0)
            pf[rid] += tw["points"]
        order = sorted(season.teams, key=lambda rid: (-wins[rid], -pf[rid]))
        for pos, rid in enumerate(order, 1):
            history[rid].append(pos)
        done.append(week["week"])
    return {"weeks": done, "byTeam": {str(rid): ranks for rid, ranks in history.items()}}


# ---------------------------------------------------------------- playoff odds

def simulate(season, weeks, through_week, sims=SIMULATIONS, seed=SIM_SEED):
    """Monte Carlo the rest of the regular season using results through a week.

    Each team's weekly score is drawn from a normal distribution around its
    average so far, pulled towards the league average (SHRINK_GAMES), with the
    league-wide spread of scores. Seeding: wins, then points for.
    """
    played = [w for w in weeks if not w["live"] and not w["playoffs"] and w["week"] <= through_week]
    teams = sorted(season.teams)
    wins = {rid: 0.0 for rid in teams}
    pf = {rid: 0.0 for rid in teams}
    scores = defaultdict(list)
    for week in played:
        for rid, tw in week["teamWeeks"].items():
            wins[rid] += {"W": 1, "T": 0.5}.get(tw.get("result"), 0)
            pf[rid] += tw["points"]
            scores[rid].append(tw["points"])
    every = [s for values in scores.values() for s in values]
    league_mean = statistics.mean(every) if every else 100.0
    spread = statistics.pstdev(every) if len(every) > 2 else 20.0
    strength = {rid: (sum(scores[rid]) + SHRINK_GAMES * league_mean) / (len(scores[rid]) + SHRINK_GAMES)
                for rid in teams}
    remaining = []
    for week_no in range(through_week + 1, season.regular_end + 1):
        for pair in (season.live.get("schedule") or {}).get(str(week_no)) or []:
            remaining.append((int(pair[0]), int(pair[1])))
    rng = random.Random(seed + through_week)
    playoff = defaultdict(int)
    first = defaultdict(int)
    last = defaultdict(int)
    for _ in range(sims):
        w = dict(wins)
        p = dict(pf)
        for a, b in remaining:
            sa = rng.gauss(strength[a], spread)
            sb = rng.gauss(strength[b], spread)
            p[a] += sa
            p[b] += sb
            if sa > sb:
                w[a] += 1
            else:
                w[b] += 1
        order = sorted(teams, key=lambda rid: (-w[rid], -p[rid]))
        for rid in order[:season.playoff_teams]:
            playoff[rid] += 1
        first[order[0]] += 1
        last[order[-1]] += 1
    return {str(rid): {"playoff": round(playoff[rid] / sims, 4), "first": round(first[rid] / sims, 4),
                       "last": round(last[rid] / sims, 4)} for rid in teams}


def odds_history(season, weeks):
    done = [w["week"] for w in weeks if not w["live"] and not w["playoffs"]]
    if not done:
        return {"weeks": [], "byWeek": {}}
    by_week = {}
    for week_no in done:
        by_week[str(week_no)] = simulate(season, weeks, week_no)
    return {"weeks": done, "byWeek": by_week, "simulations": SIMULATIONS}


# ---------------------------------------------------------------- transactions

def transactions(season, weeks):
    starter_points = {}  # (week, rid, pid) -> points while started
    for week in weeks:
        for rid, tw in week["teamWeeks"].items():
            for s in tw["starters"]:
                starter_points[(week["week"], rid, str(s["playerId"]))] = s["points"]
    all_tx = []
    for week in weeks:
        for tx in week["transactions"]:
            all_tx.append((week["week"], tx))
    all_tx.sort(key=lambda x: (x[1].get("status_updated") or x[1].get("created") or 0))
    feed = []
    last_week = max((w["week"] for w in weeks), default=0)
    for i, (week_no, tx) in enumerate(all_tx):
        adds = {str(pid): int(rid) for pid, rid in (tx.get("adds") or {}).items()}
        drops = {str(pid): int(rid) for pid, rid in (tx.get("drops") or {}).items()}
        item = {
            "transactionId": tx.get("transaction_id"),
            "week": week_no,
            "type": tx.get("type"),
            "status": tx.get("status"),
            "time": tx.get("status_updated") or tx.get("created"),
            "rosterIds": [int(r) for r in tx.get("roster_ids") or []],
            "adds": [{"playerId": pid, "name": season.player_name(pid), "position": season.player_position(pid),
                      "rosterId": rid} for pid, rid in adds.items()],
            "drops": [{"playerId": pid, "name": season.player_name(pid), "position": season.player_position(pid),
                       "rosterId": rid} for pid, rid in drops.items()],
            "waiverBid": (tx.get("settings") or {}).get("waiver_bid"),
            "draftPicks": tx.get("draft_picks") or [],
        }
        if tx.get("status") == "complete":
            for add in item["adds"]:
                # Points this player started for the new team until that team dropped him again.
                end = last_week
                for later_week, later in all_tx[i + 1:]:
                    if later.get("status") == "complete" and str((later.get("drops") or {}).get(add["playerId"], "")) == str(add["rosterId"]):
                        end = later_week if later_week > week_no else week_no
                        break
                total, starts = 0.0, 0
                for w in range(week_no, end + 1):
                    pts = starter_points.get((w, add["rosterId"], add["playerId"]))
                    if pts is not None:
                        total += pts
                        starts += 1
                add["startedPoints"] = round2(total)
                add["starts"] = starts
                add["weekPoints"] = round2(starter_points.get((week_no, add["rosterId"], add["playerId"])))
        feed.append(item)
    feed.reverse()  # newest first

    pickups = [dict(add, week=t["week"], type=t["type"], team=season.name(add["rosterId"]))
               for t in feed if t["status"] == "complete" and t["type"] in ("waiver", "free_agent")
               for add in t["adds"]]
    best_pickups = sorted([p for p in pickups if p.get("startedPoints")], key=lambda p: -p["startedPoints"])[:10]

    battles = defaultdict(list)
    for t in feed:
        if t["type"] != "waiver":
            continue
        for add in t["adds"]:
            battles[(t["week"], add["playerId"])].append((t["status"], add["rosterId"]))
    waiver_battles = []
    for (week_no, pid), claims in battles.items():
        if len(claims) < 2:
            continue
        winner = next((rid for status, rid in claims if status == "complete"), None)
        waiver_battles.append({
            "week": week_no, "playerId": pid, "name": season.player_name(pid), "position": season.player_position(pid),
            "winner": winner, "winnerTeam": season.name(winner) if winner else None,
            "losers": [season.name(rid) for status, rid in claims if status != "complete"],
            "loserIds": [rid for status, rid in claims if status != "complete"],
            "claims": len(claims),
        })
    waiver_battles.sort(key=lambda b: (-b["claims"], -b["week"]))

    per_team = {}
    for rid in season.teams:
        mine = [t for t in feed if rid in t["rosterIds"]]
        per_team[str(rid)] = {
            "waiverClaims": sum(1 for t in mine if t["type"] == "waiver"),
            "waiverWins": sum(1 for t in mine if t["type"] == "waiver" and t["status"] == "complete"),
            "freeAgents": sum(1 for t in mine if t["type"] == "free_agent" and t["status"] == "complete"),
            "trades": sum(1 for t in mine if t["type"] == "trade" and t["status"] == "complete"),
            "pickupPoints": round2(sum(p.get("startedPoints") or 0 for p in pickups if p["rosterId"] == rid)),
        }
    return {"feed": feed, "bestPickups": best_pickups, "waiverBattles": waiver_battles[:12], "perTeam": per_team}


def move_of_week(season, week, tx_feed):
    candidates = [dict(add, type=t["type"]) for t in tx_feed
                  if t["week"] == week["week"] and t["status"] == "complete" and t["type"] in ("waiver", "free_agent")
                  for add in t["adds"] if add.get("weekPoints")]
    if not candidates:
        return None
    best = max(candidates, key=lambda a: a["weekPoints"])
    return {**best, "team": season.name(best["rosterId"])}


# ---------------------------------------------------------------- records

def season_records(season, weeks):
    tws = [(w["week"], tw) for w in weeks if not w["live"] for tw in w["teamWeeks"].values()]
    if not tws:
        return []
    records = []

    def team_rec(key, title, week_no, tw, value, detail=""):
        records.append({"key": key, "title": title, "week": week_no, "rosterId": tw["rosterId"],
                        "team": season.name(tw["rosterId"]), "value": round2(value), "detail": detail})

    w, tw = max(tws, key=lambda x: x[1]["points"])
    team_rec("highScore", "Highest score", w, tw, tw["points"], f"vs {season.name(tw.get('opponent'))}")
    w, tw = min(tws, key=lambda x: x[1]["points"])
    team_rec("lowScore", "Lowest score", w, tw, tw["points"], f"vs {season.name(tw.get('opponent'))}")
    losers = [x for x in tws if x[1].get("result") == "L"]
    if losers:
        w, tw = max(losers, key=lambda x: x[1]["points"])
        team_rec("bestLoss", "Highest score in a loss", w, tw, tw["points"], f"lost to {season.name(tw.get('opponent'))}")
    winners = [x for x in tws if x[1].get("result") == "W"]
    if winners:
        w, tw = min(winners, key=lambda x: x[1]["points"])
        team_rec("worstWin", "Lowest score in a win", w, tw, tw["points"], f"beat {season.name(tw.get('opponent'))}")
        w, tw = max(winners, key=lambda x: x[1]["points"] - x[1]["opponentPoints"])
        team_rec("blowout", "Biggest win", w, tw, tw["points"] - tw["opponentPoints"],
                 f"{round2(tw['points'])} : {round2(tw['opponentPoints'])} vs {season.name(tw.get('opponent'))}")
        w, tw = min(winners, key=lambda x: x[1]["points"] - x[1]["opponentPoints"])
        team_rec("closest", "Closest win", w, tw, tw["points"] - tw["opponentPoints"],
                 f"{round2(tw['points'])} : {round2(tw['opponentPoints'])} vs {season.name(tw.get('opponent'))}")
    w, tw = max(tws, key=lambda x: x[1]["benchPoints"] or 0)
    team_rec("bench", "Most points on the bench", w, tw, tw["benchPoints"])
    w, tw = max(tws, key=lambda x: x[1]["coach"] or 0)
    team_rec("coach", "Best Coach %", w, tw, (tw["coach"] or 0) * 100, "percent of the best possible lineup")
    w, tw = min(tws, key=lambda x: x[1]["coach"] or 1)
    team_rec("badCoach", "Worst Coach %", w, tw, (tw["coach"] or 0) * 100,
             f"{round2((tw['optimal'] or 0) - tw['points'])} points left on the bench")
    starters = [(w, tw, p) for w, tw in tws for p in tw["starters"]]
    if starters:
        w, tw, p = max(starters, key=lambda x: x[2]["points"])
        records.append({"key": "playerGame", "title": "Best player game", "week": w, "rosterId": tw["rosterId"],
                        "team": season.name(tw["rosterId"]), "value": round2(p["points"]),
                        "detail": f"{season.player_name(p['playerId'])} ({season.player_position(p['playerId'])})"})
    bench = [(w, tw, p) for w, tw in tws for p in tw["bench"]]
    if bench:
        w, tw, p = max(bench, key=lambda x: x[2]["points"])
        records.append({"key": "benchPlayer", "title": "Best game on the bench", "week": w, "rosterId": tw["rosterId"],
                        "team": season.name(tw["rosterId"]), "value": round2(p["points"]),
                        "detail": f"{season.player_name(p['playerId'])} ({season.player_position(p['playerId'])})"})
    # Streaks across finished weeks.
    by_team = defaultdict(list)
    for w, tw in sorted(tws, key=lambda x: x[0]):
        by_team[tw["rosterId"]].append(tw.get("result"))
    for want, key, title in (("W", "winStreak", "Longest winning streak"), ("L", "lossStreak", "Longest losing streak")):
        best = (0, None)
        for rid, results in by_team.items():
            run = top = 0
            for res in results:
                run = run + 1 if res == want else 0
                top = max(top, run)
            if top > best[0]:
                best = (top, rid)
        if best[1] is not None:
            records.append({"key": key, "title": title, "week": None, "rosterId": best[1],
                            "team": season.name(best[1]), "value": best[0], "detail": "games"})
    return records


# ---------------------------------------------------------------- history corner

def history_corner(season):
    rows = [r for r in season.history if r.get("season")]
    if not rows:
        return {}
    by_season = defaultdict(list)
    for r in rows:
        by_season[int(r["season"])].append(r)

    def team_line(r):
        games = (r.get("wins") or 0) + (r.get("losses") or 0) + (r.get("ties") or 0)
        return {"season": int(r["season"]), "franchiseId": str(r.get("franchiseId")), "team": r.get("teamName"),
                "manager": r.get("owner"), "record": f"{r.get('wins')}-{r.get('losses')}" + (f"-{r['ties']}" if r.get("ties") else ""),
                "winPct": round((r.get("wins", 0) + 0.5 * r.get("ties", 0)) / games, 4) if games else None,
                "pointsFor": round2(r.get("pointsFor")), "ppg": round2((r.get("pointsFor") or 0) / games) if games else None,
                "finalRank": r.get("finalRank"), "seed": r.get("playoffSeed")}

    # history.json only has rows for today's franchises, so a season's real last
    # place can be missing. The league never shrank, so when a season's lowest
    # recorded place is above the previous season's, its last place is unknown.
    sacko = []
    previous_size = 0
    for year, teams in sorted(by_season.items()):
        ranked = [t for t in teams if t.get("finalRank")]
        if not ranked:
            continue
        lowest = max(t["finalRank"] for t in ranked)
        entry = team_line(max(ranked, key=lambda t: t["finalRank"]))
        entry["uncertain"] = lowest < previous_size
        previous_size = max(previous_size, lowest)
        sacko.append(entry)
    champions = [team_line(r) for r in rows if r.get("finalRank") == 1]
    no_title = [team_line(r) for r in rows if r.get("finalRank") not in (None, 1)]
    managers = defaultdict(lambda: {"lastPlaces": 0, "losingSeasons": 0, "seasons": 0, "wins": 0, "losses": 0, "ties": 0,
                                    "titles": 0, "teams": set()})
    last_ids = {(s["season"], s["franchiseId"]) for s in sacko if not s["uncertain"]}
    for r in rows:
        m = managers[r.get("owner") or "Unknown"]
        m["seasons"] += 1
        m["wins"] += r.get("wins") or 0
        m["losses"] += r.get("losses") or 0
        m["ties"] += r.get("ties") or 0
        m["titles"] += r.get("finalRank") == 1
        m["losingSeasons"] += (r.get("losses") or 0) > (r.get("wins") or 0)
        m["lastPlaces"] += (int(r["season"]), str(r.get("franchiseId"))) in last_ids
        m["teams"].add(r.get("teamName"))
    anti = []
    for name, m in managers.items():
        games = m["wins"] + m["losses"] + m["ties"]
        anti.append({"manager": name, "lastPlaces": m["lastPlaces"], "losingSeasons": m["losingSeasons"],
                     "seasons": m["seasons"], "record": f"{m['wins']}-{m['losses']}" + (f"-{m['ties']}" if m["ties"] else ""),
                     "winPct": round((m["wins"] + 0.5 * m["ties"]) / games, 4) if games else None,
                     "titles": m["titles"], "teams": sorted(t for t in m["teams"] if t)})
    anti.sort(key=lambda m: (-m["lastPlaces"], -m["losingSeasons"], m["winPct"] or 0))
    worst_ppg = sorted((team_line(r) for r in rows), key=lambda t: t["ppg"] or 0)[:5]
    return {
        "sacko": sacko,
        "antiGallery": anti,
        "bestWithoutTitle": sorted(no_title, key=lambda t: (-(t["winPct"] or 0), -(t["pointsFor"] or 0)))[:8],
        "weakestChampions": sorted(champions, key=lambda t: (t["winPct"] or 0, t["pointsFor"] or 0))[:6],
        "fewestPointsPerGame": worst_ppg,
        "seasons": [min(by_season), max(by_season)],
    }


# ---------------------------------------------------------------- main

def build(data_dir=DATA):
    season = Season(data_dir)
    week_numbers = sorted(set(season.archives) | {int(w) for w in (season.live.get("matchupsByWeek") or {})})
    weeks = [w for w in (season.build_week(n) for n in week_numbers) if w]
    tx = transactions(season, weeks)
    out_weeks = []
    for week in weeks:
        awards = week_awards(season, week)
        move = move_of_week(season, week, tx["feed"])
        if move:
            awards["moveOfWeek"] = move
        out_weeks.append({
            "week": week["week"], "live": week["live"], "playoffs": week["playoffs"],
            "windows": week["windows"], "matchups": week["matchups"],
            "awards": awards, "curse": week_curse(season, week),
            "allPlay": {str(rid): tw["allPlay"] for rid, tw in week["teamWeeks"].items()},
        })
    finished = [w["week"] for w in weeks if not w["live"]]
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "season": season.season,
        "leagueName": season.league.get("name"),
        "currentWeek": season.current_week,
        "lastFinishedWeek": max(finished) if finished else 0,
        "regularSeasonEnd": season.regular_end,
        "playoffTeams": season.playoff_teams,
        "tradeDeadline": season.settings.get("trade_deadline"),
        "waiverType": season.settings.get("waiver_type"),
        "teams": list(season.teams.values()),
        "table": season_table(season, weeks),
        "rankByWeek": rank_by_week(season, weeks),
        "odds": odds_history(season, weeks),
        "weeks": out_weeks,
        "records": season_records(season, weeks),
        "transactions": tx,
        "history": history_corner(season),
    }


def main():
    stats = build()
    path = DATA / "stats.json"
    path.write_text(json.dumps(stats, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Created {path}")
    print(f"Season {stats['season']}: {len(stats['weeks'])} weeks, last finished week {stats['lastFinishedWeek']}")
    print(f"Transactions: {len(stats['transactions']['feed'])}; records: {len(stats['records'])}")


if __name__ == "__main__":
    main()
