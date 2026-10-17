// Location medals (+200, "Huy hiệu"): discs 1.56 m across at a height of 2 m
// (bobbing +-0.3 m) in the middle lane, a pale landmark icon inside a gold,
// blue or green ring (medals 1-3, placed at random in Tăng tốc 1, Tăng tốc 3 and
// Về đích; the game keeps random obstacles out of the middle lane within 20 m).
// The older detector (bonus-detector.mjs) looks for gold pixels only, so the
// blue and green medals depended on other detectors: the green one was
// collected in 26 of 49 recorded games.
// Pixel-only: ring-coloured components in the middle-lane corridor at medal
// height, kept when their size matches a medal at the distance their screen
// row gives (exact camera projection) and their inside is pale.
import {CameraModel,LANE_X} from './camera-model.mjs';

const cam=new CameraModel();
const HEIGHT=2,RADIUS=0.78;
// Rendered ring colours (materials #f9ce00, #0288d1, #00c853 with emissive):
// the blue ring renders as a darker teal (~ 20,95,135), far from the grey-blue
// road (~ 120,135,165); the green ring has blue well above red, unlike the
// roadside banners (red at or above blue) and the letters (brighter green, red
// and blue alike).
const TIERS=[
  ['gold',(r,g,b)=>r>=170&&g>=120&&b<=100&&r-b>=110],
  ['blue',(r,g,b)=>b>=105&&r<=70&&g>=60&&g<=190&&b-g>=15&&b-r>=75],
  ['green',(r,g,b)=>g>=105&&r<=70&&b>=40&&b<=130&&g-r>=75&&b-r>=25&&g-b>=20],
];
export function medals(frame,{playerX=0,maxDistance=70,minDistance=3,debug=null}={}){
  const {data,width:w,height:h}=frame,C=data.length/(w*h);
  const yTop=Math.max(0,Math.floor(cam.project(0,HEIGHT,maxDistance,playerX).y)),yBot=Math.min(h-1,Math.ceil(cam.project(0,HEIGHT,minDistance,playerX).y));
  const mask=new Uint8Array(w*h);   // tier index + 1
  for(let y=yTop;y<=yBot;y++){
    const d=cam.distanceForY(y,HEIGHT,playerX);
    // Middle lane +-1.6 m (a medal is 0.78 m in radius).
    const a=cam.project(-1.6,HEIGHT,d,playerX).x,b=cam.project(1.6,HEIGHT,d,playerX).x;
    for(let x=Math.max(0,Math.floor(Math.min(a,b)));x<=Math.min(w-1,Math.ceil(Math.max(a,b)));x++){
      const k=(y*w+x)*C,r=data[k],g=data[k+1],bl=data[k+2];
      for(let t=0;t<TIERS.length;t++)if(TIERS[t][1](r,g,bl)){mask[y*w+x]=t+1;break;}
    }
  }
  const seen=new Uint8Array(w*h),out=[],comps=[];
  for(let y=yTop;y<=yBot;y++)for(let x=0;x<w;x++){
    const p=y*w+x,t=mask[p];if(!t||seen[p])continue;
    const stack=[p];seen[p]=1;let n=0,x0=x,x1=x,y0=y,y1=y;
    while(stack.length){const q=stack.pop(),qx=q%w,qy=(q-qx)/w;n++;
      if(qx<x0)x0=qx;if(qx>x1)x1=qx;if(qy<y0)y0=qy;if(qy>y1)y1=qy;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]]){const nx=qx+dx,ny=qy+dy;if(nx<0||nx>=w||ny<yTop||ny>yBot)continue;
        const nq=ny*w+nx;if(!seen[nq]&&mask[nq]===t){seen[nq]=1;stack.push(nq);}}}
    if(n>=4)comps.push({t,n,x0,x1,y0,y1});
  }
  // A ring crossed by fence bars or hurdles splits into arcs: merge same-colour
  // components whose boxes are within 3 px.
  for(let merged=true;merged;){merged=false;
    for(let i=0;i<comps.length&&!merged;i++)for(let j=i+1;j<comps.length;j++){const a=comps[i],b=comps[j];
      if(a.t!==b.t||a.x0>b.x1+3||b.x0>a.x1+3||a.y0>b.y1+3||b.y0>a.y1+3)continue;
      a.n+=b.n;a.x0=Math.min(a.x0,b.x0);a.x1=Math.max(a.x1,b.x1);a.y0=Math.min(a.y0,b.y0);a.y1=Math.max(a.y1,b.y1);comps.splice(j,1);merged=true;break;}}
  for(const {t,n,x0,x1,y0,y1} of comps){
    if(n<12)continue;
    const bw=x1-x0+1,bh=y1-y0+1,cx=(x0+x1)/2,cy=(y0+y1)/2;
    const why=judge();
    if(debug)debug.push({tier:TIERS[t-1][0],x:cx,y:cy,bw,bh,n,why:why??'ok'});
    function judge(){
      if(bw/bh<0.6||bw/bh>1.6)return 'shape';
      const d=cam.distanceForY(cy,HEIGHT,playerX);if(d<minDistance||d>maxDistance)return 'range';
      const ew=Math.abs(cam.project(RADIUS,HEIGHT,d,playerX).x-cam.project(-RADIUS,HEIGHT,d,playerX).x);
      if(bw<0.55*ew||bw>1.6*ew+3||bh<0.5*ew||bh>1.6*ew+3)return 'size';
      // Pale inside: the icon's light pixels within the ring.
      let light=0,m=0;
      for(let yy=Math.round(cy-bh*0.3);yy<=cy+bh*0.3;yy++)for(let xx=Math.round(cx-bw*0.3);xx<=cx+bw*0.3;xx++){
        if(xx<0||xx>=w||yy<0||yy>=h)continue;const k=(yy*w+xx)*C,mn=Math.min(data[k],data[k+1],data[k+2]),mx=Math.max(data[k],data[k+1],data[k+2]);
        m++;if(mn>=140&&mx-mn<=100)light++;}
      if(m<4||light/m<0.3)return 'inside';
      // Lane: the nearest lane centre at that distance (medals are in the middle).
      let lane=1,err=Infinity;for(let l=0;l<3;l++){const e=Math.abs(cam.project(LANE_X[l],HEIGHT,d,playerX).x-cx);if(e<err){err=e;lane=l;}}
      if(err>0.6*ew+2)return 'lane';
      // For the pickup tracker (coin-height rows): the row a coin at this
      // distance would have, so its arrival estimate holds.
      out.push({kind:'bonus',medal:TIERS[t-1][0],lane:1-lane,x:cx,y:cam.project(LANE_X[lane],1,d,playerX).y,bw,bh,d,fill:n/(bw*bh),near:cam.project(LANE_X[lane],1,d,playerX).y/h});
      return null;
    }
  }
  return out;
}
