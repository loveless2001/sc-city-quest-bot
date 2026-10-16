// Final-stage controller for the current public bundle. Takes over after the
// runner passes 2800 m, where the course rules become (mostly) deterministic:
//   3300-3780 m  one sliding fence every 30 m (lane and direction from screenshots)
//   3810-4300 m  one fence every 40-60 m (sliding below 4000 m), distance measured
//   4300 m +     two-lane rows in a fixed pattern and spacing (sliding 7000-7500 m)
// Each row keeps candidate explanations (start lane, slide direction, fence or
// not) scored against the dark-pixel profile of its screen band every frame.
// The distance clock comes from visible HUD stage changes; no game state is read.
import {LANE_X,FENCE_HALF_X,FENCE_HALF_Z,laneFenceRows,denseRows,isMoving,straddlesMovingEdge,slideX,timeAtDistance,
  distanceAtTime,speedAt,SPARSE_END,FORCE_END} from './endgame-v3-course.mjs';
import {footDistance} from './endgame-v3-perception.mjs';
import {detectCoins,CoinTracker} from './endgame-v3-coins.mjs';
import {planWithFallbacks,LANES,laneDuration,xAt} from './endgame-v3-planner.mjs';
import {CameraModel} from './camera-model.mjs';
import {measureRunnerX} from './runner-x.mjs';

const cam=new CameraModel();
const FOCAL=cam.height/2/cam.tanHalf;
const SPAWN_AHEAD=80,NONFENCE_HALF_X=1.3,NONFENCE_COST=500;   // cones -30, hurdles -60; a misread fence is fatal
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?(s[(s.length-1)>>1]+s[s.length>>1])/2:null;};
const isDark=(r,g,b)=>Math.max(r,g,b)<88&&Math.abs(r-g)<26&&Math.abs(g-b)<34;

// Dark-pixel column profile of the band a fence at distance d occupies.
function bandProfile(frame,d,px,masks){
  const {data,width,height}=frame,C=data.length/(width*height);
  const top=cam.project(0,2.1,d,px).y,base=cam.project(0,0.15,d,px).y;
  const y0=Math.max(0,Math.round(top)),y1=Math.min(height-1,Math.round(base));
  const left=Math.max(0,Math.floor(cam.project(4.4,1,d,px).x)),right=Math.min(width-1,Math.ceil(cam.project(-4.4,1,d,px).x));
  const n=right-left+1,frac=new Float32Array(n),valid=new Uint8Array(n);
  const rowMasks=masks.filter(m=>m.y1>=y0&&m.y0<=y1);
  for(let x=left;x<=right;x++){
    let dark=0,seen=0;
    for(let y=y0;y<=y1;y++){
      let masked=false;for(const m of rowMasks)if(x>=m.x0&&x<=m.x1&&y>=m.y0&&y<=m.y1){masked=true;break;}
      if(masked)continue;seen++;
      const k=(y*width+x)*C;if(isDark(data[k],data[k+1],data[k+2]))dark++;
    }
    if(seen>=Math.max(2,(y1-y0+1)*0.4)){valid[x-left]=1;frac[x-left]=dark/seen;}
  }
  return {left,frac,valid,y0,y1,d,px};
}
// Screen column span of a fence centred at world x on the profile's row.
function span(p,x,half=FENCE_HALF_X){
  const a=cam.project(x+half,1,p.d,p.px).x,b=cam.project(x-half,1,p.d,p.px).x;
  return [Math.round(Math.min(a,b))-p.left,Math.round(Math.max(a,b))-p.left];
}
// Ground-contact score for fences at distance d: posts must reach the road at
// the predicted foot line, and the strip just below it must be bare road.
export function contactScore(frame,d,px,masks,xs){
  const {data,width,height}=frame,C=data.length/(width*height);
  const top=cam.project(0,2.1,d,px).y,foot=cam.project(0,0,d-0.25,px).y;
  const bandH=Math.max(4,foot-top),strip=Math.max(2,bandH*0.16),y0=Math.round(foot-strip),y1=Math.round(foot),y2=Math.min(height-1,Math.round(foot+strip));
  const rm=masks.filter(m=>m.y1>=y0&&m.y0<=y2);
  let total=0;
  for(const x of xs){
    const a=cam.project(x+FENCE_HALF_X*0.85,1,d,px).x,b=cam.project(x-FENCE_HALF_X*0.85,1,d,px).x;
    const xa=Math.max(0,Math.round(Math.min(a,b))),xb=Math.min(width-1,Math.round(Math.max(a,b)));
    let inD=0,inN=0,bD=0,bN=0;
    for(let x2=xa;x2<=xb;x2++)for(let y=y0;y<=y2;y++){
      if(rm.some(m=>x2>=m.x0&&x2<=m.x1&&y>=m.y0&&y<=m.y1))continue;
      const k=(y*width+x2)*C,dk=isDark(data[k],data[k+1],data[k+2]);
      if(y<=y1){inN++;if(dk)inD++;}else{bN++;if(dk)bD++;}
    }
    if(inN<6||bN<3)return null;
    total+=inD/inN-1.5*bD/bN;
  }
  return total/xs.length;
}
function scoreAgainst(p,fenceXs){
  const inF=new Uint8Array(p.frac.length);
  for(const x of fenceXs){const [a,b]=span(p,x);for(let i=Math.max(0,a);i<=Math.min(p.frac.length-1,b);i++)inF[i]=1;}
  let si=0,ni=0,so=0,no=0;
  for(let i=0;i<p.frac.length;i++){if(!p.valid[i])continue;if(inF[i]){si+=p.frac[i];ni++;}else{so+=p.frac[i];no++;}}
  if(ni+no<6)return null;
  return (ni?si/ni:0)-(no?so/no:0)*(fenceXs.length?1:0.6)-(fenceXs.length?0:0.02);
}

