# Sleeper league dashboard starter

Static HTML dashboard plus a Python data collector and a daily GitHub Actions workflow.

## Local test
```bash
python -m pip install openpyxl
python scripts/build_legacy.py
python scripts/fetch_weekly.py
python scripts/fetch_live.py
python -m http.server 8000
```
Open http://localhost:8000.

## Publish
1. Create a GitHub repository and upload these files.
2. In Settings > Pages choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Run **Actions > Update dashboard data > Run workflow** once.
4. GitHub Pages serves the generated dashboard.

## Important history limitation
The collector follows `previous_league_id`. If it is null, older imported ESPN seasons must be loaded separately and normalised into the same game schema.

## Sleeper weekly archives

Sleeper matchup data is archived once per season and week at
`data/seasons/<season>/weeks/week-<week>.json`. Each archive contains the
normalised matchups, transactions, roster/team metadata, and the NFL state at
the time it was captured. Existing archives are never replaced by a later API
response.

A week is archived only once it is finished: up to the league's
`settings.last_scored_leg` from Sleeper (all weeks once the league status is
`complete`; if Sleeper omits `last_scored_leg`, weeks before the NFL state's
current week). Sleeper returns scheduled 0-point matchups for every future
week, so a completed week where no team has points is skipped, as are empty or
incomplete matchup responses. The week in progress is never archived.

To rebuild a bad archive, delete its file and run `python scripts/fetch_weekly.py`.

`data/weekly.json` and `data/transactions.json` remain compatibility views
assembled from these archives. `data/live.json` reads finished weeks from the
archive and requests the week in progress (and any week not yet archived)
live from Sleeper, normalised to the same matchup format as the archives.

## Tests
```bash
python -m unittest tests.test_weekly_archives -v
```
