# ATS V12 — rate-limit resilience

- `/api/odds` now uses Vercel shared CDN caching (15 minutes; stale-while-revalidate 1 hour) to avoid a provider call per visitor or click.
- Frontend no longer adds a cache-busting timestamp or forces `no-store`.
- The last successful verified response is saved in browser localStorage and reused with a prominent STALE warning when provider returns 429 or other errors.
- Frozen pool lines and V11 scoring (10 points per correct pick) are unchanged.

**Limitations:** This cannot overcome an exhausted SportsGameOdds quota on the first request or guarantee CDN persistence across deployments/regions. Cached spreads can be stale. Verify API key, quota, and plan limits if 429 persists. Avoid using stale lines as current lines for final picks.
