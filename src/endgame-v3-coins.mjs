// Final-stage coin detector for the current bundle (coin values 10/80/100).
// Uses the exact camera projection; rejects blobs on known fences, lane lines
// and the runner, and accepts coin-coloured blobs of coin size at that distance.
import {CameraModel,LANE_X} from './camera-model.mjs';

const cam=new CameraModel();
const FOCAL=cam.height/2/cam.tanHalf;
// Coin-coloured pixel classes: white (10), navy (80) and green logo (100) coins.
function coinClass(r,g,b){
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  if(mn>=205&&mx-mn<=40)return 1;
  if(b>=45&&b<=140&&r<=45&&g<=70&&b-r>=30)return 2;
  if(g>=170&&b<=70&&g-r>=100)return 3;
  return 0;
}

// Coins spawn facing the camera and spin at 1 rad/s, so at the final-stage
// speed they are nearly edge-on (thin slivers) by the time they are near.
// Navy coins carry a flat white ring (a wide, low ellipse), and outer-lane
// coins sit next to the white/navy roadside banners.
export function detectCoins(frame,{z,playerX=0,obstacles=[],maxDistance=60,minDistance=3,jumpAllowance=false,laneTolerance=0.45,bridgeX=4,bridgeY=2,roadHalf=3.3,debug=null}){
  const {data,width,height}=frame,C=data.length/(width*height);
  const top=Math.ceil(cam.project(0,1,maxDistance,playerX).y);
  const bottom=Math.floor(cam.project(playerX,2.6,0.5,playerX).y);
  const mask=new Uint8Array(width*height);
  // Runner mask.
  {const a=cam.project(playerX-0.6,0,0,playerX),b=cam.project(playerX+0.6,jumpAllowance?4.3:2.8,0,playerX);
   const x0=Math.max(0,Math.floor(Math.min(a.x,b.x))-6),x1=Math.min(width-1,Math.ceil(Math.max(a.x,b.x))+6);
   for(let y=Math.max(0,Math.floor(b.y)-10);y<height;y++)mask.fill(1,y*width+x0,y*width+x1+1);}
  // Candidate pixels: inside the road at coin height, away from lane lines.
  const cls=new Uint8Array(width*height);
  const groundD=new Float32Array(height);
  for(let y=top;y<=bottom;y++)groundD[y]=cam.distanceForY(y,0,playerX);
  for(let y=top;y<=bottom;y++){
    const dg=groundD[y];
    // Coins float at height ~1, so bound the scan with lane edges at that height
    // (an outer coin with its ring reaches 3.35; the banners start near 3.45).
    const d1=cam.distanceForY(y,1,playerX);
    const left=cam.project(roadHalf,1,d1,playerX).x,right=cam.project(-roadHalf,1,d1,playerX).x;
    const lines=[cam.project(1.375,0,dg,playerX).x,cam.project(-1.375,0,dg,playerX).x];
    const lineHalf=Math.max(2,0.12*FOCAL/(dg+10))+1;
    for(let x=Math.max(0,Math.floor(Math.min(left,right)));x<=Math.min(width-1,Math.ceil(Math.max(left,right)));x++){
      const i=y*width+x;if(mask[i])continue;
      if(Math.abs(x-lines[0])<=lineHalf||Math.abs(x-lines[1])<=lineHalf)continue;
      const k=i*C;cls[i]=coinClass(data[k],data[k+1],data[k+2]);
    }
  }
  // Connected components (4-neighbour) over any coin class.
  const lab=new Int32Array(width*height),coins=[];
  const stack=[];let id=0;
  // Judge one candidate (a whole blob, or one coin's slice of a column).
  const judge=({cx,cy,h,w,n,counts,d,split})=>{
    if(d<minDistance||d>maxDistance)return 'range';
    const expected=FOCAL/(d+10.5);            // coin diameter is one world unit
    let lane=-1,err=Infinity;
    for(let l=0;l<3;l++){const e=Math.abs(cam.project(LANE_X[l],1,d,playerX).x-cx);if(e<err){err=e;lane=l;}}
    // Navy evidence: up close a navy coin is a navy edge inside a white ring,
    // a white coin a plain white sliver. Further out the coins still face the
    // camera and a white coin's blue logo reads as navy, so the share of navy
    // pixels needed grows with distance (measured on runs c-016..c-026: navy
    // coins pass 90/70/47%, white coins 0-4/0-2/2%). Green: the logo coin.
    const navyShape=counts[2]>=Math.max(4,n*0.15),navy=counts[2]>=Math.max(4,n*(d<22?0.15:d<40?0.4:0.6)),green=counts[3]>n*0.3;
    const why=coinShape({h,w,n,expected,navy:navyShape})??(err>expected*laneTolerance+1.5?'lane':null)??fenceReject(obstacles,{lane,d,z,cx,cy,playerX,maxDistance});
    if(debug)debug.push({lane,d,z:z+d,cx,cy,h,w,n,counts:[...counts],err:err/expected,expected,why:why??'ok',split:!!split});
    if(why)return why;
    const kind=green?'green':navy?'navy':'white';
    coins.push({lane,d,z:z+d,x:cx,y:cy,h,w,n,kind,value:kind==='green'?100:kind==='navy'?80:10,err,split:!!split});
    return null;
  };
  for(let y=top;y<=bottom;y++)for(let x=0;x<width;x++){
    const i=y*width+x;if(!cls[i]||lab[i])continue;
    let n=0,minX=x,maxX=x,minY=y,maxY=y;const counts=[0,0,0,0];
    id++;stack.push(i);lab[i]=id;
    while(stack.length){const j=stack.pop(),jx=j%width,jy=(j-jx)/width;
      n++;counts[cls[j]]++;
      if(jx<minX)minX=jx;if(jx>maxX)maxX=jx;if(jy<minY)minY=jy;if(jy>maxY)maxY=jy;
      // Bridge thin fence bars: link pixels up to bridgeX apart in a row, bridgeY in a column.
      for(let dx=-bridgeX;dx<=bridgeX;dx++)for(let dy=-bridgeY;dy<=bridgeY;dy++){
        if(!dx&&!dy||(dx&&dy))continue;const nx=jx+dx,ny=jy+dy;if(nx<0||nx>=width||ny<top||ny>bottom)continue;
        const nb=ny*width+nx;if(lab[nb]||!cls[nb])continue;lab[nb]=id;stack.push(nb);}}
    if(n<4)continue;
    const cy=(minY+maxY)/2;
    const why=judge({cx:(minX+maxX)/2,cy,h:maxY-minY+1,w:maxX-minX+1,n,counts,d:cam.distanceForY(cy,1,playerX)});
    // Consecutive coins in one lane (6 m apart) overlap on screen out to ~45 m
    // and merge into one tall column: walk it up from its bottom edge, one
    // coin (bottom at height ~0.5, top ~1.5) per 6 m step.
    if(why!=='tall')continue;
    let yb=maxY;
    for(let k=0;k<8;k++){
      const db=cam.distanceForY(yb,0.5,playerX);if(db>maxDistance)break;
      const yt=Math.max(minY,Math.round(cam.project(0,1.5,db,playerX).y));
      const next=Math.round(cam.project(0,0.5,db+6,playerX).y);
      let sn=0,sx0=Infinity,sx1=-1,sy0=Infinity,sy1=-1;const sc=[0,0,0,0];
      for(let yy=yt;yy<=yb;yy++)for(let xx=minX;xx<=maxX;xx++){const q=yy*width+xx;if(lab[q]!==id)continue;
        sn++;sc[cls[q]]++;if(xx<sx0)sx0=xx;if(xx>sx1)sx1=xx;if(yy<sy0)sy0=yy;if(yy>sy1)sy1=yy;}
      if(sn>=4){const scy=(sy0+sy1)/2;judge({cx:(sx0+sx1)/2,cy:scy,h:sy1-sy0+1,w:sx1-sx0+1,n:sn,counts:sc,d:cam.distanceForY(scy,1,playerX),split:true});}
      if(next<=minY+2||next>=yb)break;
      yb=next;
    }
  }
  return coins;
}
// Shape test: null for a coin-like blob, else the reason it is not one.
function coinShape({h,w,n,expected,navy}){
  // Navy coin with its flat ring: as wide as the ring, from ring-only height
  // (seen flat) to the full coin height.
  if(navy&&w>=expected*0.75&&w<=expected*1.7+4&&h>=expected*0.25&&h<=expected*1.5+2)return null;
  if(h<expected*0.55)return 'short';
  if(h>expected*1.5+2)return 'tall';
  if(w>expected*1.5+2)return 'wide';
  // Edge-on coin: a full-height sliver, solidly filled.
  const thin=w<h*0.35;
  if(thin)return h>=expected*0.7&&n>=Math.max(6,h*w*0.55)?null:'thin';
  if(n<expected*expected*0.12)return 'area';
  return null;
}
function fenceReject(obstacles,{lane,d,z,cx,cy,playerX,maxDistance}){
  // Blobs at a same-lane fence row are fence outline/bars, or unreachable coins.
  if(obstacles.some(o=>Math.abs(o.x-LANE_X[lane])<o.halfX&&Math.abs(o.z-(z+d))<1.5))return 'fenceRow';
  // Inside a same-lane fence's outline at or behind it: reject the post tops and end posts.
  for(const o of obstacles){if(Math.abs((o.xNow??o.x)-LANE_X[lane])>=o.halfX)continue;const df=o.z-z;if(df<0||d<df-1||df>maxDistance)continue;
    const ox=o.xNow??o.x,tl=cam.project(ox+1.75,2.45,df,playerX),br=cam.project(ox-1.75,0,df,playerX);
    if(cx<tl.x||cx>br.x||cy<tl.y||cy>br.y)continue;
    const fx=(cx-tl.x)/(br.x-tl.x),fy=(cy-tl.y)/(br.y-tl.y);
    if(fy<0.3||fx<0.15||fx>0.85)return 'onFence';}
  return null;
}

