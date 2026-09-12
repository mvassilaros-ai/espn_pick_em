# NFL ATS Pool Optimizer
Separate Vercel app for a ~40-entry pick-every-game ATS pool.

Use the same SPORTSGAMEODDS_API_KEY environment variable as the Survivor app.

Core factors:
- pool spread vs live market spread
- estimated cover probability
- key-number movement
- public-pick leverage
- rank / games-behind strategy mode
- tie-break total helper


## V2 verified spread ingestion
The ATS app now requests the exact SportsGameOdds spread markets:
- `points-home-game-sp-home`
- `points-away-game-sp-away`

The backend explicitly maps each line to the home and away team and validates that the two spreads are mirrored (for example MIA +3.5 / LV -3.5). Same-sign or non-mirrored pairs are rejected and never fed to the optimizer.

The UI displays the live line as `TEAM ±spread` and shows both sides in Market Detail, making a sign-flip immediately visible.

Primary market line source: consensus `bookSpread`. Fallbacks are `fairSpread`, then median major-book side-specific spreads.


## V3 major-book median fix
The ATS app no longer trusts SportsGameOdds `bookSpread` consensus as the primary spread source.

It now:
- reads exact home/away spread markets
- extracts side-specific spreads from DraftKings, FanDuel, BetMGM, Caesars, ESPN BET and Bet365
- uses the median major-book spread
- validates that home/away are mirrored
- falls back to `fairSpread` only if fewer than two major-book observations are available
- returns per-book detail for auditing

This directly addresses the observed MIA/LV sign inversion.


## V4 persistent weekly pool lines
Pool lines are now stored in browser localStorage separately for each NFL week.

- Editing a Pool Line saves it automatically.
- Refresh Live Spreads updates only the live market fields and never overwrites Pool Lines.
- Switching weeks saves the current week's entries and loads that week's saved snapshot.
- Returning to a prior week restores exactly what was entered.
- Reset This Week clears only the currently selected week's saved slate.

Note: persistence is browser/device-specific because it uses localStorage.


## V5 schedule-backed slate
The app no longer relies on the original hard-coded sample slate.

- `/api/schedule?week=N` pulls the actual 2026 NFL regular-season schedule from nflverse.
- Pool lines are saved separately by matchup and week.
- Refresh Week + Live Spreads loads the real weekly slate first, then overlays live market lines.
- Live refresh never overwrites the frozen ESPN Pool Line.
- This eliminates stale/mismatched sample games such as incorrect KC lines persisting from the prototype.
