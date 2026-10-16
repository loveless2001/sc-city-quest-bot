// A pair of posts can also enclose an empty lane between two real fences.
// Verify repeated narrow bars inside the fitted rectangle.
export function fenceInterior(frame,f){
  const {width:w,height:h,data:d}=frame;
  const gray=(x,y)=>{
    x=Math.round(x);y=Math.round(y);
    if(x<0||x>=w||y<0||y>=h)return false;
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
    return Math.max(r,g,b)-Math.min(r,g,b)<28&&(Math.max(r,g,b)<160||Math.min(r,g,b)>202);
  };
  const counts=[];
  for(const frac of [.22,.34,.46,.58,.70]){
    let length=0,runs=0,covered=0;
    const finish=()=>{if(length>0&&length<f.bw*.13)runs++;length=0;};
    for(let x=Math.round(f.x-f.bw*.36);x<=f.x+f.bw*.36;x++){
      if(gray(x,f.y-f.bh*frac)){length++;covered++;}else finish();
    }
    finish();counts.push({runs,coverage:covered/(f.bw*.72)});
  }
  return {rows:counts.filter(r=>r.runs>=4&&r.coverage>.12&&r.coverage<.78).length,counts};
}
