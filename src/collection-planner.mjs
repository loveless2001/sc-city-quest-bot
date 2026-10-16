// Plan visible pickup deadlines using screenshot motion and measured lane travel.
// Fence safety is handled by the obstacle planner before this is called.
// Values below are planning preferences, not asserted in-game point amounts.
export function planCollection(objects,{lane,now,height,rate,sensorLagMs=0,memory=null}){
 const candidates=objects.map(o=>({...o,eta:(1/(o.y-height*.35)-1/(height*.68-height*.35))/rate-sensorLagMs,
  value:o.kind==='gift'?100:o.kind==='bonus'?75:o.letter>=.65?25:o.coin>=.65?12:5}));
 if(memory&&memory.until>now)candidates.push({...memory,memory:true,eta:Math.max(0,memory.until-now-90),
  value:memory.kind==='gift'?100:memory.kind==='bonus'?75:memory.letter>=.65?25:memory.coin>=.65?12:5});
 const events=[];
 for(const o of candidates.sort((a,b)=>b.value-a.value)){
  if(o.eta< -100||o.eta>2400)continue;
  if(events.some(g=>g.lane===o.lane&&Math.abs(g.eta-o.eta)<100))continue;
  events.push({...o,eta:Math.max(0,o.eta)});
 }
 events.sort((a,b)=>a.eta-b.eta);
 let states=[{lane,time:0,score:0,route:[]}];
 for(const event of events.slice(0,16)){
  const next=[...states];
  for(const state of states){
   const travel=Math.abs(event.lane-state.lane)*(state.lane===event.lane?0:90)+45;
   if(event.eta+60<state.time+(state.lane===event.lane?0:travel))continue;
   next.push({lane:event.lane,time:Math.max(state.time,event.eta)+65,
    score:state.score+event.value*Math.exp(-event.eta/1800),route:[...state.route,event]});
  }
  // Keep the best chain ending at each event; skipped chains remain available.
  next.sort((a,b)=>b.score-a.score);states=next.slice(0,96);
 }
 states.sort((a,b)=>b.score-a.score);
 const best=states[0];return {target:best?.route[0]||null,route:best?.route||[],score:best?.score||0};
}
