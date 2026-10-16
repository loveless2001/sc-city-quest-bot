import {letterProbability} from './letter-features.mjs';
// Reject white fence tips and shoes unless the visible coin contains its
// blue-and-green logo. Very small coins can be recognized on later frames.
export function whiteCoinSupport(frame,o){
 if(o.bw<10||o.bh<10)return {accepted:false,green:0,blue:0};
 const {data:d,width:w,height:h}=frame;let green=0,blue=0,total=0;
 for(let y=Math.max(0,Math.round(o.y-o.bh*.45));y<Math.min(h,o.y+o.bh*.45);y++)
  for(let x=Math.max(0,Math.round(o.x-o.bw*.45));x<Math.min(w,o.x+o.bw*.45);x++){
   const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];total++;
   green+=Number(g>80&&g-r>10&&g-b>6);blue+=Number(b>80&&b-r>20&&b-g>12);
  }
 green/=Math.max(1,total);blue/=Math.max(1,total);
 return {accepted:green>.02&&blue>.03,green,blue};
}

export function logoCoin(frame,o,camera,model){
 if(o.kind!=='coin'||o.bw<10||o.bh<10||o.near<=.407||o.near>=.64||o.fill<=.30||o.bw/o.bh<=.6||o.bw/o.bh>=1.5)return false;
 if(Math.abs((o.x-camera)/((o.y-frame.height*.35)*.72)-o.lane)>=.30||!whiteCoinSupport(frame,o).accepted)return false;
 return letterProbability(frame,o,model)>=model.threshold;
}
