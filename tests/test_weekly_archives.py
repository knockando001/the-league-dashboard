import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts.fetch_weekly as fetch_weekly


class WeeklyArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self.patch_data = patch.object(fetch_weekly, "DATA", self.data_dir)
        self.patch_data.start()

    def tearDown(self):
        self.patch_data.stop()
        self.temp_dir.cleanup()

    def matchup(self, roster_id=1):
        return {
            "roster_id": roster_id,
            "matchup_id": 10,
            "starters": [],
            "players": [],
            "players_points": {},
        }

    def test_writes_new_week_and_aggregates_legacy_views(self):
        archive = {
            "season": 2025,
            "week": 1,
            "matchups": [{"season": 2025, "week": 1, "rosterId": 1}],
            "transactions": [{"week": 1, "type": "trade"}],
        }
        fetch_weekly.write_archive(2025, 1, archive)
        archives = fetch_weekly.read_archives(2025)
        self.assertEqual(archives[1]["matchups"][0]["rosterId"], 1)
        self.assertEqual(archives[1]["transactions"][0]["type"], "trade")

    def test_existing_archive_is_not_replaced(self):
        original = {"season": 2025, "week": 1, "matchups": [{"rosterId": 1}]}
        replacement = {"season": 2025, "week": 1, "matchups": [{"rosterId": 2}]}
        fetch_weekly.write_archive(2025, 1, original)
        self.assertEqual(fetch_weekly.read_archives(2025)[1], original)
        self.assertNotEqual(fetch_weekly.read_archives(2025)[1], replacement)

    def test_empty_or_incomplete_matchups_are_rejected(self):
        self.assertFalse(fetch_weekly.valid_matchups([]))
        self.assertFalse(fetch_weekly.valid_matchups([{"matchup_id": 1}]))
        self.assertTrue(fetch_weekly.valid_matchups([self.matchup()]))

    def test_legacy_views_include_only_archived_weeks(self):
        fetch_weekly.write_archive(2025, 1, {
            "season": 2025,
            "week": 1,
            "matchups": [{"rosterId": 1}],
            "transactions": [{"week": 1, "type": "trade"}],
        })
        archives = fetch_weekly.read_archives(2025)
        weeks = [
            {"week": week, "matchups": archives.get(week, {}).get("matchups", [])}
            for week in range(1, 3)
        ]
        transactions = [
            tx for week in range(1, 3)
            for tx in archives.get(week, {}).get("transactions", [])
        ]
        self.assertEqual(weeks[0]["matchups"], [{"rosterId": 1}])
        self.assertEqual(weeks[1]["matchups"], [])
        self.assertEqual(transactions, [{"week": 1, "type": "trade"}])

    def test_unplayed_weeks_have_no_scores(self):
        self.assertFalse(fetch_weekly.has_scores([self.matchup(1), self.matchup(2)]))
        self.assertTrue(fetch_weekly.has_scores([{**self.matchup(1), "points": 101.5}]))

    def test_last_completed_week(self):
        in_season = {"status": "in_season", "settings": {"last_scored_leg": 9}}
        state = {"season": "2026", "season_type": "regular", "week": 10}
        self.assertEqual(fetch_weekly.last_completed_week(in_season, state, 2026), 9)
        self.assertEqual(
            fetch_weekly.last_completed_week({"status": "complete", "settings": {}}, state, 2026),
            fetch_weekly.MAX_WEEK,
        )
        no_leg = {"status": "in_season", "settings": {}}
        self.assertEqual(fetch_weekly.last_completed_week(no_leg, state, 2026), 9)
        pre = {"season": "2026", "season_type": "pre", "week": 1}
        self.assertEqual(fetch_weekly.last_completed_week(no_leg, pre, 2026), 0)
        next_season = {"season": "2027", "season_type": "pre", "week": 1}
        self.assertEqual(
            fetch_weekly.last_completed_week(no_leg, next_season, 2026), fetch_weekly.MAX_WEEK
        )

    def fake_sleeper(self, last_scored_leg, current_week, scored_weeks):
        """Sleeper stub: every week has scheduled matchups, only some are scored."""
        def get_json(path):
            if path == f"/league/{fetch_weekly.LEAGUE_ID}":
                return {"name": "Test", "season": "2026", "status": "in_season",
                        "settings": {"last_scored_leg": last_scored_leg}}
            if path.endswith("/users"):
                return [{"user_id": "u1", "display_name": "A"}]
            if path.endswith("/rosters"):
                return [{"roster_id": 1, "owner_id": "u1"}, {"roster_id": 2}]
            if path == "/state/nfl":
                return {"season": "2026", "season_type": "regular", "week": current_week}
            if "/matchups/" in path:
                week = int(path.rsplit("/", 1)[1])
                points = 100.0 if week in scored_weeks else 0
                return [{**self.matchup(1), "points": points}, {**self.matchup(2), "points": points}]
            if "/transactions/" in path:
                return []
            if path.startswith("/players/"):
                return {}
            raise AssertionError(f"unexpected request {path}")
        return get_json

    def test_main_archives_only_scored_weeks_and_never_future_ones(self):
        with patch.object(fetch_weekly, "get_json", self.fake_sleeper(2, 3, {1, 2, 3})):
            fetch_weekly.main()
        self.assertEqual(sorted(fetch_weekly.read_archives(2026)), [1, 2])

        # Next run, one week later: week 3 is now finished and gets archived;
        # weeks 1-2 are kept as they were.
        week1_before = fetch_weekly.archive_path(2026, 1).read_text(encoding="utf-8")
        with patch.object(fetch_weekly, "get_json", self.fake_sleeper(3, 4, {1, 2, 3, 4})):
            fetch_weekly.main()
        self.assertEqual(sorted(fetch_weekly.read_archives(2026)), [1, 2, 3])
        self.assertEqual(
            fetch_weekly.archive_path(2026, 1).read_text(encoding="utf-8"), week1_before
        )

    def test_main_skips_completed_week_without_scores(self):
        with patch.object(fetch_weekly, "get_json", self.fake_sleeper(3, 4, {1, 2})):
            fetch_weekly.main()
        self.assertEqual(sorted(fetch_weekly.read_archives(2026)), [1, 2])


if __name__ == "__main__":
    unittest.main()
