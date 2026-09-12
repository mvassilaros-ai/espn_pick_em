export default async function handler(req, res) {
  const week = Math.max(1, Math.min(18, Number(req.query.week || 1)));
  try {
    const url = `https://www.survivorgrid.com/picks?week=${week}`;
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; SurvivorPlanner/1.0)", "accept": "text/html" } });
    const html = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: "SurvivorGrid request failed" });
    const picks = {};
    const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const m of trs) {
      const cells=[...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>x[1].replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim());
      if(cells.length<5) continue;
      const tm=cells[0].match(/\b([A-Z]{2,3})\b/);
      const pm=cells[4].match(/([0-9]+(?:\.[0-9]+)?)%/);
      if(tm&&pm) picks[tm[1]]=Number(pm[1]);
    }
    if(!Object.keys(picks).length) return res.status(502).json({error:"Could not parse SurvivorGrid ownership"});
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({source:"SurvivorGrid projected consensus / PoolCrunch",week,picks,updatedAt:new Date().toISOString()});
  } catch (err) {
    return res.status(500).json({error:"Failed to fetch ownership",detail:String(err)});
  }
}
