// Keep the runner grounded for a nearby green coin in earlier stages.
// A confirmed low-obstacle threat overrides the reward preference. Late-stage
// jumping stays unchanged until separately validated at its higher speed.
export function greenJumpDeferral(events,obstacles,{late,current,end,leadMs=500}) {
  if(late)return null;
  const lanes=new Set([current,end]);
  if(obstacles.some(o=>lanes.has(o.lane)&&o.eta>-60&&o.eta<400))return null;
  return events.find(e=>e.kind==='green'&&lanes.has(e.lane)&&e.eta>=0&&e.eta<=leadMs)||null;
}
