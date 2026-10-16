// A briefly occluded low hurdle can resemble a fence around the runner.
// Retain its previously measured identity only with a close motion match.
// Previously established hard fences always take precedence.
export function knownLowRail(f,rails,fences,height,at){
 if(!f.postFit||f.bw<35||f.bh/f.bw>=.75)return null;
 const horizon=height*225/668,inverse=1/(f.y-horizon);
 const matches=t=>{
  if(t.lane!==f.lane||!t.rate||at<t.seen||at-t.seen>200)return false;
  const predicted=t.inverse-t.rate*(at-t.seen);
  if(predicted<=0)return false;
  return Math.abs(inverse-predicted)<=t.rate*60&&
   Math.abs(f.y-(horizon+1/predicted))<=Math.max(8,f.bh*.20);
 };
 if(fences.some(t=>t.hits>=3&&t.pairedHits>=2&&matches(t)))return null;
 return rails.find(t=>t.hits>=4&&matches(t))||null;
}
