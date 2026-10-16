// Integrate a bounded lane-clearance preference over actual elapsed time.
// This is a tie preference, not game reward and never a collision constraint.
export function clearanceArea(events,start,end){
 const cuts=[start,end,...events.flatMap(t=>[t,t-700]).filter(t=>t>start&&t<end)].sort((a,b)=>a-b);
 let area=0;
 for(let i=1;i<cuts.length;i++){
  const a=cuts[i-1],b=cuts[i],mid=(a+b)/2;
  const next=Math.min(Infinity,...events.filter(t=>t>mid));
  const room=t=>Math.max(0,Math.min(700,next-t));
  area+=(b-a)*(room(a)+room(b))/2;
 }
 return area;
}
export function clearanceCredit(times,from,to,start,duration){
 const lanes=from===to?[from]:Math.abs(from-to)===1?[from,to]:[from,0,to];
 const portion=duration/lanes.length;
 return lanes.reduce((sum,lane,i)=>sum+clearanceArea(times[lane+1],start+i*portion,start+(i+1)*portion),0)*.0007/30;
}
