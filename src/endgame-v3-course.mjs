// Final-stage rules of the public game bundle index-kcDsL1AL.js, unchanged in
// index-DnBWvl2N.js (2026-10-16 update: guest analytics only) (read from the
// served JavaScript). Distances are game metres; lanes 0,1,2 sit at x=-2.75,0,2.75.
export const LANE_X=[-2.75,0,2.75];
export const BREATHER_START=2800,BREATHER_END=3300,LANE_FENCE_END=3800,SPARSE_END=4300,DENSE_FULL=4600;
export const TIGHTEN_START=6000,TIGHTEN_END=8000,FORCE_END=10000;
export const MOVING_RANGES=[[3000,4000],[7000,7500]];
export const SLIDE_SPEED=0.5*2.75;          // metres per second, bouncing between the outer lanes
export const DENSE_ROWS=[[0,2],[0,1],[1,2]];
export const FENCE_HALF_X=1.614,FENCE_HALF_Z=0.5;

const lerp=(a,b,t)=>a+(b-a)*t,clamp=t=>Math.min(Math.max(t,0),1);
export const isMoving=z=>MOVING_RANGES.some(([a,b])=>z>=a&&z<b);
// Rows whose distance is only known to within the interval [lo,hi] may be on
// either side of a sliding-range boundary (the game decides by spawn distance).
export const straddlesMovingEdge=(lo,hi)=>MOVING_RANGES.some(([a,b])=>(lo<a&&hi>=a)||(lo<b&&hi>=b));
// Gap after a dense row spawned at z.
export function denseGap(z){
  const t=clamp((z-2800)/(DENSE_FULL-2800)),n=clamp((z-SPARSE_END)/(DENSE_FULL-SPARSE_END));
  return lerp(lerp(25,15,t)*lerp(2,1,n)*5,5,clamp((z-TIGHTEN_START)/(TIGHTEN_END-TIGHTEN_START)));
}
// Lane-fence rows: one fence every 30 m from 3300 to 3780, random lane.
export function laneFenceRows(){const rows=[];for(let z=BREATHER_END;z<LANE_FENCE_END;z+=30)rows.push(z);return rows;}
// Dense rows from the first dense row z0 (the first spawn position at or beyond 4300).
export function denseRows(z0,limit=FORCE_END){
  const rows=[];let z=z0,i=0;
  while(z<limit){rows.push({z,lanes:DENSE_ROWS[i%3],index:i});z+=denseGap(z);i++;}
  return rows;
}
// Lateral position of a sliding fence `elapsed` seconds after it spawned at x0.
export function slideX(x0,dir,elapsed){
  // Unfold the bounce between -2.75 and 2.75 (period 4*2.75/speed).
  const span=5.5;let u=(x0+2.75)+dir*SLIDE_SPEED*elapsed;
  u=((u%(2*span))+2*span)%(2*span);
  return (u<=span?u:2*span-u)-2.75;
}
// Speed law (unchanged early physics): 20 + 0.12 T before 2600 m, then a linear
// ramp in distance to 50 m/s at 3000 m.
export function timeAtDistance(z){
  if(z<=2600)return (Math.sqrt(400+.24*Math.max(0,z))-20)/.12;
  if(z<=3000)return 100+Math.log(1+.045*(z-2600)/32)/.045;
  return 100+Math.log(50/32)/.045+(z-3000)/50;
}
export function distanceAtTime(t){
  const ramp=Math.log(50/32)/.045;
  if(t<=100)return 20*t+.06*t*t;
  if(t<=100+ramp)return 2600+32/.045*Math.expm1(.045*(t-100));
  return 3000+50*(t-100-ramp);
}
export function speedAt(z){return z<2600?20+.12*timeAtDistance(z):Math.min(32+.045*(z-2600),50);}
