import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import scripts.build_stats as build_stats
import scripts.fetch_weekly as fetch_weekly

SLOTS = ["QB", "RB", "RB", "WR", "WR", "TE", "WRRB_FLEX", "K", "DEF"]


class LineupTests(unittest.TestCase):
    def test_optimal_lineup_fills_flex_with_best_remaining_rb_or_wr(self):
        positions = {"qb": ["QB"], "rb1": ["RB"], "rb2": ["RB"], "rb3": ["RB"], "wr1": ["WR"],
                     "wr2": ["WR"], "te1": ["TE"], "te2": ["TE"], "k": ["K"]}
        points = {"qb": 20, "rb1": 15, "rb2": 10, "rb3": 9, "wr1": 12, "wr2": 8, "te1": 5, "te2": 30, "k": 7, "SF": 4}
        total = build_stats.optimal_points(points, list(points), SLOTS, positions)
        # QB 20 + RB 15+10 + WR 12+8 + TE 30 + FLEX rb3 9 (TE not flex-eligible) + K 7 + DEF 4
        self.assertEqual(total, 115)

    def test_all_play_counts_ties(self):
        self.assertEqual(build_stats.all_play({1: 100, 2: 90, 3: 90}), {1: (2, 0, 0), 2: (0, 1, 1), 3: (0, 1, 1)})

    def test_average_ranks_share_tied_places(self):
        self.assertEqual(build_stats.average_ranks({1: 5, 2: 9, 3: 5}), {2: 1, 1: 2.5, 3: 2.5})

    def test_current_streak(self):
        self.assertEqual(build_stats.current_streak(["W", "L", "L", "L"]), "L3")
        self.assertEqual(build_stats.current_streak([]), "")


class WindowTests(unittest.TestCase):
    def test_kickoffs_map_to_tv_windows(self):
        self.assertEqual(build_stats.window_of("2026-11-06T01:15Z")[0], "Thursday")  # 20:15 ET Thu
        self.assertEqual(build_stats.window_of("2026-11-08T14:30Z")[0], "Sunday morning")  # London 9:30 ET
        self.assertEqual(build_stats.window_of("2026-11-08T18:00Z")[0], "Sunday early")
        self.assertEqual(build_stats.window_of("2026-11-08T21:25Z")[0], "Sunday late")
        self.assertEqual(build_stats.window_of("2026-11-09T01:20Z")[0], "Sunday night")
        self.assertEqual(build_stats.window_of("2026-11-10T01:15Z")[0], "Monday night")
        self.assertEqual(build_stats.window_of("2026-09-14T00:20Z")[0], "Sunday night")  # still EDT

    def test_us_eastern_switches_at_dst_end(self):
        before = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
        after = datetime(2026, 11, 2, 12, tzinfo=timezone.utc)
        self.assertEqual(build_stats.us_eastern(before).hour, 8)
        self.assertEqual(build_stats.us_eastern(after).hour, 7)


class PlayerCacheTests(unittest.TestCase):
    def test_cache_age_comes_from_generated_at_not_file_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "players.json"
            now = datetime(2026, 11, 13, 12, tzinfo=timezone.utc)
            path.write_text(json.dumps({"generatedAt": (now - timedelta(hours=2)).isoformat()}), encoding="utf-8")
            self.assertFalse(fetch_weekly.players_cache_is_stale(path, now))
            path.write_text(json.dumps({"generatedAt": (now - timedelta(days=2)).isoformat()}), encoding="utf-8")
            self.assertTrue(fetch_weekly.players_cache_is_stale(path, now))
            self.assertTrue(fetch_weekly.players_cache_is_stale(Path(tmp) / "missing.json", now))

    def test_slim_players_keeps_fantasy_positions_only(self):
        slim = fetch_weekly.slim_players({
            "1": {"full_name": "Josh Allen", "position": "QB", "fantasy_positions": ["QB"], "team": "BUF", "active": True},
            "2": {"first_name": "Big", "last_name": "Lineman", "position": "OT", "fantasy_positions": ["OL"]},
            "BUF": {"first_name": "Buffalo", "last_name": "Bills", "position": "DEF", "fantasy_positions": ["DEF"], "team": "BUF"},
        })
        self.assertEqual(sorted(slim), ["1", "BUF"])
        self.assertEqual(slim["1"]["name"], "Josh Allen")
        self.assertEqual(slim["BUF"]["name"], "Buffalo Bills")


def matchup(rid, mid, points, starters):
    return {"rosterId": rid, "matchupId": mid, "points": points,
            "starters": [{"playerId": pid, "points": pts} for pid, pts in starters],
            "bench": [], "playersPoints": {pid: pts for pid, pts in starters}, "teamName": f"Team {rid}"}


