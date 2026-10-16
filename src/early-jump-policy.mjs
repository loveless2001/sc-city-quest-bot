// The late-stage feedback policy is unchanged. In earlier stages, only jump
// for a visibly tracked low obstacle that the committed lane still occupies.
export function earlyJumpThreat(obstacles,{current,end,commands,leadMs=280}){
 const lateral=commands.filter(c=>c.key==='ArrowLeft'||c.key==='ArrowRight');
 return obstacles.filter(o=>o.eta>-60&&o.eta<=leadMs&&(
  o.lane===end||o.lane===current&&(!lateral.length||o.eta<=lateral[0].atMs+80)))
  .sort((a,b)=>a.eta-b.eta)[0]||null;
}
