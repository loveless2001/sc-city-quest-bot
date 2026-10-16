// Runner lateral position from the camera: the camera looks at playerX*0.5,
// so the white lane lines near the bottom of the screen shift with the runner.
import {CameraModel} from './camera-model.mjs';
const cam=new CameraModel();
const ROWS=[640,625,610];
// Expected screen x of the two inner lane lines at screen row y for runner x px.
// Ground distance of a bottom screen row barely depends on the camera yaw.
const rowD=new Map(ROWS.map(y=>[y,cam.distanceForYExact(y,0,0)]));
function lineXs(y,px){const d=rowD.get(y);return [cam.project(1.375,0,d,px).x,cam.project(-1.375,0,d,px).x];}
export function measureRunnerX(frame){
  const {data,width,height}=frame,C=data.length/(width*height);
  const estimates=[];
  for(const y of ROWS){
    if(y>=height)continue;
    // White runs along the row inside the road.
    const runs=[];let s=-1;
    for(let x=190;x<680;x++){const k=(y*width+x)*C;const w=data[k]>200&&data[k+1]>200&&data[k+2]>200;
      if(w&&s<0)s=x;if(!w&&s>=0){if(x-s>=3&&x-s<=16)runs.push((s+x-1)/2);s=-1;}}
    if(!runs.length)continue;
    // Find px whose predicted lines best match the observed runs.
    let best=null;
    const tryPx=px=>{
      const [a,b]=lineXs(y,px);
      const ea=Math.min(...runs.map(r=>Math.abs(r-a))),eb=Math.min(...runs.map(r=>Math.abs(r-b)));
      const e=Math.min(ea,8)+Math.min(eb,8);if(!best||e<best.e)best={px,e,ea,eb};
    };
    for(let px=-3.2;px<=3.2;px+=0.1)tryPx(px);
    const c0=best.px;for(let px=c0-0.1;px<=c0+0.1;px+=0.02)tryPx(px);
    if(best&&(best.ea<2.5||best.eb<2.5))estimates.push(best);
  }
  if(!estimates.length)return null;
  estimates.sort((a,b)=>a.e-b.e);
  return {x:estimates[0].px,err:estimates[0].e};
}
