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
function strictNumber(v){
  if(v===null||v===undefined||v==="") return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
const MAJOR=["draftkings","fanduel","betmgm","caesars","espnbet","bet365"];

function sideBookSpreads(odd){
  const out=[];
  const books=odd?.byBookmaker||{};
  for(const b of MAJOR){
    const rec=books[b];
    if(!rec||rec.available===false)continue;
    const spread=strictNumber(rec.spread);
    if(spread!==null) out.push({book:b,spread});
  }
  return out;
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
      const home=teamAbbr(ev.teams?.home);
      const away=teamAbbr(ev.teams?.away);
      if(!home||!away)continue;

      const ho=ev.odds?.["points-home-game-sp-home"];
      const ao=ev.odds?.["points-away-game-sp-away"];

      if(!ho||!ao){
        games.push({home,away,valid:false,warning:"missing exact home/away spread market"});
        continue;
      }

      // Always prefer actual side-specific major-book lines.
      const homeBooks=sideBookSpreads(ho);
      const awayBooks=sideBookSpreads(ao);

      let homeSpread=null,awaySpread=null,method="",bookDetail="";

      if(homeBooks.length>=2 && awayBooks.length>=2){
        homeSpread=median(homeBooks.map(x=>x.spread));
        awaySpread=median(awayBooks.map(x=>x.spread));
        method=`median major books (${Math.min(homeBooks.length,awayBooks.length)})`;

        const paired=[];
        for(const hb of homeBooks){
          const ab=awayBooks.find(x=>x.book===hb.book);
          if(ab) paired.push(`${hb.book}:${away} ${ab.spread>0?"+":""}${ab.spread}/${home} ${hb.spread>0?"+":""}${hb.spread}`);
        }
        bookDetail=paired.slice(0,4).join(" | ");
      } else {
        // Only if there are insufficient major-book observations, use fairSpread.
        const hs=strictNumber(ho.fairSpread), as=strictNumber(ao.fairSpread);
        if(hs!==null&&as!==null){
          homeSpread=hs;awaySpread=as;method="fallback fairSpread";
        }
      }

      let valid=Number.isFinite(homeSpread)&&Number.isFinite(awaySpread);
      let warning="";

      if(valid){
        // Home and away must mirror.
        if(Math.abs(homeSpread+awaySpread)>0.26){
          valid=false;
          warning=`non-mirrored pair: ${away} ${awaySpread}, ${home} ${homeSpread}`;
        }
        if(homeSpread!==0&&awaySpread!==0&&Math.sign(homeSpread)===Math.sign(awaySpread)){
          valid=false;
          warning=`same-sign pair: ${away} ${awaySpread}, ${home} ${homeSpread}`;
        }
      } else {
        warning="no usable major-book/fair spread pair";
      }

      games.push({
        eventID:ev.eventID,
        startTime:ev.startTime,
        home,away,valid,warning,method,bookDetail,
        homeSpread:valid?homeSpread:null,
        awaySpread:valid?awaySpread:null,
        consensusHomeSpread:strictNumber(ho.bookSpread),
        consensusAwaySpread:strictNumber(ao.bookSpread)
      });
    }

    res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=300");
    return res.status(200).json({games,updatedAt:new Date().toISOString()});
  }catch(err){
    return res.status(500).json({
      error:"Failed to fetch/normalize NFL spreads",
      detail:String(err)
    });
  }
}