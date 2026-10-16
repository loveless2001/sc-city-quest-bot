// A distant centre fence can bridge two nearer side fences into one shape.
// A split lane must contain bars near the bottom of that shape, not only
// a few background bars at its top.
export function validSplitFence(frame,o){
  if(!o.split)return true;
  const gray=(x,y)=>{const i=((y|0)*frame.width+(x|0))*4,r=frame.data[i],g=frame.data[i+1],b=frame.data[i+2];return Math.max(r,g,b)-Math.min(r,g,b)<30&&(Math.max(r,g,b)<155||Math.min(r,g,b)>204);};
  let good=0;
  for(let y=o.y-o.bh*.42;y<o.y-o.bh*.12;y+=Math.max(2,o.bh*.06)){
    let runs=0,length=0;
    for(let x=o.x-o.bw*.44;x<=o.x+o.bw*.44;x++){
      if(gray(x,y))length++;
      else{if(length>=1&&length<o.bw*.17)runs++;length=0;}
    }
    if(runs>=4)good++;
  }
  return good>=2;
}
