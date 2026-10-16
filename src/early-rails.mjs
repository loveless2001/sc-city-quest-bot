import {railCandidates} from './rail-detector.mjs';
import {fenceInterior} from './fence-interior.mjs';

// At distance the solid posts occupy too few pixels for a dependable fit.
// Three distinct horizontal bars can provide an earlier, soft-cost warning.
// These observations still need the existing temporal rail confirmation.
export function earlyRails(frame,camera,existing=[]){
 return railCandidates(frame,camera,{minNear:.40,maxNear:.50}).filter(o=>{
  const ys=o.rows.map(r=>r.y),separation=Math.max(2,o.bh*.15);
  return o.quality>=2.65&&o.rows.every(r=>r.coverage>=.50&&r.longest>=.25)
   &&ys[1]-ys[0]>=separation&&ys[2]-ys[1]>=separation
   &&fenceInterior(frame,o).rows<3
   &&!existing.some(e=>e.lane===o.lane&&Math.abs(e.y-o.y)<Math.max(12,e.bh*.65));
 }).map(o=>({...o,earlyRail:true,confidence:Math.min(1,o.quality/3.5)}));
}
