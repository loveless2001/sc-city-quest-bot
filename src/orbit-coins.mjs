import {giftCandidates} from './gift-detector.mjs';
import {letterProbability} from './letter-features.mjs';

// Blue rotating coins have a green logo and a horizontal white ring.
// Classification uses only their rendered pixel patch.
export function orbitCoins(frame,camera,model,candidates=giftCandidates(frame,camera),{small=false}={}){
 const {data:d,width:w}=frame,result=[];
 for(const o of candidates){
  if(o.bw<(small?8:12)||o.bh<(small?8:12)||o.bw/o.bh<.6||o.bw/o.bh>1.55||o.fill<.32||o.y>frame.height*435/668)continue;
  let green=0,n=0;
  for(let y=Math.floor(o.y-o.bh*.5);y<o.y+o.bh*.5;y++)for(let x=Math.floor(o.x-o.bw*.5);x<o.x+o.bw*.5;x++){
   const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];n++;green+=Number(g>70&&g-r>15&&g-b>8);
  }
  if(green/n<.015)continue;
  const confidence=letterProbability(frame,o,model);
  const threshold=small&&(o.bw<12||o.bh<12||o.fill*o.bw*o.bh<80)?Math.max(.95,model.threshold):model.threshold;
  if(confidence>=threshold)result.push({...o,kind:'orbit',coin:1,confidence});
 }
 return result;
}
