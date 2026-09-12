# NFL Survivor Planner — deploy-ready

This package is designed for Vercel.

## What is included
- `index.html` — the full app
- `api/odds.js` — secure serverless proxy to SportsGameOdds
- `package.json` — minimal project metadata

## Deploy to Vercel
1. Create a free SportsGameOdds API key.
2. Put these files in a GitHub repository, or unzip locally and deploy with the Vercel CLI.
3. Import the repository into Vercel.
4. In **Vercel → Project Settings → Environment Variables**, add:
   - `SPORTSGAMEODDS_API_KEY` = your SportsGameOdds key
5. Redeploy.
6. Share the resulting `https://...vercel.app` URL with your partner.

## Important
- The SportsGameOdds key is never stored in `index.html`.
- The browser calls `/api/odds`; the serverless function adds the API key privately.
- Week 1 ownership is editable. After your pool locks each week, replace public ownership with the actual ownership from your pool when available.
- Future-week win probabilities are planning projections until real odds become available.
- Browser edits are saved in that browser's local storage. They are not synchronized between two people yet.

## Recommended next enhancement
If you want shared synchronized state between you and your partner, add a small hosted database (e.g. Supabase) for pool settings, used teams and weekly ownership. The current package gives both users the same app and live odds, but each browser stores its own edits.


## Refresh Ownership
The app now includes a **Refresh Ownership** button. It calls `/api/ownership`, which pulls SurvivorGrid and imports the **Projected** ownership percentage for the selected week. No extra API key is required. Manual ownership edits remain available.


## V6: full slate + automatic future value
- `api/future.js` loads the complete 2026 regular-season schedule from nflverse.
- It uses nfelo market-implied neutral-field strength as the baseline for games without posted odds.
- Posted SportsGameOdds fair moneylines overwrite MODEL probabilities wherever available.
- Future Value is calculated automatically from each team's remaining high-probability spots and weekly scarcity.
- The shortlist is now an output: every scheduled team is considered by the optimizer.


## V7 one-click weekly workflow
Use **Refresh Everything + Optimize**. It runs, in order:
1. Refresh Full Season Model
2. Refresh Live Odds
3. Refresh Ownership for the selected week
4. Recalculate Future Value
5. Run the two-entry optimizer once

The summary shows total team-game rows, LIVE vs MODEL rows, ownership updates, and the recommended next pair.
Monte Carlo remains manual.

## V8 joint portfolio optimizer
The two entries are now optimized jointly across every remaining week.
- Each entry may use a team only once.
- Same-team picks across Entry A and Entry B are penalized each week unless the win-probability advantage is compelling.
- Diversification is therefore a season-long decision, not merely a Week 1 adjustment.

## V9 manual Entry A / optimized Entry B
- You and your partner select the current-week Entry A team.
- The optimizer treats that pick as fixed.
- It then optimizes Entry B and both remaining season paths around that decision.
- The ranking table now separates:
  - current-week survival
  - safety
  - ownership leverage
  - future-value gain
  - current-week score
  - full-season (18-week) portfolio score
- The table is sorted by the full-season score and explicitly marks the recommended Entry B.

## V10 assignment optimizer
Beam search replaced with a bipartite assignment solver. Entry A is fixed manually for the current week. Every legal Entry B candidate is forced into the current week and its remaining Weeks 2–18 schedule is solved exactly under the model's weekly values and used-team constraint. The table shows the full-season score and Cost vs best for each candidate.

## V11 verified market ingestion
The Survivor odds route now uses the exact SportsGameOdds moneyline markets:
- `points-home-game-ml-home`
- `points-away-game-ml-away`

It explicitly maps the home and away teams, converts both fairOdds to probabilities, verifies they sum to ~100%, and rejects invalid pairs.

If SportsGameOdds fairOdds fails validation, the backend attempts a fallback using paired moneylines from major books (DraftKings, FanDuel, BetMGM, Caesars, ESPN BET, Bet365), de-vigs each pair, then uses the median probability.

The frontend displays Market Detail so the team/price mapping is auditable.


## V12 one-click refresh confirmation
The missing `refreshEverything()` orchestration function has been restored.

`Refresh Everything + Optimize` now visibly reports:
- completion timestamp
- season team-game rows loaded
- LIVE vs MODEL rows
- ownership values updated
- selected Entry A
- recommended Entry B
- elapsed time

If a step fails, the app shows a visible `Refresh incomplete` banner instead.