// Accumulates per-frame detections into coin tracks keyed by lane and distance.
// Coins bob +-0.2 m, which moves a coin's apparent distance by about
// 0.05*(d+10) m, so near sightings get more weight (1/(d+10)^2).
// The detector's navy/green calls are conservative (see detectCoins), while a
// navy or green coin often reads white in some frames, so repeated colour
// calls outrank white votes.
export class CoinTracker{
  constructor(){this.tracks=[];}
  update(detections,zNow){
    for(const c of detections){
      let t=this.tracks.filter(t=>t.lane===c.lane&&Math.abs(t.z-c.z)<2.5).sort((a,b)=>Math.abs(a.z-c.z)-Math.abs(b.z-c.z))[0];
      if(!t){t={lane:c.lane,z:c.z,sw:0,swz:0,n:0,kinds:{},first:zNow};this.tracks.push(t);}
      const w=1/(c.d+10)**2;t.sw+=w;t.swz+=w*c.z;t.n++;t.z=t.swz/t.sw;t.kinds[c.kind]=(t.kinds[c.kind]||0)+1;t.last=zNow;
    }
    this.tracks=this.tracks.filter(t=>t.z>zNow-3&&(t.n>=2||zNow-t.last<3));
  }
  static kindOf(k,n){
    const g=k.green||0,v=k.navy||0;
    if(g>=2&&g>=0.25*n&&g>=v)return 'green';
    if(v>=2&&v>=0.25*n)return 'navy';
    if(g>=2&&g>=0.25*n)return 'green';
    return Object.entries(k).sort((a,b)=>b[1]-a[1])[0][0];
  }
  coins(zNow,minHits=2){
    return this.tracks.filter(t=>t.n>=minHits&&t.z>zNow-2).map(t=>{
      const kind=CoinTracker.kindOf(t.kinds,t.n);
      return {lane:t.lane,z:t.z,value:kind==='green'?100:kind==='navy'?80:10,hits:t.n,kind};});
  }
}