// Mystery boxes (5% of the 3300-3780 rows) sit 15 m after their row in a
// random lane; collecting one opens a puzzle worth 200 points. The game pauses
// until the puzzle's continue click, and the clock is shifted by that pause
// from the page's timestamps (resumeExact). boxes:'collect' (default) plans
// through confirmed boxes; boxes:'avoid' treats them as obstacles (the old
// behaviour, from before the exact pause timing).
// Confirmation: votes in 12 of the last 14 frames. In 30 recorded batch runs real
// boxes were seen on every frame from ~59 m, while false hits (navy roadside
// banners at range, the runner close up) came in bursts of at most 10 frames.
// In a live game (i-012) the box was missed at 55-59 m (a few pixels) and for 2
// frames behind a fence. The rule confirmed all 19 batch boxes (31.6-36.7 m)
// and the live one (29.9 m), and none of the false ones (analysis/box-replay.mjs,
// box-live-votes.mjs).
// A box is worth 100 to the planner (not its 200 points). Beside a sliding
// fence a pass costs 400 * (1 - clear/0.6) for clearance under 0.6 m beyond the
// 0.3 m hard margin, so a box never buys a pass closer than 0.3 + 0.45 = 0.75 m
// to a slider's predicted edge (its prediction error is at most 0.44 m).
const BOX_CONFIRM_VOTES=12,BOX_CONFIRM_WINDOW=14,BOX_VALUE=100,BOX_RADIUS=1.0;
// The puzzle pause clears the queued keys, and steering resumes only after the
// puzzle closes (0.48 s after the continue click in live game i-018, whose runner
// then hit the next row's fence, 15 m past the box, in the box lane). So a route
// that collects a box must keep its lane for 30 m past it (0.6 s at 50 m/s): a
// box whose next row blocks its lane is not taken.
const BOX_HOLD_AFTER=30;
// After a box's puzzle pause, until the lane rows have re-measured the clock.
const POST_PAUSE_MARGIN=3.5;
// One frame's votes ([0|1] per lane) for box b; sets b.lane once a lane is
// confirmed (sticky) and returns it.
export function confirmBox(b,bits,d=null){
  b.hist??=[[],[],[]];
  for(let l=0;l<3;l++){const h=b.hist[l];h.push(bits[l]);if(h.length>BOX_CONFIRM_WINDOW)h.shift();
    if(b.lane==null&&h.reduce((a,v)=>a+v,0)>=BOX_CONFIRM_VOTES){b.lane=l;b.confirmedAt=d==null?null:+d.toFixed(1);}}
  return b.lane??null;
}
const isBoxBlue=(r,g,b)=>r<70&&b>55&&b<180&&b-r>40&&g>20&&g<140&&b>=g;
function boxScore(frame,d,px,lane){
  const {data,width,height}=frame,C=data.length/(width*height);
  const a=cam.project(LANE_X[lane]+0.6,2.1,d,px),b=cam.project(LANE_X[lane]-0.6,0.9,d,px);
  const x0=Math.max(0,Math.round(Math.min(a.x,b.x))),x1=Math.min(width-1,Math.round(Math.max(a.x,b.x)));
  const y0=Math.max(0,Math.round(Math.min(a.y,b.y))),y1=Math.min(height-1,Math.round(Math.max(a.y,b.y)));
  let n=0,blue=0;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){n++;const k=(y*width+x)*C;if(isBoxBlue(data[k],data[k+1],data[k+2]))blue++;}
  return n>=6?blue/n:null;
}
const laneXAt=(st,t)=>{if(!st.tween)return LANES[st.target];const s=Math.min((t-st.tween.start)/st.tween.d,1);
  return s<0?st.tween.from:st.tween.from+(st.tween.to-st.tween.from)*(1-Math.pow(1-s,3));};
class Row{
  constructor(z,kind,{zFixed=false,lanes=null,lo=null,hi=null}={}){
    Object.assign(this,{z,kind,zFixed,lanes,lo,hi});
    this.moving=isMoving(z);this.zSamples=[];this.zAll=[];this.zCoarse=[];this.frames=0;
    // Near a sliding-range boundary the row may slide or not: keep both kinds.
    this.mixed=kind!=='lane'&&(zFixed?straddlesMovingEdge(z-2,z+2):straddlesMovingEdge((lo??z)-1,(hi??z)+1));
    if(this.mixed)this.moving=true;
    this.hyps=this.makeHypotheses();
  }
  makeHypotheses(){
    const out=[];
    const still=!isMoving(this.z)||this.mixed,slides=isMoving(this.z)||this.mixed;
    if(this.kind==='dense'){
      if(still)out.push({slots:this.lanes.map(l=>({x0:LANE_X[l],dir:0,fence:true})),score:0});
      if(slides)for(const dir of [-1,1])for(let mask=0;mask<1<<this.lanes.length;mask++)
        out.push({slots:this.lanes.map((l,i)=>({x0:LANE_X[l],dir,fence:!!(mask&(1<<i))})),score:0});
    }else{
      if(slides)for(const [x0,dir] of [[-2.75,1],[0,1],[0,-1],[2.75,-1]])out.push({slots:[{x0,dir,fence:true}],score:0});
      if(still)for(const x0 of LANE_X)out.push({slots:[{x0,dir:0,fence:true}],score:0});
    }
    return out;
  }
  slotX(s,T){return s.fence&&s.dir?slideX(s.x0,s.dir,Math.max(0,T-timeAtDistance(this.z-SPAWN_AHEAD))):s.x0;}
  fenceXs(h,T){return h.slots.filter(s=>s.fence).map(s=>this.slotX(s,T));}
  best(){return this.hyps.reduce((a,b)=>b.score>a.score?b:a);}
  plausible(tol=0.6){const b=this.best().score;return this.hyps.filter(h=>h.score>=b-tol);}
  // Obstacles at the moment the runner reaches the row.
  passing(){
    const T=timeAtDistance(this.z),pl=this.hyps.length===1?this.hyps:this.plausible();
    const fences=[],soft=[];
    for(const h of pl)for(const s of h.slots){const x=this.slotX(s,T);(s.fence?fences:soft).push(x);}
    const uniq=a=>[...new Set(a.map(x=>Math.round(x*10)/10))];
    const fx=uniq(fences),sx=uniq(soft).filter(x=>!fx.some(f=>Math.abs(f-x)<0.3));
    const ref=pl.map(h=>this.fenceXs(h,T).sort((a,b)=>a-b).join(','));
    const confident=this.hyps.length===1||this.frames>=3&&new Set(ref).size===1;
    // Fences of the single most likely explanation (fatal even in fallbacks).
    const best=this.fenceXs(this.best(),T).map(x=>Math.round(x*10)/10);
    return {fences:fx,soft:sx,confident,best};
  }
}

