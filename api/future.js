const FALLBACK_RATINGS={
  LA:1.7,BAL:1.6,BUF:1.1,DET:1.1,SEA:1.1,PHI:1.0,KC:1.0,CIN:1.0,NE:1.0,
  HOU:.6,SF:.6,LAC:.6,GB:.6,DEN:.5,DAL:.5,CHI:.5,JAX:0,MIN:0,PIT:-.1,TB:-.1,
  IND:-.5,NO:-.5,NYG:-.6,WAS:-.6,CAR:-.6,ATL:-.6,TEN:-1.1,LV:-1.2,CLE:-1.6,
  NYJ:-1.7,ARI:-2.7,MIA:-2.7
};
function norm(t){const m={LAR:"LA",WSH:"WAS",OAK:"LV",JAC:"JAX"};t=String(t||"").toUpperCase();return m[t]||t}
function csvRows(s){
  const out=[];let row=[],cell="",q=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){if(c=='"'&&s[i+1]=='"'){cell+='"';i++}else if(c=='"')q=false;else cell+=c}
    else if(c=='"')q=true;
    else if(c==','){row.push(cell);cell=""}
    else if(c=='\n'){row.push(cell.replace(/\r$/,""));out.push(row);row=[];cell=""}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);out.push(row)}
  return out;
}
function modelP(margin){return 1/(1+Math.exp(-margin/6.5))}
async function tryNfelo(){
  try{
    const r=await fetch("https://www.nfeloapp.com/nfl-power-ratings/nfl-win-totals/",{headers:{"user-agent":"Mozilla/5.0"}});
    const html=await r.text();
    const plain=html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ");
    const ratings={...FALLBACK_RATINGS};
    const teams=["LAR","BAL","BUF","DET","SEA","PHI","KC","CIN","NE","HOU","SF","LAC","GB","DEN","DAL","CHI","JAX","MIN","PIT","TB","IND","NO","NYG","WAS","CAR","ATL","TEN","OAK","CLE","NYJ","ARI","MIA"];
    for(const ab of teams){
      const ix=plain.indexOf(ab+" 2026"); if(ix<0) continue;
      const chunk=plain.slice(ix,ix+300);
      const nums=[...chunk.matchAll(/[-+]?\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));
      if(nums.length>=10){
        const candidate=nums[nums.length-2];
        if(candidate>=-5&&candidate<=5) ratings[norm(ab)]=candidate;
      }
    }
    return ratings;
  }catch(e){return {...FALLBACK_RATINGS}}
}
export default async function handler(req,res){
  try{
    const [schedResp,ratings]=await Promise.all([
      fetch("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"),
      tryNfelo()
    ]);
    const csv=await schedResp.text(),all=csvRows(csv),header=all[0],ix={};
    header.forEach((h,i)=>ix[h]=i);
    const rows=[];
    for(const r of all.slice(1)){
      if(Number(r[ix.season])!==2026||r[ix.game_type]!=="REG")continue;
      const week=Number(r[ix.week]);if(!(week>=1&&week<=18))continue;
      const home=norm(r[ix.home_team]),away=norm(r[ix.away_team]);
      if(!(home in ratings)||!(away in ratings))continue;
      const margin=(ratings[home]-ratings[away])+1.5;
      const hp=modelP(margin),ap=1-hp;
      rows.push({week,team:home,opp:away,p:+(hp*100).toFixed(1),openp:+(hp*100).toFixed(1),future:0,unc:18,source:"MODEL",home:true});
      rows.push({week,team:away,opp:home,p:+(ap*100).toFixed(1),openp:+(ap*100).toFixed(1),future:0,unc:18,source:"MODEL",home:false});
    }
    res.setHeader("Cache-Control","s-maxage=21600, stale-while-revalidate=86400");
    res.status(200).json({rows,ratings,methodology:"nflverse schedule + nfelo market-implied neutral-field strength + 1.5 home field + logistic conversion",updatedAt:new Date().toISOString()});
  }catch(err){res.status(500).json({error:"Failed to build future model",detail:String(err)})}
}
