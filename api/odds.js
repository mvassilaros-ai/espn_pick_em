function normTeam(t){
  const m={LAR:"LA",WSH:"WAS",OAK:"LV",JAC:"JAX"};
  t=String(t||"").toUpperCase();
  return m[t]||t;
}
function teamAbbr(side){
  const t=side||{};
  return normTeam(t.abbreviation||t.names?.short||t.name||t.teamID||"");
}
function americanToProb(v){
  if(v===null||v===undefined)return null;
  const o=Number(String(v).replace("+",""));
  if(!Number.isFinite(o)||o===0)return null;
  return o<0 ? (-o)/((-o)+100) : 100/(o+100);
}
function median(a){
  const x=a.filter(Number.isFinite).sort((a,b)=>a-b);
  if(!x.length)return null;
  const m=Math.floor(x.length/2);
  return x.length%2?x[m]:(x[m-1]+x[m])/2;
}
function bookProbPair(homeOdd,awayOdd){
  const major=["draftkings","fanduel","betmgm","caesars","espnbet","bet365"];
  const hp=[],ap=[];
  const hb=homeOdd?.byBookmaker||{}, ab=awayOdd?.byBookmaker||{};
  for(const b of major){
    const hv=hb[b]?.odds, av=ab[b]?.odds;
    const h=americanToProb(hv), a=americanToProb(av);
    if(h==null||a==null)continue;
    const s=h+a;
    if(s<0.95||s>1.20)continue;
    hp.push(h/s); ap.push(a/s);
  }
  return {home:median(hp),away:median(ap),books:hp.length};
}
export default async function handler(req,res){
  const apiKey=process.env.SPORTSGAMEODDS_API_KEY;
  if(!apiKey)return res.status(503).json({error:"SPORTSGAMEODDS_API_KEY is not configured."});
  try{
    const url=new URL("https://api.sportsgameodds.com/v2/events");
    url.searchParams.set("leagueID","NFL");
    url.searchParams.set("oddsAvailable","true");
    url.searchParams.set("limit","100");
    url.searchParams.set("oddID","points-home-game-ml-home,points-away-game-ml-away");
    url.searchParams.set("startsAfter","2026-09-01T00:00:00.000Z");
    url.searchParams.set("startsBefore","2027-01-06T23:59:59.000Z");

    const r=await fetch(url,{headers:{"x-api-key":apiKey}});
    if(!r.ok){
      const t=await r.text();
      return res.status(r.status).send(t);
    }
    const obj=await r.json();
    const events=obj.data||obj.events||[];
    const games=[];

    for(const ev of events){
      const home=teamAbbr(ev.teams?.home), away=teamAbbr(ev.teams?.away);
      if(!home||!away)continue;

      const ho=ev.odds?.["points-home-game-ml-home"];
      const ao=ev.odds?.["points-away-game-ml-away"];
      if(!ho||!ao){
        games.push({home,away,valid:false,warning:"missing exact home/away moneyline market"});
        continue;
      }

      const hf=americanToProb(ho.fairOdds);
      const af=americanToProb(ao.fairOdds);
      let homeProb=null,awayProb=null,method="fairOdds";
      let valid=true,warning="";

      if(hf==null||af==null){
        valid=false;warning="invalid fairOdds";
      } else {
        const sum=hf+af;
        // fairOdds should already be vig-free and therefore close to 1.00.
        if(sum<0.97||sum>1.03){
          // Fallback to bookmaker-pair de-vigging instead of trusting a bad pair.
          const bp=bookProbPair(ho,ao);
          if(bp.books>=2){
            homeProb=bp.home;awayProb=bp.away;method=`median no-vig (${bp.books} major books)`;
          } else {
            valid=false;warning=`fair probability sum ${sum.toFixed(4)} outside sanity band`;
          }
        } else {
          // Normalize tiny rounding residuals.
          homeProb=hf/sum;awayProb=af/sum;
        }
      }

      if(valid){
        const check=(homeProb||0)+(awayProb||0);
        if(Math.abs(check-1)>0.005){
          valid=false;warning="normalized probabilities do not sum to 1";
        }
      }

      games.push({
        eventID:ev.eventID,
        startTime:ev.startTime,
        home,away,valid,warning,method,
        homeFairOdds:ho?.fairOdds||null,
        awayFairOdds:ao?.fairOdds||null,
        homeProb,awayProb
      });
    }

    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({games,updatedAt:new Date().toISOString()});
  }catch(err){
    res.status(500).json({error:"Failed to fetch/normalize SportsGameOdds",detail:String(err)});
  }
}
