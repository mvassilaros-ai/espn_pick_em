// In-process request coalescing and cooldown; CDN caching handles shared successful responses.
let pendingRequest=null;
let blockedUntil=0;
let lastGood=null;
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

const BOOK_WEIGHTS={
 pinnacle:5,pinnacleus:5,circa:5,bookmaker:5,bookmaker_eu:5,
 draftkings:2,fanduel:2,betmgm:2,caesars:2,williamhill_us:2,
 bet365:2,espnbet:2,bet_rivers:2,betrivers:2
};
function bookWeight(name){
 const k=String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
 return BOOK_WEIGHTS[k]||0;
}
function trustedConsensus(pairs){
 const trusted=pairs.map(p=>({...p,weight:bookWeight(p.book)})).filter(p=>p.weight>0&&Number.isFinite(p.homeSpread));
 const distinct=new Set(trusted.map(p=>String(p.book).toLowerCase()));
 if(distinct.size<2)return {valid:false,warning:"Fewer than two approved sportsbooks",used:trusted};
 const sharp=trusted.filter(p=>p.weight>=5);
 const reference=median((sharp.length>=2?sharp:trusted).map(p=>p.homeSpread));
 const inliers=trusted.filter(p=>Math.abs(p.homeSpread-reference)<=1.5);
 if(new Set(inliers.map(p=>String(p.book).toLowerCase())).size<2)return {valid:false,warning:"Approved sportsbook lines disagree",used:trusted};
 const sharpInliers=inliers.filter(p=>p.weight>=5);
 if(sharpInliers.length>=2&&Math.max(...sharpInliers.map(p=>p.homeSpread))-Math.min(...sharpInliers.map(p=>p.homeSpread))>1)
  return {valid:false,warning:"Sharp sportsbooks disagree by over 1 point",used:inliers};
 const weightTotal=inliers.reduce((s,p)=>s+p.weight,0);
 const spread=Math.round(inliers.reduce((s,p)=>s+p.homeSpread*p.weight,0)/weightTotal*4)/4;
 return {valid:true,homeSpread:spread,awaySpread:-spread,used:inliers,warning:""};
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

const NFL_TEAMS={"Arizona Cardinals":"ARI","Atlanta Falcons":"ATL","Baltimore Ravens":"BAL","Buffalo Bills":"BUF","Carolina Panthers":"CAR","Chicago Bears":"CHI","Cincinnati Bengals":"CIN","Cleveland Browns":"CLE","Dallas Cowboys":"DAL","Denver Broncos":"DEN","Detroit Lions":"DET","Green Bay Packers":"GB","Houston Texans":"HOU","Indianapolis Colts":"IND","Jacksonville Jaguars":"JAX","Kansas City Chiefs":"KC","Las Vegas Raiders":"LV","Los Angeles Chargers":"LAC","Los Angeles Rams":"LA","Miami Dolphins":"MIA","Minnesota Vikings":"MIN","New England Patriots":"NE","New Orleans Saints":"NO","New York Giants":"NYG","New York Jets":"NYJ","Philadelphia Eagles":"PHI","Pittsburgh Steelers":"PIT","San Francisco 49ers":"SF","Seattle Seahawks":"SEA","Tampa Bay Buccaneers":"TB","Tennessee Titans":"TEN","Washington Commanders":"WAS"};
let backupPending=null,backupCooldown=0;
async function backupOdds(){
 const key=process.env.THE_ODDS_API_KEY;
 if(!key)throw Error("Backup key not configured");
 if(Date.now()<backupCooldown)throw Error("Backup provider cooldown");
 if(!backupPending)backupPending=(async()=>{
  const u=new URL("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds");
  u.searchParams.set("apiKey",key.trim());u.searchParams.set("regions","us");
  u.searchParams.set("markets","spreads");u.searchParams.set("oddsFormat","american");
  const r=await fetch(u,{cache:"no-store"});
  if(!r.ok){backupCooldown=Date.now()+(r.status===429?300000:60000);throw Error("Backup HTTP "+r.status);}
  const data=await r.json();
  const games=(Array.isArray(data)?data:[]).map(ev=>{
   const home=NFL_TEAMS[ev.home_team],away=NFL_TEAMS[ev.away_team];
   const pairs=[];
   for(const b of ev.bookmakers||[]){
    const market=(b.markets||[]).find(m=>m.key==="spreads");
    const h=(market?.outcomes||[]).find(x=>x.name===ev.home_team);
    const a=(market?.outcomes||[]).find(x=>x.name===ev.away_team);
    const hs=strictNumber(h?.point),as=strictNumber(a?.point);
    if(hs!==null&&as!==null&&Math.abs(hs+as)<=0.26 && (!market.last_update || Date.now()-Date.parse(market.last_update)<3600000))pairs.push({book:b.key,homeSpread:hs,awaySpread:as});
   }
   const consensus=trustedConsensus(pairs);
   return {eventID:ev.id,startTime:ev.commence_time,home,away,valid:!!home&&!!away&&consensus.valid,
     homeSpread:consensus.valid?consensus.homeSpread:null,awaySpread:consensus.valid?consensus.awaySpread:null,pairedBooks:pairs.length,
     method:"weighted approved sportsbooks",bookDetail:consensus.used.map(p=>p.book+":"+p.homeSpread).join(" | "),
     warning:consensus.warning};
  }).filter(g=>g.home&&g.away);
  const payload={games,eventCount:games.length,validCount:games.filter(g=>g.valid).length,
    updatedAt:new Date().toISOString(),provider:"The Odds API"};
  if(payload.validCount===0)throw Error("Backup returned no valid spreads");
  return payload;
 })().finally(()=>backupPending=null);
 return backupPending;
}
async function backupResponse(res,reason){
 try{const payload=await backupOdds();lastGood=payload;res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=3600");return res.status(200).json({...payload,warning:reason});}
 catch(e){if(lastGood){res.setHeader("Cache-Control","public, s-maxage=60");return res.status(200).json({...lastGood,stale:true,warning:reason+"; backup: "+e.message});}
 return res.status(503).json({error:reason,backupError:e.message});}
}

export default async function handler(req,res){
  const apiKey=process.env.SPORTSGAMEODDS_API_KEY;
  if(!apiKey){
    return res.status(503).json({error:"SPORTSGAMEODDS_API_KEY is not configured."});
  }
  // Validate without logging or exposing the secret.
  const invalidIndex=[...apiKey].findIndex(ch=>ch.codePointAt(0)>255 || /[\r\n]/.test(ch));
  if(invalidIndex>=0){
    return res.status(503).json({error:"Invalid SportsGameOdds API key in Vercel",detail:"The configured key contains a non-HTTP-header character.",invalidCharacterIndex:invalidIndex,invalidCharacterCodePoint:[...apiKey][invalidIndex].codePointAt(0),hint:"Replace the Production SPORTSGAMEODDS_API_KEY with the raw key, not masked bullets; redeploy."});
  }

  try{
    if(Date.now()<blockedUntil){
      res.setHeader("Cache-Control","public, s-maxage=60");
      if(lastGood) return res.status(200).json({...lastGood,stale:true,warning:"Provider rate limited; last verified odds shown"});
      return backupResponse(res,"SportsGameOdds rate limit cooldown");
    }
    const url=new URL("https://api.sportsgameodds.com/v2/events");
    url.searchParams.set("leagueID","NFL");
    url.searchParams.set("oddsAvailable","true");
    // Include started events: some providers flag games as started before kickoff;
    // match by schedule on client and reject expired markets when necessary.
    // Limit to the current NFL slate rather than every open NFL event.
    // UTC window covers the current week and the next few days around rollover.
    const now=new Date();
    const day=now.getUTCDay();
    const mondayOffset=(day+6)%7;
    const monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-mondayOffset));
    const end=new Date(monday.getTime()+8*86400000);
    url.searchParams.set("startsAfter",monday.toISOString());
    url.searchParams.set("startsBefore",end.toISOString());
    url.searchParams.set("started","false");
    url.searchParams.set("type","match");
    url.searchParams.set("oddID","points-home-game-sp-home,points-away-game-sp-away");
    url.searchParams.set("limit","25");
    // Deliberately do not filter by oddID. We inspect actual returned markets.

    if(!pendingRequest){
      pendingRequest=fetch(url,{headers:{"x-api-key":apiKey.trim()}}).then(async r=>{
        if(!r.ok){
          const retryAfter=Number(r.headers.get("retry-after"));
          if(r.status===429) blockedUntil=Date.now()+Math.max(60000,Math.min(3600000,(Number.isFinite(retryAfter)&&retryAfter>0?retryAfter:300)*1000));
          const error=new Error(r.status===429?"Provider rate limit exceeded":"Provider HTTP "+r.status);
          error.status=r.status;
          throw error;
        }
        return r.json();
      }).finally(()=>{pendingRequest=null});
    }
    let obj;
    try{obj=await pendingRequest}catch(e){
      if(lastGood){res.setHeader("Cache-Control","public, s-maxage=60");return res.status(200).json({...lastGood,stale:true,warning:String(e.message)});}
      return backupResponse(res,e.message);
    }
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

      const consensus=trustedConsensus(pairs);
      if(consensus.valid){
        homeSpread=consensus.homeSpread;
        awaySpread=consensus.awaySpread;
        valid=true;
        method="weighted approved sportsbooks";
        bookDetail=consensus.used.map(p=>p.book+":"+p.homeSpread).join(" | ");
      }else{
        warning=consensus.warning;
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

    // Shared Vercel CDN cache; do not consume a provider request per browser refresh.
    res.setHeader("Cache-Control","public, s-maxage=900, stale-while-revalidate=3600");
    const payload={games,eventCount:events.length,validCount:games.filter(g=>g.valid).length,updatedAt:new Date().toISOString()};
    if(payload.validCount>0) lastGood=payload;
    return res.status(200).json(payload);

  }catch(err){
    return res.status(500).json({
      error:"Failed to fetch/normalize NFL spreads",
      detail:String(err)
    });
  }
}