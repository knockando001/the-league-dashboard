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


if __name__ == "__main__":
    unittest.main()
