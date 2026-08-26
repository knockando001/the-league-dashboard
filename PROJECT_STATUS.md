# The League Dashboard - Project Status

## Repository

- GitHub repository: `knockando001/the-league-dashboard`
- GitHub Pages source: `main` branch, repository root
- Selected Sleeper league ID: `1397593463293239296`
- League name: The League
- Detailed Sleeper data begins with the 2026 season
- Historical summary data covers 2011-2025

## Working data foundation

### Source files

- `source/history.xlsx`
- `source/teams.xlsx`

### Generated files

- `data/history.json`
- `data/franchises.json`
- `data/live.json`

### Scripts

- `scripts/build_legacy.py`
- `scripts/fetch_live.py`

### Automation

The dashboard workflow builds the legacy JSON files and downloads live Sleeper data. The live collector is scoped to league ID `1397593463293239296`.

## Historical data scope

Available for 2011-2025:

- Final standings
- Wins, losses and ties
- Win percentage
- Points For and Points Against
- Playoff seed
- Final rank
- Champions, runner-up and third place
- Playoff appearances
- Historical team names
- Managers and owners
- Stable franchise identity through `TeamId`

Unavailable before 2026:

- Weekly matchup scores
- Historical head-to-head results
- Player performances
- Weekly records
- Transactions and draft details

Detailed records should be labelled as available from 2026 onward.

## Franchise identity model

- `TeamId` is the permanent franchise identifier.
- Team names are season-specific display names.
- Name changes must not split one franchise into multiple historical franchises.

Examples:

- Lodz Giants -> Kazachskie Hanysy -> Vegablanca Boars
- Kuny Pogoorze -> Kiki Owls

## Current page structure

- `index.html` - homepage and current standings
- `hall-of-fame.html` - trophy ranking and consistency overview
- `history.html` - season selector, podium and final standings
- `records.html` - career and single-season records
- `franchise.html` - franchise metrics, timeline, season history and identity

Supporting scripts currently found in the repository:

- `legacy.js` - Home, History and Records
- `rankings.js` - Hall of Fame trophy and consistency content
- `franchise-clean.js` - clean Franchise page
- `app.js` - old starter script, apparently no longer needed

Supporting styles:

- `styles.css`
- `rankings.css`
- `history-spacing.css`

## Ranking methodology decision

### Trophy Ranking

Use championship-first sorting instead of a weighted Legacy Index:

1. Championships
2. Runner-up finishes
3. Third-place finishes
4. Playoff rate as a further tie-break
5. Career win percentage as a final tie-break

A franchise with a championship must rank above a franchise with no championship.

### Consistency Overview

Show objective statistics separately. Do not combine them into a subjective score:

- Playoff Rate = playoff appearances / seasons played
- Career Win % = wins / (wins + losses + ties)
- Average Finish = average final position; lower is better
- Seasons Played = sample-size context

### Removed methodology

Do not use:

- Legacy Index
- Legacy Rank
- Dynasty Rating
- Letter grades

## Current repository state

The downloaded repository files were inspected.

- `franchise.html` is the clean V4.5 page and loads `franchise-clean.js?v=4.5`.
- `franchise-clean.js` contains only Trophy Rank, Playoff Rate, Career Win %, Average Finish and Seasons Played.
- `hall-of-fame.html` contains the championship-first Trophy Ranking layout.
- `history.html` and `records.html` are restored and use `legacy.js`.
- `legacy.js` still contains obsolete Dynasty Rating and Legacy Index code, but the current clean Franchise page does not load it.
- The repository contains several generations of scripts and should be consolidated after deployment is stable.

## Current blocker

GitHub Pages deployment is stuck.

Observed symptoms:

- `pages build and deployment` remains queued.
- Cancel fails with `Failed to cancel workflow`.
- Some Pages deployments reported an unexpected GitHub error.
- The repository contains newer files than the live site serves.
- The live Franchise page source did not contain `franchise-clean.js`, even though the repository version does.
- The live site is therefore serving an older successful Pages deployment.

Pages was unpublished during troubleshooting. Publishing configuration remains intended as:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

## Next action

Do not upload more dashboard patches while Pages is stuck.

After GitHub clears the queued deployment:

1. Republish from `main` and `/ (root)` if necessary.
2. Confirm the Pages deployment completes successfully.
3. Verify the live Franchise page source contains `franchise-clean.js`.
4. Verify the Hall of Fame shows Trophy podium, Trophy ranking and Consistency overview.
5. Verify History and Records still load data.
6. Consolidate JavaScript and remove obsolete ranking code only after the live site matches the repository.

## Stable verification points

- History spacing fix footer: `v4.3`
- Hall of Fame trophy methodology footer: `v4.4.1`
- Clean Franchise page footer: `v4.5`

The version markers are temporary deployment checks and should remain in page footers, not under the site title.