export class EndgameV3{
  constructor({margin=2,horizon=60,width=120,decisionEvery=2,boundaryBand=3,lagPrior=null,boxes='collect'}={}){
    Object.assign(this,{margin,horizon,width,decisionEvery,boundaryBand,lagPrior,boxMode:boxes});
    this.phase=null;this.active=false;this.state=null;
    this.rows=laneFenceRows().map(z=>new Row(z,'lane',{zFixed:true}));
    // The first sparse row follows the lane rows exactly (3780 + 30 m).
    const first=new Row(3810,'sparse',{zFixed:true,lo:3810,hi:3810});this.rows.push(first);
    this.chain={prev:first,pending:null,done:false};
    this.denseStart=null;this.denseResiduals=[];this.denseAlt=null;this.denseLog=[];
    this.boxes=new Map();
    this.coins=new CoinTracker();this.footBias=[];this.zNow=null;this.zOffset=0;this.laneResiduals=[];
    this.keyHistory=[];this.runnerObs=[];this.lagMs=null;this.clockFixes=[];
  }
  zAt(ms){return this.phase==null?null:distanceAtTime((ms-this.phase)/1000);}
  arrival(z){return this.phase+timeAtDistance(z)*1000;}
  gameTime(ms){return (ms-this.phase)/1000;}
  stateAt(ms){
    const s=this.state;if(!s.tween)return {target:s.target,tween:null};
    const t=(ms-s.tween.startMs)/1000,d=s.tween.durMs/1000;
    if(t>=d)return {target:s.target,tween:null};
    return {target:s.target,tween:{from:s.tween.from,to:s.tween.to,t:Math.max(0,t),d}};
  }
  playerX(ms){return xAt(this.stateAt(ms));}
  takeOver(nowMs,lane){this.active=true;this.state={target:lane,tween:null};this.takenAt=nowMs;this.startLane=lane;}
  // Control returns after someone else steered: restart the lane timeline from
  // the lane seen on screen. Course, clock and lag estimates are kept.
  rebaseLane(nowMs,lane){
    this.state={target:lane,tween:null};this.startLane=lane;this.keyHistory=[];this.runnerObs=[];
    this._timeline=null;this.keySnapshot=null;(this.rebases??=[]).push({at:nowMs,z:+this.zAt(nowMs).toFixed(1),lane});
    // A move the player started just before can still be invisible (screenshot
    // lag): check the lane model against the lane lines for a while.
    this.verify={until:nowMs+600,miss:0};
  }
  // The runner is seen at x, away from the lane model: settled in another lane,
  // or moving to the next lane in that direction.
  correctLane(atMs,x){
    const near=LANES.reduce((b,v,i)=>Math.abs(v-x)<Math.abs(LANES[b]-x)?i:b,0);
    const dir=Math.sign(x-xAt(this.stateAt(atMs))),dest=dir>0?LANES.findIndex(v=>v>=x):LANES.findLastIndex(v=>v<=x);
    if(Math.abs(x-LANES[near])<0.35||dest<0)this.state={target:near,tween:null};
    else{
      this.state={target:dest,tween:{from:x,to:LANES[dest],startMs:atMs,durMs:laneDuration(speedAt(this.zAt(atMs)))*1000*Math.abs(LANES[dest]-x)/2.75}};
    }
    this.startLane=this.state.target;this.keyHistory=[];this.runnerObs=[];this._timeline=null;this.keySnapshot=null;
    this.laneCorrected=true;this.verify={until:atMs+600,miss:0};
    (this.laneCorrections??=[]).push({at:atMs,z:+this.zAt(atMs).toFixed(1),x:+x.toFixed(2),target:this.state.target,moving:!!this.state.tween});
  }
  // Lane position implied by the keys' effect times (for measuring screenshot lag).
  // The lane timeline is rebuilt only when a key is added; lookups are binary searches
  // (estimateLag evaluates thousands of positions, and the key history keeps growing).
  laneTimeline(){
    const kh=this.keyHistory,tl=this._timeline;
    if(tl&&tl.n===kh.length&&tl.last===kh.at(-1)&&tl.startLane===this.startLane)return tl;
    const segs=[];let st={target:this.startLane,tween:null};
    for(const k of kh){const x=laneXAt(st,k.t);const tg=k.key==='L'?Math.min(2,st.target+1):Math.max(0,st.target-1);
      if(tg!==st.target){st={target:tg,tween:{from:x,to:LANES[tg],start:k.t,d:k.d}};segs.push({t:k.t,st});}}
    return this._timeline={n:kh.length,last:kh.at(-1),startLane:this.startLane,segs};
  }
  modelX(t){
    const {segs}=this.laneTimeline();let lo=0,hi=segs.length-1,i=-1;
    while(lo<=hi){const m=(lo+hi)>>1;if(segs[m].t<=t){i=m;lo=m+1;}else hi=m-1;}
    return laneXAt(i<0?{target:this.startLane,tween:null}:segs[i].st,t);
  }
  estimateLag(){
    const mv=this.runnerObs.filter(o=>this.keyHistory.some(k=>o.t-k.t>-40&&o.t-k.t<k.d+120));
    if(mv.length<12)return;
    let best=null;
    for(let L=-20;L<=140;L+=5){let e=0;for(const o of mv)e+=Math.min(Math.abs(this.modelX(o.t-L)-o.x),3)**2;if(!best||e<best.e)best={L,e};}
    this.lagMs=best.L;this.lagN=mv.length;
  }
  // Clock error (m, positive = clock behind) from lane-row feet and the lag:
  // residual r = v*lag - e - 0.3 for a correct foot model.
  correctClock(zNow){
    // Until our own keys have measured the lag, an optional prior stands in.
    const lag=this.lagMs??this.lagPrior;
    if(lag==null||this.laneResiduals.length<8)return;
    // r = clock distance - content distance = v*lag - e  =>  e = v*lag - r
    const v=speedAt(zNow),r=median(this.laneResiduals),e=v*lag/1000-r;this.lastE={e,r,lag};
    // First measurement after a box pause: the clock error the lane rows found.
    if(this.wideMarginUntil!=null)(this.pauseChecks??=[]).push({z:+zNow.toFixed(1),e:+e.toFixed(2),r:+r.toFixed(2),n:this.laneResiduals.length});
    this.wideMarginUntil=null;      // the clock has been measured since the last pause
    if(Math.abs(e)<0.5&&this.clockFixes.length)return;
    const step=Math.max(-6,Math.min(6,e));
    this.phase-=step/v*1000;this.zOffset-=step;
    if(this.state?.tween){}         // lane state is in wall-clock time; unaffected
    this.clockFixes.push({z:+zNow.toFixed(1),e:+e.toFixed(2),r:+r.toFixed(2),lag,n:this.laneResiduals.length});
    this.laneResiduals=[];
  }
  applyKey(key,ms){
    const st=this.stateAt(ms),x=xAt(st);
    const target=key==='L'?Math.min(2,st.target+1):Math.max(0,st.target-1);
    if(target===st.target)return;
    this.state={target,tween:{from:x,to:LANES[target],startMs:ms,durMs:laneDuration(speedAt(this.zAt(ms)))*1000}};
  }
  // Keys are applied to the lane state when sent, then re-timed on the browser's
  // acknowledgement (the game handles a key shortly before that ack returns).
  beginKeys(keys,sentMs){this.keySnapshot=JSON.parse(JSON.stringify(this.state));for(const k of keys)this.applyKey(k,sentMs);}
  confirmKeys(keys,doneMs){
    if(!this.keySnapshot)return;this.state=this.keySnapshot;this.keySnapshot=null;
    keys.forEach((k,i)=>{const t=Math.max(doneMs[i]-3,(doneMs[i-1]??0));this.applyKey(k,t);
      this.keyHistory.push({key:k,t,d:laneDuration(speedAt(this.zAt(t)))*1000});});
    this.ackLag=(this.ackLag??10)*0.8+0.2*(doneMs.at(-1)-doneMs[0]+3);
  }
  pause(now=Date.now()){this.pausedAt=now;}
  // Exact pause from page timestamps (challenge screen shown / continue clicked);
  // the pause began when the box was reached (its row + 15 m).
  resumeExact(pauseAt,resumeAt){
    const zSeen=this.zAt(pauseAt);
    const boxRow=this.rows.filter(r=>r.kind==='lane'&&Math.abs(r.z+15-zSeen)<6).sort((a,b)=>Math.abs(a.z+15-zSeen)-Math.abs(b.z+15-zSeen))[0];
    const collectMs=boxRow?this.arrival(boxRow.z+15-1.7):pauseAt;
    const shift=Math.max(0,resumeAt-Math.min(collectMs,pauseAt));
    this.phase+=shift;if(this.state?.tween)this.state.tween.startMs+=shift;
    for(const k of this.keyHistory)if(k.t>pauseAt)k.t+=0;     // keys are not sent while paused
    this.lastPause={pauseAt,collectMs,resumeAt,shift,boxZ:boxRow?boxRow.z+15:null};
    this.markCollected(boxRow);
  }
  // The box that paused the game is gone; do not plan for it again. The clock
  // shift after a pause can be off by a metre or two (the frame the game saw the
  // box, the puzzle screen's render): restart the lane-row distance residuals so
  // that correctClock() measures the new clock from the next 8 of them.
  // Until then, plan with a wider distance margin (POST_PAUSE_MARGIN, at most
  // 60 m past the box).
  markCollected(boxRow){const b=boxRow&&this.boxes.get(boxRow.z+15);if(b)b.collected=true;this.laneResiduals=[];
    if(boxRow)this.wideMarginUntil=boxRow.z+15+60;}
  // A mystery box (row z + 15 m in the 3300-3780 section) pauses the game until
  // the continue click; shift the clock by that pause.
  resume(resumeMs){
    const zSeen=this.zAt(this.pausedAt);
    const boxRow=this.rows.filter(r=>r.kind==='lane'&&r.z+15<zSeen+2).at(-1);
    const collectMs=boxRow?this.arrival(boxRow.z+15-1.7):this.pausedAt-60;
    const shift=Math.max(0,resumeMs-Math.min(collectMs,this.pausedAt));
    this.phase+=shift;if(this.state?.tween)this.state.tween.startMs+=shift;
    this.lastPause={pausedAt:this.pausedAt,collectMs,resumeMs,shift,boxZ:boxRow?boxRow.z+15:null};
    this.markCollected(boxRow);
  }
  bias(){return -0.3;}

