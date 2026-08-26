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
