// Course rules of the public game bundle, read from the served JavaScript.
// Distances are game metres; lanes 0,1,2 sit at x=-2.75,0,2.75.
//
// Two courses are known:
//   BFqScKec (index-BFqScKec.js, live from 2026-10-17, the default): stages
//     lengthened, final stage from 4140 m, lane-fence rows straight after the
//     random obstacles (no breather), course end at 11040 m.
//   DnBWvl2N (index-kcDsL1AL.js and index-DnBWvl2N.js, until 2026-10-17): the
//     course of all runs recorded before; kept for replaying them.
// The constants below are live bindings: useCourse()/withCourse() switch them.
export const LANE_X=[-2.75,0,2.75];
export const SLIDE_SPEED=0.5*2.75;          // metres per second, bouncing between the outer lanes
export const DENSE_ROWS=[[0,2],[0,1],[1,2]];
export const FENCE_HALF_X=1.614,FENCE_HALF_Z=0.5;
const BASE_SPEED=20,ACCEL=0.12,MAX_SPEED=50;

export const COURSES={
  BFqScKec:{bundle:'index-BFqScKec.js',
    stages:[['Nhập cuộc',0,25],['Tăng tốc 1',500,28],['Tăng tốc 2',1280,31],['Tăng tốc 3',3060,34],['Về đích',3840,37],['Bứt phá',4140,50]],
    finalRampEnd:4540,patternStart:4340,laneStart:4340,laneEnd:4840,sparseEnd:5340,denseFull:5640,
    tightenStart:7040,tightenEnd:9040,forceEnd:11040,moving:[[4340,5040],[8040,8540]],
    // Coin streams (single lane, one coin every 12/1.3 m) from the sparse end to the course end.
    streamStep:12/1.3,letterInterval:45.5,
    // The endgame controller follows the course from followZ (the first lane row
    // is in view from 4270 m) and steers from takeoverZ, 55 m before that row,
    // planning around the early-game controller's tracks of the last random
    // obstacles (all before patternStart).
    followZ:4250,takeoverZ:4285},
  DnBWvl2N:{bundle:'index-DnBWvl2N.js',
    stages:[['Nhập cuộc',0,25],['Tăng tốc 1',500,28],['Tăng tốc 2',1100,31],['Tăng tốc 3',1700,34],['Về đích',2300,37],['Bứt phá',2600,50]],
    finalRampEnd:3000,patternStart:2800,laneStart:3300,laneEnd:3800,sparseEnd:4300,denseFull:4600,
    tightenStart:6000,tightenEnd:8000,forceEnd:10000,moving:[[3000,4000],[7000,7500]],
    // Coin streams (one or two lanes, one coin every 6 m) in the breather and from the sparse end.
    streamStep:6,letterInterval:35,
    // Inside the empty breather: following and steering start together.
    followZ:2806,takeoverZ:2806},
};

// Final stage: random obstacles until PATTERN_START; lane-fence rows (one
// sliding fence every 30 m in a random lane, 5% with a mystery box 15 m on)
// from LANE_START to LANE_FENCE_END; sparse fences 40-60 m apart (sliding in
// the first moving range) to SPARSE_END; then two-lane rows in a fixed pattern
// and spacing (sliding in the second range) to FORCE_END.
export let COURSE,STAGE_START,FINAL_START,FINAL_RAMP_END,PATTERN_START,LANE_START,LANE_FENCE_END,SPARSE_END,DENSE_FULL,
  TIGHTEN_START,TIGHTEN_END,FORCE_END,MOVING_RANGES,STREAM_STEP,LETTER_INTERVAL,FOLLOW_Z,TAKEOVER_Z;
let segments;
export function useCourse(name){
  const c=COURSES[name];if(!c)throw new Error(`unknown course ${name}`);
  COURSE=name;STAGE_START=Object.fromEntries(c.stages.map(([n,z])=>[n,z]));FINAL_START=c.stages.at(-1)[1];FINAL_RAMP_END=c.finalRampEnd;
  ({patternStart:PATTERN_START,laneStart:LANE_START,laneEnd:LANE_FENCE_END,sparseEnd:SPARSE_END,denseFull:DENSE_FULL,
    tightenStart:TIGHTEN_START,tightenEnd:TIGHTEN_END,forceEnd:FORCE_END,moving:MOVING_RANGES,streamStep:STREAM_STEP,
    letterInterval:LETTER_INTERVAL,followZ:FOLLOW_Z,takeoverZ:TAKEOVER_Z}=c);
  segments=speedSegments(c);
  return name;
}
// Runs fn with another course's rules (synchronous code only).
export function withCourse(name,fn){const prev=COURSE;useCourse(name);try{return fn();}finally{useCourse(prev);}}
useCourse('BFqScKec');

