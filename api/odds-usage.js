// Read-only, secret-safe SportsGameOdds quota diagnostic.
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const key=process.env.SPORTSGAMEODDS_API_KEY;
  if(!key) return res.status(503).json({status:"missing_key"});
  if([...key].some(c=>c.codePointAt(0)>255 || /[\r\n]/.test(c))) return res.status(503).json({status:"invalid_key_characters"});
  try{
    const response=await fetch("https://api.sportsgameodds.com/v2/account/usage",{headers:{"x-api-key":key.trim()},cache:"no-store"});
    if(!response.ok) return res.status(200).json({status:"usage_lookup_failed",providerHttpStatus:response.status});
    const body=await response.json();
    const data=body.data||{};
    const limits=data.rateLimits||{};
    const safe={};
    for(const [interval,v] of Object.entries(limits)){
      if(!v || typeof v!=="object")continue;
      safe[interval]={};
      for(const [k,val] of Object.entries(v)){
        if(/^(maxRequestsPerInterval|maxEntitiesPerInterval|currentIntervalRequests|currentIntervalEntities|currentIntervalEndTime|max-requests|max-entities|current-requests|current-entities)$/.test(k))safe[interval][k]=val;
      }
    }
    return res.status(200).json({status:"ok",active:data.isActive??null,tier:data.tier??null,rateLimits:safe});
  }catch(e){return res.status(502).json({status:"usage_lookup_error"});}
}