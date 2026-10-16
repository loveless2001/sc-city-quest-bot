// Correct only a synthetic forecast. Two recent cone measurements must share
// the road depth of a separately observed paired fence in the predicted row.
// This avoids trusting the noisy cone speed fit or deleting a visible fence.
export function coneForForecast(f, fences, cones, height, at) {
 if (!f.forecast) return null;
 const horizon=height*225/668;
 for (const c of cones) {
  if(c.kind!=='cones'||c.lane!==f.lane||c.hits<3||c.confidence<.8||
     at<c.seen||at-c.seen>160||c.y<height*.44||c.y>height*.60)continue;
  const samples=c.history.slice(-3);
  if(samples.length<3||samples.at(-1).at-samples[0].at<70)continue;
  for(const t of fences){
   if(t.forecast||!t.forecastAdjusted||t.forecastRow!==f.forecastRow||
      t.lane===f.lane||t.hits<3||t.pairedHits<2)continue;
   let matches=0;
   let latestMatches=false;
   const history=fences.filter(a=>!a.forecast&&a.lane===t.lane&&a.pairedHits>=2)
     .flatMap(a=>a.history||[]);
   for(const s of samples){
    const sameDepth=p=>Math.abs(p.at-s.at)<=35&&Math.abs(horizon+1/p.inverse-s.y)<=Math.max(6,(s.y-horizon)*.06);
    if(history.some(sameDepth))matches++;
    if(s===samples.at(-1))latestMatches=(t.history||[]).some(sameDepth);
   }
   if(matches>=2&&latestMatches)return {coneId:c.id,fenceId:t.id,hits:c.hits,matches};
  }
 }
 return null;
}