const lerp=(a,b,t)=>a+(b-a)*t,clamp=t=>Math.min(Math.max(t,0),1);
export const isMoving=z=>MOVING_RANGES.some(([a,b])=>z>=a&&z<b);
// Rows whose distance is only known to within the interval [lo,hi] may be on
// either side of a sliding-range boundary (the game decides by spawn distance).
export const straddlesMovingEdge=(lo,hi)=>MOVING_RANGES.some(([a,b])=>(lo<a&&hi>=a)||(lo<b&&hi>=b));
// Gap after a dense row spawned at z.
export function denseGap(z){
  const t=clamp((z-PATTERN_START)/(DENSE_FULL-PATTERN_START)),n=clamp((z-SPARSE_END)/(DENSE_FULL-SPARSE_END));
  return lerp(lerp(25,15,t)*lerp(2,1,n)*5,5,clamp((z-TIGHTEN_START)/(TIGHTEN_END-TIGHTEN_START)));
}
// Lane-fence rows: one fence every 30 m from LANE_START, random lane.
export function laneFenceRows(){const rows=[];for(let z=LANE_START;z<LANE_FENCE_END;z+=30)rows.push(z);return rows;}
// The first sparse row follows the last lane row exactly, 30 m on.
export const firstSparseRow=()=>laneFenceRows().at(-1)+30;
// Dense rows from the first dense row z0 (the first spawn position at or beyond SPARSE_END).
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

// Speed law: from 20 m/s the runner gains 0.12 m/s each second while below its
// stage's cap; from the start of the final stage the speed ramps, linearly in
// distance, from its entry speed to 50 m/s at FINAL_RAMP_END. On the current
// course the 31 m/s cap of Tăng tốc 2 binds from about 2338 m; on the old one
// no cap was ever reached. Pieces: acc (v = v0 + 0.12 t), cst, ramp (v = v0 + k z).
function speedSegments(c){
  const st=c.stages,segs=[];let z=0,t=0,v=BASE_SPEED;
  for(let i=0;i<st.length-1;i++){
    const end=st[i+1][1],cap=st[i][2];
    if(v<cap){
      const dz=(cap*cap-v*v)/(2*ACCEL);segs.push({kind:'acc',z0:z,t0:t,v0:v});
      if(z+dz>=end){const tau=(Math.sqrt(v*v+2*ACCEL*(end-z))-v)/ACCEL;t+=tau;v+=ACCEL*tau;z=end;continue;}
      t+=(cap-v)/ACCEL;z+=dz;v=cap;
    }
    segs.push({kind:'cst',z0:z,t0:t,v0:v});t+=(end-z)/v;z=end;
  }
  const k=(MAX_SPEED-v)/(c.finalRampEnd-z);
  segs.push({kind:'ramp',z0:z,t0:t,v0:v,k});t+=Math.log(MAX_SPEED/v)/k;
  segs.push({kind:'cst',z0:c.finalRampEnd,t0:t,v0:MAX_SPEED});
  return segs;
}
const segAtZ=z=>{for(let i=segments.length-1;i>0;i--)if(z>=segments[i].z0)return segments[i];return segments[0];};
const segAtT=t=>{for(let i=segments.length-1;i>0;i--)if(t>=segments[i].t0)return segments[i];return segments[0];};
export function timeAtDistance(z){
  const s=segAtZ(z),dz=Math.max(0,z-s.z0);
  if(s.kind==='acc')return s.t0+(Math.sqrt(s.v0*s.v0+2*ACCEL*dz)-s.v0)/ACCEL;
  if(s.kind==='ramp')return s.t0+Math.log1p(s.k*dz/s.v0)/s.k;
  return s.t0+dz/s.v0;
}
export function distanceAtTime(t){
  const s=segAtT(t),dt=Math.max(0,t-s.t0);
  if(s.kind==='acc')return s.z0+s.v0*dt+ACCEL/2*dt*dt;
  if(s.kind==='ramp')return s.z0+s.v0/s.k*Math.expm1(s.k*dt);
  return s.z0+s.v0*dt;
}
export function speedAt(z){
  const s=segAtZ(z),dz=Math.max(0,z-s.z0);
  if(s.kind==='acc')return Math.sqrt(s.v0*s.v0+2*ACCEL*dz);
  if(s.kind==='ramp')return Math.min(s.v0+s.k*dz,MAX_SPEED);
  return s.v0;
}
