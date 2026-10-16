import {blueCones} from './cone-detector.mjs';
import {coneFeatures} from './cone-features.mjs';

export function earlyConeFeatures(o,pixels){
 const parts=o.parts;
 const f=[(o.y-225)/100,o.bw/30,o.bh/20,o.bh/o.bw,parts.length/3,
  Math.min(...parts.map(p=>p.bh))/Math.max(...parts.map(p=>p.bh)),
  Math.min(...parts.map(p=>p.bw))/Math.max(...parts.map(p=>p.bw)),
  (Math.max(...parts.map(p=>p.y))-Math.min(...parts.map(p=>p.y)))/o.bh,
  parts.reduce((s,p)=>s+p.bw,0)/o.bw,o.bw/(o.y-225),o.bh/(o.y-225)];
 for(const [y0,y1] of [[0,5],[5,10]])for(const [x0,x1] of [[0,3],[3,7],[7,10]]){
  const sums=[0,0,0],squares=[0,0,0];let n=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
   n++;for(let c=0;c<3;c++){const v=pixels[(y*10+x)*3+c];sums[c]+=v;squares[c]+=v*v;}
  }
  f.push(...sums.map(v=>v/n),...squares.map((v,c)=>Math.sqrt(Math.max(0,v/n-(sums[c]/n)**2))));
 }
 return f;
}
export function earlyConeScore(object,pixels,model){
 const f=earlyConeFeatures(object,pixels).map((v,i)=>(v-model.mean[i])/model.scale[i]);
 let score=0;
 for(let i=0;i<model.vectors.length;i++){
  let distance=0;for(let j=0;j<f.length;j++)distance+=(f[j]-model.vectors[i][j])**2;
  score+=Math.exp(-model.gamma*distance)*model.alpha[i];
 }
 return score;
}
export function earlyCones(frame,camera,model){
 // The unchanged original detector handles larger cones. This model only
 // adds visible candidates below its minimum size, at the calibrated viewport.
 if(frame.height!==668)return [];
 return blueCones(frame,camera,null).filter(o=>o.y>=264&&o.y<=320&&o.bw>=8&&o.bw<=36
  &&o.bh>=4&&o.bh<=24&&o.bh/o.bw<=1.1&&(o.bw<18||o.bh<10))
  .map(o=>({...o,earlyCone:true,earlyScore:earlyConeScore(o,coneFeatures(frame,o),model),confidence:.7}))
  .filter(o=>o.earlyScore>=model.threshold);
}
