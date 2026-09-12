function norm(t){
  const m={LAR:"LA",WSH:"WAS",JAC:"JAX",OAK:"LV"};
  t=String(t||"").toUpperCase();
  return m[t]||t;
}
function csvRows(s){
  const out=[];let row=[],cell="",q=false;
  for(let i=0;i<s.length;i++){
    const c=s[i];
    if(q){
      if(c=='"'&&s[i+1]=='"'){cell+='"';i++}
      else if(c=='"')q=false;
      else cell+=c;
    }else if(c=='"')q=true;
    else if(c==','){row.push(cell);cell=""}
    else if(c=='\n'){row.push(cell.replace(/\r$/,""));out.push(row);row=[];cell=""}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);out.push(row)}
  return out;
}
export default async function handler(req,res){
  const week=Math.max(1,Math.min(18,Number(req.query.week||1)));
  try{
    const r=await fetch("https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv");
    const csv=await r.text();
    const all=csvRows(csv),header=all[0],ix={};
    header.forEach((h,i)=>ix[h]=i);
    const games=[];
    for(const row of all.slice(1)){
      if(Number(row[ix.season])!==2026)continue;
      if(row[ix.game_type]!=="REG")continue;
      if(Number(row[ix.week])!==week)continue;
      games.push({
        week,
        away:norm(row[ix.away_team]),
        home:norm(row[ix.home_team]),
        gameday:row[ix.gameday],
        gametime:row[ix.gametime]
      });
    }
    res.setHeader("Cache-Control","s-maxage=3600, stale-while-revalidate=21600");
    res.status(200).json({week,games,updatedAt:new Date().toISOString()});
  }catch(err){
    res.status(500).json({error:"Failed to load NFL schedule",detail:String(err)});
  }
}