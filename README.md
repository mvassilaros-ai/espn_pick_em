# NFL ATS Pool Optimizer V10

V10 is a clean decision-engine upgrade over V9 while preserving the schedule, saved pool-line, and live-odds plumbing.

## V10 decision rules
- Current multi-book consensus is the market anchor.
- Frozen pool line versus live market estimates cover probability.
- Directional empirical key-number adjustments make crossings of 3 and 7 matter most, with smaller adjustments at 6, 10, and 14.
- Expected ATS accuracy is the primary objective.
- Public ownership cannot overwhelm a meaningful probability edge. It can flip a pick only inside an automatically calculated probability-sacrifice budget.
- The sacrifice budget is derived from current week, your score deficit, rank, and pool size; there is no manual risk slider.
- Enter **Your rank**, **Your score**, **Leader score**, and **Pool entries** each week.

## Deploy
Replace the files in the existing Vercel/GitHub project with this package. Keep the existing `SPORTSGAMEODDS_API_KEY` environment variable.

Pool lines remain stored in browser localStorage by week and matchup, as in V9.
