# Sleeper league dashboard starter

Static HTML dashboard plus a Python data collector and a daily GitHub Actions workflow.

## Local test
```bash
python -m pip install openpyxl
python scripts/build_legacy.py
python scripts/fetch_weekly.py
python scripts/fetch_live.py
python scripts/fetch_nfl.py
python scripts/build_stats.py
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

## NFL game context

`scripts/fetch_nfl.py` stores, per week at `data/seasons/<season>/nfl/week-<week>.json`,
the NFL team each league player played for (Sleeper stats feed,
`api.sleeper.com/stats/nfl/...`) and every game's kickoff time (ESPN
scoreboard). Both sources are public but unofficial, so a failure only skips
that week. A file is frozen once the week is finished and all its games are
final. It lets the stats replay every matchup game window by game window.

## Season stats

`scripts/build_stats.py` runs offline from the files above and writes
`data/stats.json`, which the Season, Week Centre, Waiver Wire and Hall of Shame
pages read. Everything is plain arithmetic, no AI:

- **Ranking True** (as in The League Insider): rank on all-play record + rank
  on Coach % + rank on points for; lowest total is best.
- **All-play record**: each week, wins against every other team's score.
- **Luck**: real wins minus all-play expected wins (an all-play tie counts half).
- **Coach %**: points scored / best possible lineup from the same roster, using
  the league's `roster_positions`.
- **Playoff odds**: 10,000 simulations of the remaining Sleeper schedule; each
  team's score is drawn around its average pulled towards the league average,
  seeded by wins then points for. Rerun after every finished week for the chart.
- **Thursday curse and score timelines**: starter points grouped by the TV
  window of the NFL game they came from.
- **Pickup value**: points a waiver or free-agent pickup scored as a starter
  for the new team until that team dropped him.
- **Hall of Shame**: last places, losing seasons, best non-champions and
  weakest champions from `data/history.json`.

`data/players.json` holds only fantasy-relevant players (name, position, NFL
team) and refreshes once a day, based on the `generatedAt` inside the file.

The workflow runs every 2 hours, and every 30 minutes while NFL games are on.

## Tests
```bash
python -m unittest tests.test_weekly_archives tests.test_stats -v
```
