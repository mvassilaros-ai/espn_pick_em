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


## V6 storage / zero-line fix
Fixes a V5 bug where the entire game array was accidentally written into the matchup-based pool-line storage key.

- Automatically migrates old `ats_pool_games_2026_wN` arrays into the new matchup map.
- Also repairs the buggy V5 case where an array was stored under `ats_pool_lines_2026_wN`.
- Refresh Live Spreads never writes live market lines into the frozen pool-line store.
- New slates show `—` for live market until a verified market refresh succeeds, rather than displaying misleading 0.0 lines.


## V7 null-safe line handling
Critical zero-line bug fixed.

JavaScript converts `Number(null)` to `0`; previous versions could therefore mistake a missing API spread for a legitimate pick'em line.

V7:
- uses strict parsing where null/undefined/blank remains null
- never converts a missing live spread to 0
- never converts a missing ESPN Pool Line to 0
- displays missing live lines as `—`
- displays missing pool lines as blank / `Not entered`
- excludes games without a Pool Line from recommendations until you enter the frozen ESPN line
- preserves saved Pool Lines by week/matchup


## V8 robust spread parser
The SportsGameOdds parser no longer relies on exact oddID strings or a fixed bookmaker list.

It now:
- requests upcoming NFL events without an oddID filter
- scans returned odds for full-game (`periodID=game`) spread (`betTypeID=sp`) markets
- identifies home/away using `sideID`
- pairs the same bookmaker's home and away spread
- requires each same-book pair to mirror
- takes the median across every valid paired bookmaker
- falls back to `fairSpread` only if paired bookmaker data is unavailable
- returns eventCount/validCount diagnostics so the UI tells us whether the API actually supplied usable markets


## V9 initialization fix
V8 had a JavaScript syntax error in the `sgn()` display helper. Because browser JavaScript stops parsing at a syntax error, the Week dropdown never populated and no schedule/odds requests ran.

V9 removes the malformed fragment and was syntax-checked with Node before packaging. The robust V8 spread parser and schedule-backed slate remain intact.
