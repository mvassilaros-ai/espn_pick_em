function normTeam(t){
  const m={LAR:"LA",WSH:"WAS",OAK:"LV",JAC:"JAX"};
  t=String(t||"").toUpperCase();
  return m[t]||t;
}
function teamAbbr(side){
  const t=side||{};
  return normTeam(t.abbreviation||t.names?.short||t.name||t.teamID||"");
}
function strictNumber(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function median(arr){
  const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function spreadRecords(ev){
  const out={home:null,away:null};
  for(const [key,o] of Object.entries(ev.odds||{})){
    if(!o) continue;
    const period=String(o.periodID||"").toLowerCase();
    const bet=String(o.betTypeID||"").toLowerCase();
    const side=String(o.sideID||"").toLowerCase();

    // Full-game point spread only.
    if(period!=="game" || bet!=="sp") continue;
    if(side!=="home" && side!=="away") continue;

    // Prefer a team spread record rather than a total/other market.
    const statEntity=String(o.statEntityID||"").toLowerCase();
    if(statEntity && statEntity!==side) continue;

    if(!out[side]) out[side]=o;
  }
  return out;
}
function pairedBookLines(homeOdd,awayOdd){
  const hb=homeOdd?.byBookmaker||{};
  const ab=awayOdd?.byBookmaker||{};
  const pairs=[];

  // Use every bookmaker present on both sides, not a hard-coded bookmaker list.
  const books=new Set([...Object.keys(hb),...Object.keys(ab)]);
  for(const book of books){
    const h=hb[book],a=ab[book];
    if(!h||!a) continue;
    if(h.available===false||a.available===false) continue;

    const hs=strictNumber(h.spread);
    const as=strictNumber(a.spread);
    if(hs===null||as===null) continue;

    // Same-book spread sides must be mirrored.
    if(Math.abs(hs+as)>0.26) continue;
    if(hs!==0&&as!==0&&Math.sign(hs)===Math.sign(as)) continue;

    pairs.push({
      book,
      homeSpread:hs,
      awaySpread:as,
      homeOdds:h.odds??null,
      awayOdds:a.odds??null
    });
  }
  return pairs;
}
export default async function handler(req,res){
  const apiKey=process.env.SPORTSGAMEODDS_API_KEY;
  if(!apiKey){
    return res.status(503).json({error:"SPORTSGAMEODDS_API_KEY is not configured."});
  }

  try{
    const url=new URL("https://api.sportsgameodds.com/v2/events");
    url.searchParams.set("leagueID","NFL");
    url.searchParams.set("oddsAvailable","true");
    url.searchParams.set("started","false");
    url.searchParams.set("limit","100");
    // Deliberately do not filter by oddID. We inspect actual returned markets.

    const r=await fetch(url,{headers:{"x-api-key":apiKey}});
    if(!r.ok){
      return res.status(r.status).send(await r.text());
    }

    const obj=await r.json();
    const events=obj.data||obj.events||[];
    const games=[];

    for(const ev of events){
      const home=teamAbbr(ev.teams?.home);
      const away=teamAbbr(ev.teams?.away);
      if(!home||!away) continue;

      const recs=spreadRecords(ev);
      const ho=recs.home, ao=recs.away;

      if(!ho||!ao){
        games.push({
          home,away,valid:false,
          warning:"full-game home/away spread records not found"
        });
        continue;
      }

      const pairs=pairedBookLines(ho,ao);

      let homeSpread=null,awaySpread=null,method="",bookDetail="",valid=false,warning="";

      if(pairs.length){
        homeSpread=median(pairs.map(x=>x.homeSpread));
        awaySpread=median(pairs.map(x=>x.awaySpread));

        // Median of mirrored same-book lines should also mirror.
        if(Math.abs(homeSpread+awaySpread)<=0.26){
          valid=true;
          method=`median paired books (${pairs.length})`;
          bookDetail=pairs.slice(0,5).map(x=>{
            const as=x.awaySpread>0?`+${x.awaySpread}`:`${x.awaySpread}`;
            const hs=x.homeSpread>0?`+${x.homeSpread}`:`${x.homeSpread}`;
            return `${x.book}:${away} ${as}/${home} ${hs}`;
          }).join(" | ");
        } else {
          warning=`median pair failed mirror check: ${away} ${awaySpread}, ${home} ${homeSpread}`;
        }
      }

      // Fallback to SportsGameOdds fairSpread if paired book data unavailable.
      if(!valid){
        const hs=strictNumber(ho.fairSpread);
        const as=strictNumber(ao.fairSpread);
        if(hs!==null&&as!==null&&Math.abs(hs+as)<=0.26 &&
           !(hs!==0&&as!==0&&Math.sign(hs)===Math.sign(as))){
          homeSpread=hs;
          awaySpread=as;
          valid=true;
          method="fallback fairSpread";
          warning="";
        }
      }

      if(!valid && !warning){
        warning=`no valid paired spread data (${pairs.length} paired books)`;
      }

      games.push({
        eventID:ev.eventID,
        startTime:ev.startTime,
        home,away,valid,warning,method,bookDetail,
        homeSpread:valid?homeSpread:null,
        awaySpread:valid?awaySpread:null,
        pairedBooks:pairs.length,
        detectedHomeOddID:ho?.oddID||null,
        detectedAwayOddID:ao?.oddID||null
      });
    }

    res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("CDN-Cache-Control","no-store");
    res.setHeader("Vercel-CDN-Cache-Control","no-store");
    return res.status(200).json({
      games,
      eventCount:events.length,
      validCount:games.filter(g=>g.valid).length,
      updatedAt:new Date().toISOString()
    });

  }catch(err){
    return res.status(500).json({
      error:"Failed to fetch/normalize NFL spreads",
      detail:String(err)
    });
  }
}