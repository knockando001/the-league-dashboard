# Sleeper league dashboard starter

Static HTML dashboard plus a Python data collector and a daily GitHub Actions workflow.

## Local test
```bash
python scripts/fetch_data.py
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
response. The collector fetches the current week and fills only missing
archives for earlier weeks (weeks before the NFL state's current week are
treated as safely completed); empty or incomplete matchup responses are
skipped.

`data/weekly.json` and `data/transactions.json` remain compatibility views
assembled from these archives. `data/live.json` reads archived weeks and only
requests the current week when it has not yet been archived.