class BuildTests(unittest.TestCase):
    """End-to-end on a tiny 4-team league with two finished weeks and one live week."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        data = Path(self.tmp.name)
        weeks = data / "seasons" / "2026" / "weeks"
        nfl = data / "seasons" / "2026" / "nfl"
        weeks.mkdir(parents=True)
        nfl.mkdir(parents=True)
        # Week 1: team 1 leads after Thursday (player t1 for THU team) but loses.
        week1 = [matchup(1, 1, 90, [("t1", 40), ("s1", 50)]), matchup(2, 1, 100, [("t2", 10), ("s2", 90)]),
                 matchup(3, 2, 120, [("s3", 120)]), matchup(4, 2, 80, [("s4", 80)])]
        week2 = [matchup(1, 1, 110, [("s1", 110)]), matchup(3, 1, 95, [("s3", 95)]),
                 matchup(2, 2, 70, [("s2", 70)]), matchup(4, 2, 105, [("s4", 105)])]
        for n, rows in ((1, week1), (2, week2)):
            (weeks / f"week-{n}.json").write_text(json.dumps({
                "matchups": rows,
                "transactions": [{"type": "waiver", "status": "complete", "adds": {"s4": 4}, "drops": None,
                                  "roster_ids": [4], "created": n, "transaction_id": f"tx{n}"}] if n == 2 else [],
            }), encoding="utf-8")
        (nfl / "week-1.json").write_text(json.dumps({"complete": True, "games": [
            {"kickoff": "2026-09-11T00:20Z", "home": "THU", "away": "TH2"},
            {"kickoff": "2026-09-13T17:00Z", "home": "SUN", "away": "SU2"},
        ], "players": {"t1": {"team": "THU"}, "t2": {"team": "TH2"}, "s1": {"team": "SUN"}, "s2": {"team": "SU2"},
                       "s3": {"team": "SUN"}, "s4": {"team": "SU2"}}}), encoding="utf-8")
        positions = {pid: {"name": pid.upper(), "position": "QB", "fantasyPositions": ["QB"]}
                     for pid in ("t1", "t2", "s1", "s2", "s3", "s4")}
        (data / "players.json").write_text(json.dumps({"generatedAt": "2026-11-13T00:00:00+00:00",
                                                         "players": positions}), encoding="utf-8")
        (data / "live.json").write_text(json.dumps({
            "league": {"season": "2026", "name": "Test", "status": "in_season", "roster_positions": ["QB", "QB", "BN"],
                       "settings": {"playoff_week_start": 5, "playoff_teams": 2, "last_scored_leg": 2}},
            "nflState": {"season": "2026", "week": 3},
            "standings": [{"rosterId": r, "team": f"Team {r}"} for r in (1, 2, 3, 4)],
            "matchupsByWeek": {"3": [matchup(1, 1, 12, [("s1", 12)]), matchup(2, 1, 3, [("s2", 3)]),
                                     matchup(3, 2, 0, []), matchup(4, 2, 0, [])]},
            "regularSeasonEnd": 4,
            "schedule": {"3": [[1, 2], [3, 4]], "4": [[1, 4], [2, 3]]},
        }), encoding="utf-8")
        (data / "history.json").write_text(json.dumps([
            {"season": 2011, "franchiseId": "1", "teamName": "A", "owner": "Ann", "wins": 9, "losses": 5, "ties": 0,
             "pointsFor": 1500, "finalRank": 1},
            {"season": 2011, "franchiseId": "2", "teamName": "B", "owner": "Bob", "wins": 12, "losses": 2, "ties": 0,
             "pointsFor": 1700, "finalRank": 2},
            {"season": 2011, "franchiseId": "3", "teamName": "C", "owner": "Cid", "wins": 2, "losses": 12, "ties": 0,
             "pointsFor": 1100, "finalRank": 3},
        ]), encoding="utf-8")
        (data / "franchises.json").write_text("[]", encoding="utf-8")
        self.stats = build_stats.build(data)

    def tearDown(self):
        self.tmp.cleanup()

    def row(self, rid):
        return next(r for r in self.stats["table"] if r["rosterId"] == rid)

    def test_table_uses_finished_weeks_only(self):
        self.assertEqual(self.stats["lastFinishedWeek"], 2)
        self.assertEqual((self.row(1)["wins"], self.row(1)["losses"]), (1, 1))
        self.assertEqual(self.row(1)["pointsFor"], 200)
        live = next(w for w in self.stats["weeks"] if w["week"] == 3)
        self.assertTrue(live["live"])
        self.assertIsNone(live["matchups"][0]["winner"])

    def test_luck_is_wins_minus_all_play_expectation(self):
        # Team 3: week 1 120 (3-0 all-play), week 2 95 (1-2). Expected 4/6*2 = 1.33; real wins 1.
        self.assertEqual(self.row(3)["expectedWins"], 1.33)
        self.assertEqual(self.row(3)["luck"], -0.33)

    def test_thursday_curse_detects_leader_who_lost(self):
        week1 = next(w for w in self.stats["weeks"] if w["week"] == 1)
        curse = week1["curse"]
        self.assertEqual(curse["window"], "Thursday")
        self.assertEqual(curse["leaders"][0]["rosterId"], 1)
        self.assertEqual(curse["leaders"][0]["lead"], 30)
        self.assertEqual((curse["leadersLost"], curse["leadersDecided"]), (1, 1))
        self.assertEqual(curse["biggestComeback"]["rosterId"], 2)

    def test_playoff_odds_are_probabilities_that_sum_to_playoff_spots(self):
        odds = self.stats["odds"]["byWeek"]["2"]
        self.assertAlmostEqual(sum(v["playoff"] for v in odds.values()), 2, places=6)
        self.assertAlmostEqual(sum(v["first"] for v in odds.values()), 1, places=6)

    def test_pickup_value_counts_points_started_for_new_team(self):
        pickup = self.stats["transactions"]["bestPickups"][0]
        self.assertEqual((pickup["playerId"], pickup["rosterId"], pickup["startedPoints"]), ("s4", 4, 105))

    def test_history_corner(self):
        history = self.stats["history"]
        self.assertEqual(history["sacko"][0]["team"], "C")
        self.assertEqual(history["bestWithoutTitle"][0]["team"], "B")
        self.assertEqual(history["weakestChampions"][0]["team"], "A")
        self.assertEqual(history["antiGallery"][0]["manager"], "Cid")


if __name__ == "__main__":
    unittest.main()
