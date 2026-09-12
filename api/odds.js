function normTeam(t) {
  const m = {
    LAR: "LA",
    WSH: "WAS",
    OAK: "LV",
    JAC: "JAX"
  };

  t = String(t || "").toUpperCase();
  return m[t] || t;
}

function teamAbbr(side) {
  const t = side || {};

  return normTeam(
    t.abbreviation ||
    t.names?.short ||
    t.name ||
    t.teamID ||
    ""
  );
}

function median(arr) {
  const a = arr
    .filter(Number.isFinite)
    .sort((x, y) => x - y);

  if (!a.length) return null;

  const m = Math.floor(a.length / 2);

  return a.length % 2
    ? a[m]
    : (a[m - 1] + a[m]) / 2;
}

function majorBookMedianSpread(odd) {
  const major = [
    "draftkings",
    "fanduel",
    "betmgm",
    "caesars",
    "espnbet",
    "bet365"
  ];

  const vals = [];
  const books = odd?.byBookmaker || {};

  for (const b of major) {
    const rec = books[b];

    if (!rec || rec.available === false) continue;

    const v = Number(rec.spread);

    if (Number.isFinite(v)) {
      vals.push(v);
    }
  }

  return {
    spread: median(vals),
    books: vals.length
  };
}

export default async function handler(req, res) {
  const apiKey = process.env.SPORTSGAMEODDS_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: "SPORTSGAMEODDS_API_KEY is not configured."
    });
  }

  try {
    const url = new URL(
      "https://api.sportsgameodds.com/v2/events"
    );

    url.searchParams.set("leagueID", "NFL");
    url.searchParams.set("oddsAvailable", "true");
    url.searchParams.set("limit", "100");

    url.searchParams.set(
      "oddID",
      "points-home-game-sp-home,points-away-game-sp-away"
    );

    const r = await fetch(url, {
      headers: {
        "x-api-key": apiKey
      }
    });

    if (!r.ok) {
      const errorText = await r.text();
      return res.status(r.status).send(errorText);
    }

    const obj = await r.json();

    const events = obj.data || obj.events || [];
    const games = [];

    for (const ev of events) {
      const home = teamAbbr(ev.teams?.home);
      const away = teamAbbr(ev.teams?.away);

      if (!home || !away) continue;

      const homeOdd =
        ev.odds?.["points-home-game-sp-home"];

      const awayOdd =
        ev.odds?.["points-away-game-sp-away"];

      if (!homeOdd || !awayOdd) {
        games.push({
          home,
          away,
          valid: false,
          warning: "Missing exact home/away spread market"
        });

        continue;
      }

      let homeSpread = Number(homeOdd.bookSpread);
      let awaySpread = Number(awayOdd.bookSpread);

      let method = "consensus bookSpread";

      // First fallback: SportsGameOdds fair spread
      if (
        !Number.isFinite(homeSpread) ||
        !Number.isFinite(awaySpread)
      ) {
        homeSpread = Number(homeOdd.fairSpread);
        awaySpread = Number(awayOdd.fairSpread);

        method = "consensus fairSpread";
      }

      // Second fallback: median of major sportsbooks
      if (
        !Number.isFinite(homeSpread) ||
        !Number.isFinite(awaySpread)
      ) {
        const hm = majorBookMedianSpread(homeOdd);
        const am = majorBookMedianSpread(awayOdd);

        if (hm.books >= 2 && am.books >= 2) {
          homeSpread = hm.spread;
          awaySpread = am.spread;

          method =
            `median major books (${Math.min(
              hm.books,
              am.books
            )})`;
        }
      }

      let valid =
        Number.isFinite(homeSpread) &&
        Number.isFinite(awaySpread);

      let warning = "";

      if (!valid) {
        warning = "No usable spread values";
      }

      if (valid) {
        /*
         * CRITICAL SANITY CHECK:
         *
         * Home and away spreads must be opposites.
         *
         * Example:
         *
         * MIA +3.5
         * LV  -3.5
         *
         * homeSpread + awaySpread should therefore
         * equal approximately zero.
         */

        if (
          Math.abs(homeSpread + awaySpread) > 0.26
        ) {
          valid = false;

          warning =
            `Spread sides do not mirror: ` +
            `${away} ${awaySpread}, ` +
            `${home} ${homeSpread}`;
        }
      }

      if (valid) {
        /*
         * Additional protection against the bug
         * we saw earlier:
         *
         * Both teams cannot have the same non-zero
         * sign.
         */

        if (
          homeSpread !== 0 &&
          awaySpread !== 0 &&
          Math.sign(homeSpread) ===
            Math.sign(awaySpread)
        ) {
          valid = false;

          warning =
            `Same-sign spread pair: ` +
            `${away} ${awaySpread}, ` +
            `${home} ${homeSpread}`;
        }
      }

      games.push({
        eventID: ev.eventID,
        startTime: ev.startTime,

        home,
        away,

        valid,
        warning,
        method,

        homeSpread:
          valid ? homeSpread : null,

        awaySpread:
          valid ? awaySpread : null
      });
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json({
      games,
      updatedAt: new Date().toISOString()
    });

  } catch (err) {
    return res.status(500).json({
      error: "Failed to fetch/normalize NFL spreads",
      detail: String(err)
    });
  }
}
