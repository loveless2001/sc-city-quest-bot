// RGB grid around a visible blue component, including the mark above it.
export function giftFeatures(frame,o){
 const {width:w,height:h,data:d}=frame,features=[];
 const left=o.x-o.bw*.65,top=o.top-o.bh*.9,cw=o.bw*1.3,ch=o.bh*1.95;
 for(let gy=0;gy<12;gy++)for(let gx=0;gx<10;gx++){
  let r=0,g=0,b=0,n=0;
  for(let y=Math.max(0,Math.floor(top+gy*ch/12));y<Math.min(h,Math.ceil(top+(gy+1)*ch/12));y++)
   for(let x=Math.max(0,Math.floor(left+gx*cw/10));x<Math.min(w,Math.ceil(left+(gx+1)*cw/10));x++){
    const i=(y*w+x)*4;r+=d[i];g+=d[i+1];b+=d[i+2];n++;
   }
  features.push(r/Math.max(1,n)/255,g/Math.max(1,n)/255,b/Math.max(1,n)/255);
 }
 features.push(Math.min(2,o.bw/o.bh),o.fill,Math.min(2,o.bw/Math.max(10,o.y-h*.35)));
 return features;
}
export function giftProbability(frame,o,model){
 const f=giftFeatures(frame,o);let score=model.bias;
 for(let i=0;i<f.length;i++)score+=f[i]*model.weights[i];
 return 1/(1+Math.exp(-score));
}
