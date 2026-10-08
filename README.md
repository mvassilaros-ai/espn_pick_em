# ATS Pool Optimizer V11

Deploy these files to the existing ATS GitHub/Vercel project, replacing V10. Keep the SPORTSGAMEODDS_API_KEY environment variable configured in Vercel.

Changes:
- Automatically refresh live odds on startup and week changes; refresh button bypasses browser/CDN cache.
- Display actual HTTP/API errors in the app rather than a generic failure.
- API no longer excludes all events flagged started; live events are matched against the selected slate.
- 10 pool points per correct pick. Enter actual cumulative point totals; the deficit is converted to equivalent picks (points / 10) for automatic risk strategy.
- Expected pool points displayed on dashboard.
- Frozen pool lines remain in existing per-week browser storage.

Note: Actual API response could not be tested without the user's Vercel environment and key. If the app reports 0 verified lines, send the displayed diagnostic; the SportsGameOdds market shape may have changed.
