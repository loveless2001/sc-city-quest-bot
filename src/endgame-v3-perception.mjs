// Screen measurements for the final stage: lateral position of fences on rows
// at known distances, using the exact camera projection of the public game.
import {CameraModel} from './camera-model.mjs';
import {FENCE_HALF_X} from './endgame-v3-course.mjs';
const cam=new CameraModel();
const FOCAL=cam.height/2/cam.tanHalf;
// Neutral dark pixels: fence posts and bars (not navy coins, not the road).
const isDark=(r,g,b)=>Math.max(r,g,b)<88&&Math.abs(r-g)<26&&Math.abs(g-b)<34;

/**
 * Column profile of dark fence pixels in the vertical band a fence at distance d
 * would occupy. Returns {x0, counts, bandHeight}.
 */
function columnProfile(frame,d,playerX,masks){
  const {data,width,height}=frame,C=data.length/(width*height);
  const top=cam.project(0,2.1,d,playerX).y,base=cam.project(0,0.15,d,playerX).y;
  const y0=Math.max(0,Math.round(top)),y1=Math.min(height-1,Math.round(base));
  const left=Math.max(0,Math.floor(cam.project(4.6,1,d,playerX).x)),right=Math.min(width-1,Math.ceil(cam.project(-4.6,1,d,playerX).x));
  const counts=new Float32Array(right-left+1);
  for(let x=left;x<=right;x++){
    let n=0;
    for(let y=y0;y<=y1;y++){
      if(masks.some(m=>x>=m.x0&&x<=m.x1&&y>=m.y0&&y<=m.y1))continue;
      const k=(y*width+x)*C;if(isDark(data[k],data[k+1],data[k+2]))n++;
    }
    counts[x-left]=n;
  }
  return {left,counts,bandHeight:Math.max(1,y1-y0+1),y0,y1};
}
// World x for a screen column at distance d (height 1).
function worldX(sx,d,playerX){
  let lo=-6,hi=6;for(let i=0;i<40;i++){const m=(lo+hi)/2;if(cam.project(m,1,d,playerX).x>sx)lo=m;else hi=m;}return (lo+hi)/2;
}
/**
 * Find up to `count` fences on the row at distance d. Each result is the window
 * of fence width with the most dark pixels: {x, strength, x0, x1}.
 */
export function measureRow(frame,{d,playerX=0,masks=[],count=1}){
  const {left,counts,bandHeight,y0,y1}=columnProfile(frame,d,playerX,masks);
  const w=Math.max(4,Math.round(2*FENCE_HALF_X*FOCAL/(d+10.5)));
  const prefix=new Float32Array(counts.length+1);for(let i=0;i<counts.length;i++)prefix[i+1]=prefix[i]+counts[i];
  const found=[];const used=new Uint8Array(counts.length);
  for(let c=0;c<count;c++){
    let best=-1,bi=-1;
    for(let i=0;i+w<=counts.length;i++){
      let blocked=false;for(let j=i;j<i+w;j+=Math.max(1,w>>3))if(used[j]){blocked=true;break;}
      if(blocked)continue;
      const s=prefix[i+w]-prefix[i];if(s>best){best=s;bi=i;}
    }
    if(bi<0)break;
    const strength=best/(w*bandHeight);
    const cx=left+bi+w/2;
    found.push({x:worldX(cx,d,playerX),strength,sx0:left+bi,sx1:left+bi+w,sy0:y0,sy1:y1});
    for(let j=Math.max(0,bi-w/3|0);j<Math.min(counts.length,bi+w+(w/3|0));j++)used[j]=1;
  }
  return found;
}
export function fenceMask(m){return {x0:m.sx0,x1:m.sx1,y0:m.sy0-4,y1:m.sy1+4};}

// Lowest screen row of the fence posts inside a measured fence window, as a
// distance estimate (posts stand on the road). Returns the distance or null.
export function footDistance(frame,m,{playerX=0,minFraction=0.12,below=null,masks=[]}={}){
  below??=Math.max(4,Math.round((m.sy1-m.sy0)*0.35));
  const {data,width,height}=frame,C=data.length/(width*height);
  const x0=Math.max(0,Math.round(m.sx0+(m.sx1-m.sx0)*0.04)),x1=Math.min(width-1,Math.round(m.sx1-(m.sx1-m.sx0)*0.04));
  const need=Math.max(2,(x1-x0+1)*minFraction);
  let foot=null;
  for(let y=Math.round((m.sy0+m.sy1)/2);y<=Math.min(height-1,m.sy1+below);y++){
    // Masked pixels (runner, nearer fences) count as unknown, not as posts.
    const rowMasks=masks.filter(q=>y>=q.y0&&y<=q.y1);
    let n=0,seen=0;for(let x=x0;x<=x1;x++){if(rowMasks.some(q=>x>=q.x0&&x<=q.x1))continue;seen++;const k=(y*width+x)*C;if(isDark(data[k],data[k+1],data[k+2]))n++;}
    if(seen>=(x1-x0+1)*0.5&&n>=Math.max(2,seen*minFraction))foot=y;
  }
  return foot==null?null:cam.distanceForY(foot,0,playerX);
}