  // Sparse rows follow each other at 40-60 m; the first row at or past 4300 m
  // is the first dense row (two fences in lanes 0 and 2, fixed pattern after).
  nextBounds(){const p=this.chain.prev,u=this.unc(p);return {lo:p.z-u+40,hi:p.z+u+60};}
  discover(frame,zFrame,px,allMasks){
    const ch=this.chain;if(ch.done)return;
    const {lo,hi}=this.nextBounds();
    if(!ch.pending){if(lo-zFrame>60)return;
      ch.pending=new Row((lo+hi)/2,'sparse',{lo,hi});ch.pending.denseVotes=0;this.rows.push(ch.pending);}
    const row=ch.pending;row.lo=lo;row.hi=hi;
    // The row's own predicted band must not hide the fence being searched for.
    const masks=allMasks.filter(m=>m.row!==row);
    const dLo=lo-zFrame,dHi=hi-zFrame;
    const maybeDense=hi>=SPARSE_END;
    const T=timeAtDistance(zFrame);
    // Candidate lateral positions: lanes for static rows; the slide hypotheses
    // (at this moment) for sliding rows.
    const xsFor=zc=>{const r=isMoving(zc)||row.mixed;if(!r)return LANE_X;const ts=timeAtDistance(zc-SPAWN_AHEAD);
      const sl=[[-2.75,1],[0,1],[0,-1],[2.75,-1]].map(([x0,dr])=>slideX(x0,dr,Math.max(0,T-ts)));
      return row.mixed?[...LANE_X,...sl]:sl;};
    if(dLo<=45&&dHi>=6){
      // Near: joint search over distance and lateral position on the sharp contact score.
      let best=null;
      for(let d=Math.max(8,dLo-1);d<=Math.min(45,dHi+1);d+=0.5){
        const zc=zFrame+d;
        for(const x of xsFor(zc)){const v=contactScore(frame,d,px,masks,[x]);if(v!=null&&(!best||v>best.v))best={v,zc,x,dense:false};}
        if(zc>=SPARSE_END){const v=contactScore(frame,d,px,masks,[-2.75,2.75]);if(v!=null&&v>(best?.v??-9)-0.02&&v>0.15)best={v,zc,x:null,dense:true};}
      }
      if(best&&best.v>0.12){row.zAll.push(best.zc);if(best.dense)row.denseVotes++;
        // Largest cluster of contact estimates; on a tie, the one that agrees with
        // the far (band) estimate (stray contacts come from coins and shadows).
        const cm=row.zCoarse.length?median(row.zCoarse.slice(-8)):null;
        const weight=c=>c.length+(cm!=null&&Math.abs(median(c)-cm)<4?0.5:0);
        let cl=[];for(const v of row.zAll){const c=row.zAll.filter(w=>Math.abs(w-v)<1.2);if(weight(c)>weight(cl))cl=c;}
        row.zSamples=cl.length>=2?cl:[];if(cl.length>=2)row.z=median(cl);}
    }
    if(!row.zSamples.length&&dLo<=60){
      // Far: rough distance from the fence band (wide uncertainty until near).
      let best=null;
      for(let zc=Math.max(lo,zFrame+20);zc<=Math.min(hi,zFrame+60);zc+=1){
        const p=bandProfile(frame,zc-zFrame,px,masks);
        for(const x of xsFor(zc)){const v=scoreAgainst(p,[x]);if(v!=null&&(!best||v>best.v))best={v,zc};}}
      if(best&&best.v>0.1){row.zCoarse.push(best.zc);row.z=median(row.zCoarse.slice(-8));}
    }
    // If the far (band) and near (contact) estimates disagree, cover both.
    if(row.zSamples.length>=2&&row.zCoarse.length>=1){
      const a=median(row.zSamples),b=median(row.zCoarse.slice(-8));
      if(Math.abs(a-b)>4){row.z=(a+b)/2;row.zSpread=Math.abs(a-b)/2;}else{row.z=a;row.zSpread=0;}
    }
    row.z=Math.min(Math.max(row.z,lo-1),hi+1);
    // Settle with consistent samples, or in any case once the row is being passed.
    const settled=row.zSamples.length>=3||(row.zSamples.length>=2&&row.z-zFrame<14)||row.z-zFrame<4;
    if(ch.boundary){
      // The row 40-60 m after a boundary row: a fence here means the boundary row
      // was the last sparse one and this is the first dense row. With no contact
      // once the whole window has been in range, the boundary row starts the pattern.
      const absent=row.zSamples.length<2&&zFrame>=hi-30;
      if(!settled&&!absent)return;
      this.rows.splice(this.rows.indexOf(row),1);ch.done=true;ch.pending=null;
      const found=row.zSamples.length>=2;
      this.denseLog.push({ev:found?'next':'none',z:+row.z.toFixed(1),zFrame:+zFrame.toFixed(1)});
      if(found)this.startAlt(row.z,this.unc(row));
      return;
    }
    // Near 4300 m the boundary row may be the last sparse fence or the first dense
    // row (the estimate is good to ~2 m, and one dense fence may be a cone). Start
    // the pattern on it but keep searching 40-60 m on (see above). A single fence in
    // the middle lane is sparse (the first dense row uses the outer lanes).
    if(maybeDense&&settled&&Math.abs(row.z-SPARSE_END)<this.boundaryBand){
      const p=row.passing(),middle=p.confident&&p.fences.length===1&&p.fences[0]===0;
      this.denseLog.push({ev:middle?'boundary-middle':'boundary',z:+row.z.toFixed(1),zFrame:+zFrame.toFixed(1)});
      if(middle){ch.prev=row;ch.pending=null;return;}
      this.rows.splice(this.rows.indexOf(row),1);
      this.startDense(row.z);this.denseUnc=8;this.denseAlign={z0:row.z,samples:[]};
      ch.boundary={z:row.z};ch.prev=row;ch.pending=null;return;
    }
    if(maybeDense&&settled&&(row.z>=SPARSE_END||row.denseVotes>=2)&&row.z>=SPARSE_END-1){
      this.rows.splice(this.rows.indexOf(row),1);
      this.startDense(row.z);this.denseUnc=8;this.denseAlign={z0:row.z,samples:[]};ch.done=true;ch.pending=null;return;
    }
    if(!settled)return;
    ch.prev=row;ch.pending=null;
  }
  // Sparse rows only need the lane and an approximate distance: they are single
  // fences 40-60 m apart, so a wide distance band costs little.
  unc(row){return row.zFixed?0:(row.zSamples.length>=2?5:8)+(row.zSpread??0);}
  startDense(z0){
    this.denseStart=z0;this.pendingDense=null;
    for(const r of denseRows(z0)){const w=new Row(r.z,'dense',{zFixed:true,lanes:r.lanes});w.index=r.index;this.rows.push(w);}
  }
  // Second dense pattern anchored on the fence found 40-60 m after a boundary
  // row. Both patterns are planned around until contact evidence at their next
  // rows (index >= 1) shows which one is real.
  startAlt(z0,unc){
    this.denseAlt={start:z0,unc:Math.max(2,unc),ev:new Map()};
    for(const r of denseRows(z0)){const w=new Row(r.z,'dense',{zFixed:true,lanes:r.lanes});w.index=r.index;w.alt=true;this.rows.push(w);}
  }
  // Contact search within +-5 m of each pattern's upcoming rows, on each of the
  // row's lanes. A row is seen with a cluster of 3 consistent contacts; missing
  // after 8 probed frames with at most one. In the recorded runs empty road
  // 18-40 m from a real row gives at most one by then, and real rows give 3+.
  resolveDense(frame,zFrame,px,allMasks){
    const alt=this.denseAlt;if(!alt)return;
    // A pattern's own rows are not masked when probing it; the other pattern's
    // nearer rows are (a real fence's top bar reads as a contact 13-16 m behind it).
    const own=alt=>allMasks.filter(m=>!(m.row?.kind==='dense'&&!!m.row.alt===alt)),masks={A:own(false),B:own(true)};
    const cluster=s=>{let cl=[];for(const v of s){const c=s.filter(w=>Math.abs(w-v)<1.2);if(c.length>cl.length)cl=c;}return cl;};
    for(const row of this.rows){
      if(row.kind!=='dense'||!(row.index>=1))continue;
      const d=row.z-zFrame;if(d<8||d>45)continue;
      const e=alt.ev.get(row)??{seen:0,samples:[]};alt.ev.set(row,e);if(e.verdict)continue;
      let best=null,valid=false;
      for(let dd=Math.max(8,d-5);dd<=Math.min(48,d+5);dd+=0.5)for(const l of row.lanes){
        const v=contactScore(frame,dd,px,masks[row.alt?'B':'A'],[LANE_X[l]]);if(v==null)continue;valid=true;if(!best||v>best.v)best={v,z:zFrame+dd};}
      if(valid)e.seen++;if(best&&best.v>0.12)e.samples.push(best.z);
      const cl=cluster(e.samples);
      if(cl.length>=3){e.verdict='seen';e.delta=median(cl)-row.z;}else if(e.seen>=8&&cl.length<=1)e.verdict='missing';
    }
    const tally={A:{s:0,c:0},B:{s:0,c:0}};
    for(const [row,e] of alt.ev){const t=tally[row.alt?'B':'A'];if(e.verdict==='seen'){t.s++;t.c++;}else if(e.verdict==='missing')t.s--;}
    if(tally.A.s-tally.B.s>=2&&tally.A.c)this.keepDense('A',zFrame);
    else if(tally.B.s-tally.A.s>=2&&tally.B.c)this.keepDense('B',zFrame);
  }
  keepDense(side,zFrame){
    const alt=this.denseAlt;this.denseAlt=null;
    const ev=[...alt.ev].map(([r,e])=>`${r.alt?'B':'A'}${r.index}@${r.z.toFixed(1)}:${e.verdict??'-'}${e.seen}/${e.samples.length}`);
    this.rows=this.rows.filter(r=>r.kind!=='dense'||!!r.alt===(side==='B'));
    if(side==='B'){
      // Align the pattern on its seen rows' contacts; the boundary row's pattern
      // and its residuals are gone.
      const deltas=[...alt.ev].filter(([r,e])=>r.alt&&e.verdict==='seen').map(([,e])=>e.delta),delta=median(deltas);
      for(const r of this.rows)if(r.kind==='dense'){r.z+=delta;r.alt=false;}
      this.denseStart=alt.start+delta;this.denseShift=delta;this.denseUnc=1.5;
      this.denseResiduals=[];this.denseAlign=null;this.denseRefinePending=false;
    }
    this.denseLog.push({ev:'keep',side,zFrame:+zFrame.toFixed(1),denseStart:+this.denseStart.toFixed(1),rows:ev});
  }
  // Align the dense pattern on its first row: search +-8 m with the contact
  // score on either outer lane (one of the two may be a cone or hurdle).
  alignDense(frame,zFrame,px,allMasks){
    const al=this.denseAlign;if(!al)return;
    const first=this.rows.find(r=>r.kind==='dense'&&Math.abs(r.z-(this.denseStart))<0.01);
    const masks=allMasks.filter(m=>m.row!==first);
    const dC=this.denseStart-zFrame;
    if(dC>48)return;
    if(dC<4){this.denseAlign=null;this.denseUnc=al.samples.length>=2?2:4;this.denseRefinePending=true;return;}
    let best=null;
    for(let d=Math.max(8,dC-8);d<=Math.min(48,dC+8);d+=0.5)for(const x of [-2.75,2.75]){
      const v=contactScore(frame,d,px,masks,[x]);if(v!=null&&v>0.12&&(!best||v>best.v))best={v,z:zFrame+d};}
    if(best)al.samples.push(best.z);
    let cl=[];for(const v of al.samples){const c=al.samples.filter(w=>Math.abs(w-v)<1.2);if(c.length>cl.length)cl=c;}
    if(cl.length>=3){const delta=median(cl)-this.denseStart;
      for(const r of this.rows)if(r.kind==='dense'&&!r.alt)r.z+=delta;this.denseStart+=delta;this.denseShift=(this.denseShift||0)+delta;
      this.denseAlign=null;this.denseUnc=1.5;this.denseRefinePending=false;}
  }
  // Keep the dense rows aligned with their observed post feet.
  refineDense(){
    if(this.denseRefinePending&&this.denseResiduals.length>=4){
      // First correction from the first dense row's feet, then normal tracking.
      const delta=median(this.denseResiduals);this.denseResiduals=[];
      for(const r of this.rows)if(r.kind==='dense'&&!r.alt)r.z+=delta;this.denseStart+=delta;
      this.denseShift=(this.denseShift||0)+delta;this.denseUnc=0.6;this.denseRefinePending=false;return;
    }
    if(this.denseResiduals.length<10)return;
    const delta=median(this.denseResiduals);this.denseResiduals=[];
    if(Math.abs(delta)<0.4)return;
    const step=Math.max(-1.5,Math.min(1.5,delta*0.6));
    for(const r of this.rows)if(r.kind==='dense'&&!r.alt)r.z+=step;
    this.denseStart+=step;this.denseShift=(this.denseShift||0)+step;
  }
  obstacles(zNow){
    const out=[];
    for(const row of this.rows){
      if(row.z<zNow-4||row.z>zNow+this.horizon+6)continue;
      if(!(row.zFixed||row.zCoarse.length||row.zSamples.length))continue;
      const p=row.passing();
      if(!p.confident&&row.z-zNow>40)continue;
      const zUnc=row.kind==='dense'?(row.alt?this.denseAlt.unc:this.denseUnc??0):this.unc(row);
      // Sliding fences: measured prediction error is about 0.2 m (worst 0.44 m),
      // so keep 0.3 m hard clearance and discourage passes under 0.6 m.
      const sliding=row.moving;
      for(const x of p.fences)out.push({z:row.z,x,halfX:FENCE_HALF_X+(sliding?0.3:p.confident?0.12:0.25),halfZ:FENCE_HALF_Z+zUnc,cost:Infinity,
        confident:p.confident,best:p.best.some(b=>Math.abs(b-x)<0.06),sliding,softClear:sliding?0.6:0.3,softCost:sliding?400:150});
      for(const x of p.soft)out.push({z:row.z,x,halfX:NONFENCE_HALF_X,halfZ:0.6+zUnc,cost:NONFENCE_COST,confident:p.confident});
    }
    if(this.boxMode==='avoid')for(const [zb,b] of this.boxes){if(zb<zNow-4||zb>zNow+this.horizon+6)continue;
      for(let l=0;l<3;l++)if(b.votes[l]>=3&&b.votes[l]>=0.4*b.n)out.push({z:zb,x:LANE_X[l],halfX:1.25,halfZ:1.3,cost:3000,confident:true,box:true});}
    return out;
  }
  // Confirmed boxes ahead, as planner rewards ({lane, z, value} like coins).
  boxTargets(zNow){
    if(this.boxMode!=='collect')return [];
    return [...this.boxes].filter(([zb,b])=>b.lane!=null&&!b.collected&&zb>zNow-2&&zb<zNow+this.horizon+6)
      .map(([zb,b])=>({lane:b.lane,z:zb,value:BOX_VALUE,radius:BOX_RADIUS,box:true,holdAfter:BOX_HOLD_AFTER}));
  }
  // A confirmed box is close: the page should be read every frame, so that its
  // puzzle pause is seen at once.
  boxNear(z){return this.boxMode==='collect'&&[...this.boxes].some(([zb,b])=>b.lane!=null&&!b.collected&&zb>z-5&&zb<z+40);}
  limitZ(){
    const ch=this.chain;if(ch.done)return FORCE_END-3;
    // A detected pending row is planned around; the row after it is at least
    // 40 m further. Before detection, stop at the earliest possible position.
    if(ch.pending&&(ch.pending.zCoarse.length||ch.pending.zSamples.length))return ch.pending.z-this.unc(ch.pending)+40-3;
    return this.nextBounds().lo-3;
  }

