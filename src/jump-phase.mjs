// Torso trajectories measured from screenshots put the jump apex near214ms
// and the useful raised interval around90..350ms. When a known obstacle would
// arrive during landing, wait on the ground and launch nearer its arrival.
// Unknown obstacles retain the original continuous-feedback fallback.
export function deferJumpForKnownObstacle(obstacles,{current,end,commands}){
 const lateral=commands.filter(c=>c.key==='ArrowLeft'||c.key==='ArrowRight');
 const next=obstacles.filter(o=>o.eta>0&&(o.lane===end||o.lane===current&&
  (!lateral.length||o.eta<lateral[0].atMs+80))).sort((a,b)=>a.eta-b.eta)[0];
 return next&&next.eta>300&&next.eta<650?next:null;
}
