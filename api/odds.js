function normTeam(t){
  const m={LAR:"LA",WSH:"WAS",OAK:"LV",JAC:"JAX"};
  t=String(t||"").toUpperCase();
  return m[t]||t;
}
function teamAbbr(side){
  const t=side||{};
  return normTeam(t.abbreviation||t.names?.short||t.name||t.teamID||"");
}
function median(arr){
  const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function majorBookMedianSpread(odd){
  const major=["draftkings","fanduel","betmgm","caesars","espnbet","bet365"];
  const vals=[];
  const books=odd?.byBookmaker||{};
  for(const b of major){
    const rec=books[b];
    if(!rec||rec.available===false)continue;
    const v=Number(rec.spread);
    if(Number.isFinite(v)) vals.push(v);
  }
  return {spread:median(vals),books:vals.length};
}
export default async function handler(req,res){
  const apiKey=process.env.SPORTSGAMEODDS_API_KEY;
  if(!apiKey)return res.status(503).json({error:"SPORTSGAMEODDS_API_KEY is not configured."});
  try{
    const url=new URL("https://api.sportsgameodds.com/v2/events");
    url.searchParams.set("leagueID","NFL");
    url.searchParams.set("oddsAvailable","true");
    url.searchParams.set("limit","100");
    url.searchParams.set("oddID","points-home-game-sp-home,points-away-game-sp-away");

    const r=await fetch(url,{headers:{"x-api-key":apiKey}});
    if(!r.ok)return res.status(r.status).send(await r.text());

    const obj=await r.json();
    const events=obj.data||obj.events||[];
    const games=[];

    for(const ev of events){
      const home=teamAbbr(ev.teams?.home),away=teamAbbr(ev.teams?.away);
      if(!home||!away)continue;

      const ho=ev.odds?.["points-home-game-sp-home"];
      const ao=ev.odds?.["points-away-game-sp-away"];
      if(!ho||!ao){
        games.push({home,away,valid:false,warning:"missing exact spread side"});
        continue;
      }

      // Prefer SportsGameOdds consensus bookSpread. Their docs specify the two
      // sides are mirrored: if home is +3, away is -3.
      let hs=Number(ho.bookSpread),as=Number(ao.bookSpread),method="consensus bookSpread";

      // Fallback to fairSpread if consensus bookSpread isn't available.
      if(!Number.isFinite(hs)||!Number.isFinite(as)){
        hs=Number(ho.fairSpread);as=Number(ao.fairSpread);method="consensus fairSpread";
      }

      // Final fallback: median major-book side-specific spreads.
      if(!Number.isFinite(hs)||!Number.isFinite(as)){
        const hm=majorBookMedianSpread(ho),am=majorBookMedianSpread(ao);
        if(hm.books>=2&&am.books>=2){
          hs=hm.spread;as=am.spread;
          method=`median major books (${Math.min(hm.books,am.books)})`;
        }
      }

      let valid=Number.isFinite(hs)&&Number.isFinite(as),warning="";
      if(valid){
        // Critical sign/symmetry validation. Home and away spread must mirror.
        if(Math.abs(hs+as)>0.26){
          valid=false;
          warning=`spread sides are not mirrored: home ${hs}, away ${as}`;
        }
        // Reject impossible same-sign nonzero pairs even if rounding somehow slips through.
        if(hs!==0&&as!==0&&Math.sign(hs)===Math.sign(as)){
          valid=false;
          warning=`same-sign spread pair: home ${hs}, away ${as}`;
        }
      }else{
        warning="no usable spread values";
      }

      games.push({
        eventID:ev.eventID,startTime:ev.startTime,
        home,away,valid,warning,method,
        homeSpread:valid?hs:null,
        awaySpread:valid?as:null,
        homeOdds:ho.bookOdds||ho.fairOdds||null,
        awayOdds:ao.bookOdds||ao.fairOdds||null
      });
    }

    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({games,updatedAt:new Date().toISOString()});
  }catch(err){
    res.status(500).json({error:"Failed to fetch/normalize NFL spreads",detail:String(err)});
  }
}