  update(frame,opts){this.perceive(frame,opts);return this.plan(opts.nowMs);}
  // shadow: someone else is steering, so the runner's x comes only from the
  // screen (last seen x when the lane lines are unreadable), not from our keys.
  perceive(frame,{captureMs,playerXOverride=null,stateOverride=null,shadow=false}){
    if(stateOverride)this.state=stateOverride;
    this.frameMs=captureMs;
    // Screenshot content and the clock can disagree by a constant (frame lag or
    // anchor error); fixed-distance lane rows measure that offset in metres.
    const zRaw=this.zAt(captureMs),zFrame=zRaw+this.zOffset,T=timeAtDistance(zFrame);
    // The camera follows the runner, so the projection needs the runner's x at the
    // moment the frame was drawn: measure it from the lane lines, or replay the
    // key history to that moment.
    const contentMs=this.arrival(zFrame);
    const measured=playerXOverride==null?measureRunnerX(frame):null;
    const seen=measured&&measured.err<3;if(seen)this.seenPx=measured.x;this.lastMeasured=seen?measured:null;
    const px=playerXOverride??(seen?measured.x:shadow?this.seenPx??LANES[this.state.target]:this.keyHistory.length?this.modelX(contentMs):this.playerX(contentMs));
    this.pxSource=playerXOverride!=null?'override':seen?'lines':shadow?'seen':'model';
    // Checked only while our model has the runner standing in a lane: during our
    // own lane changes the screenshot trails the model.
    if(this.verify&&!shadow){
      const ownMove=this.keyHistory.some(k=>k.t<=contentMs+50&&k.t+k.d+100>=contentMs);
      if(captureMs>this.verify.until)this.verify=null;
      else if(seen&&!ownMove&&!this.stateAt(contentMs).tween){
        const mx=this.keyHistory.length?this.modelX(contentMs):this.playerX(contentMs);
        if(Math.abs(measured.x-mx)>0.7){if(++this.verify.miss>=2)this.correctLane(captureMs,measured.x);}else this.verify.miss=0;
      }
    }
    const masks=[];
    {const a=cam.project(px-0.7,0,0,px),b=cam.project(px+0.7,2.9,0,px);masks.push({x0:Math.min(a.x,b.x)-4,x1:Math.max(a.x,b.x)+4,y0:b.y-8,y1:frame.height});}
    // Rows whose distance is not yet detected are not scored (their band is unknown).
    const located=r=>r.zFixed||r.zCoarse.length||r.zSamples.length;
    const visible=this.rows.filter(r=>located(r)&&r.z-zFrame>=6&&r.z-zFrame<=70).sort((a,b)=>a.z-b.z);
    for(const row of visible){
      const d=row.z-zFrame,p=bandProfile(frame,d,px,masks);
      if(row.hyps.length>1){
        let any=false;for(const h of row.hyps){const s=scoreAgainst(p,row.fenceXs(h,T));if(s!=null){h.score+=s;any=true;}}
        if(any)row.frames++;
      }
      const h=row.best(),xs=row.fenceXs(h,T);
      // Distance residual from the ground-contact score (nearer rows masked, not
      // this one): lane rows calibrate the clock, dense rows their alignment.
      const firstLane=row.kind==='lane'&&row.z===3300;
      const conf=row.passing().confident;
      if((d<30||firstLane&&d<55)&&(row.kind==='lane'&&(conf||firstLane)||row.kind==='dense'&&!row.alt&&conf)){
        for(const x of xs){let best=null;
          for(let dd=-4;dd<=4;dd+=0.25){const v=contactScore(frame,d+dd,px,masks,[x]);if(v!=null&&(!best||v>best.v))best={v,dd};}
          if(best&&best.v>0.12&&Math.abs(best.dd)<3.9){
            if(row.kind==='lane'){this.footBias.push(best.dd);if(this.footBias.length>80)this.footBias.shift();
              this.laneResiduals.push(best.dd-this.zOffset);if(this.laneResiduals.length>80)this.laneResiduals.shift();}
            else this.denseResiduals.push(best.dd);
          }}
      }
      for(const x of xs){const [a,b]=span(p,x);masks.push({x0:p.left+a,x1:p.left+b,y0:p.y0-4,y1:p.y1+4,row});}
    }
    // Perception offset: content distance = clock distance + zOffset.
    if(this.laneResiduals.length>=8)this.zOffset=Math.max(-8,Math.min(8,-median(this.laneResiduals)));
    // Runner position only matters around key presses (lag estimation).
    const recentKey=this.keyHistory.length&&captureMs-this.keyHistory.at(-1).t<500;
    const rx=recentKey&&!shadow?measured:null;if(rx&&rx.err<3){this.runnerObs.push({t:captureMs,x:rx.x});if(this.runnerObs.length>400)this.runnerObs.shift();}
    if((this.frameCount=(this.frameCount||0)+1)%8===0)this.estimateLag();
    this.correctClock(zRaw);
    for(const row of this.rows){if(row.kind!=='lane')continue;const zb=row.z+15,d=zb-zFrame;if(d<8||d>60)continue;
      const b=this.boxes.get(zb)??{votes:[0,0,0],n:0,lane:null};b.n++;
      const bits=[0,1,2].map(l=>{const v=boxScore(frame,d,px,l);return v!=null&&v>0.22?1:0;});
      for(let l=0;l<3;l++)b.votes[l]+=bits[l];
      confirmBox(b,bits,d);this.boxes.set(zb,b);}
    this.discover(frame,zFrame,px,masks);this.alignDense(frame,zFrame,px,masks);this.resolveDense(frame,zFrame,px,masks);this.refineDense();
    const zNowP=this.zAt(Date.now());
    const det=detectCoins(frame,{z:zFrame,playerX:px,obstacles:this.obstacles(zNowP).filter(o=>o.cost===Infinity).map(o=>({...o,halfX:FENCE_HALF_X}))});
    this.coins.update(det,zFrame);
    this.lastPerception={zFrame,px,visible};
  }
  plan(nowMs){
    const {zFrame,px,visible}=this.lastPerception;
    const planMs=nowMs+6,zPlan=this.zAt(planMs);this.zNow=zPlan;
    const obstacles=this.obstacles(zPlan);
    const st=this.stateAt(planMs);
    const boxes=this.boxTargets(zPlan),coins=[...this.coins.coins(zPlan,2).filter(c=>c.z>zPlan),...boxes];
    const t0=Date.now();
    const margin=this.wideMarginUntil!=null&&zPlan<this.wideMarginUntil?Math.max(this.margin,POST_PAUSE_MARGIN):this.margin;
    const opts={z:zPlan,target:st.target,tween:st.tween,coins,speedAt,margin,horizon:this.horizon,
      decisionEvery:this.decisionEvery,width:this.width,zLimit:this.limitZ()};
    const plan=planWithFallbacks({...opts,obstacles}),dropped=plan.fallback;
    const presses=plan.presses.map(p=>({key:p.key,atMs:this.arrival(p.z),z:p.z}));
    const record={endgame:true,zFrame:+zFrame.toFixed(2),zPlan:+zPlan.toFixed(2),target:st.target,
      tween:st.tween?{from:+st.tween.from.toFixed(2),to:st.tween.to,p:+(st.tween.t/st.tween.d).toFixed(2)}:null,
      px:+px.toFixed(2),pxSrc:this.pxSource,safe:plan.safe,margin:plan.margin,value:Math.round(plan.value),dropped,planMs:Date.now()-t0,
      presses:presses.map(p=>`${p.key}@${p.z.toFixed(1)}`),
      rows:visible.slice(0,4).map(r=>{const p=r.passing();return {z:+r.z.toFixed(1),k:r.kind[0],f:p.fences,b:p.best,s:p.soft,c:p.confident,n:r.frames,...(r.mixed?{mx:1}:{})};}),
      coins:coins.filter(c=>!c.box).slice(0,6).map(c=>`${c.lane}@${c.z.toFixed(1)}:${c.value}`),
      ...(boxes.length?{boxes:boxes.map(b=>`${b.lane}@${b.z}`)}:{}),
      zOffset:+this.zOffset.toFixed(2),lagMs:this.lagMs,clockFixes:this.clockFixes.length,denseStart:this.denseStart&&+this.denseStart.toFixed(1),denseShift:this.denseShift,
      ...(this.chain.boundary?{boundary:+this.chain.boundary.z.toFixed(1)}:{}),...(this.denseAlt?{denseAlt:+this.denseAlt.start.toFixed(1)}:{})};
    return {presses,record};
  }
}
