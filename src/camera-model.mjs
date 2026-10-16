// Projection of the public game camera: position (0,5,z-10), looking at
// (playerX*0.5,1,z+11), vertical FOV 60 degrees, rendered into the canvas rect.
export const LANE_X=[-2.75,0,2.75];
export class CameraModel{
  constructor({left=185,top=0,width=500,height=668,fov=60}={}){
    Object.assign(this,{left,top,width,height});
    this.tanHalf=Math.tan(fov*Math.PI/360);
  }
  // World point relative to the player: dx world x, y height, d distance ahead.
  project(X,Y,d,playerX=0){
    const cx=0,cy=5,cz=-10,tx=playerX*0.5,ty=1,tz=11;
    let fx=tx-cx,fy=ty-cy,fz=tz-cz;const fl=Math.hypot(fx,fy,fz);fx/=fl;fy/=fl;fz/=fl;
    // three.js camera basis: z axis = -forward, x = up x z, y = z x x
    const zx=-fx,zy=-fy,zz=-fz;
    let xx=1*zz-0*zy,xy=0*zx-0*zz,xz=0*zy-1*zx;const xl=Math.hypot(xx,xy,xz);xx/=xl;xy/=xl;xz/=xl;
    const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
    const px=X-cx,py=Y-cy,pz=d-cz;
    const camX=px*xx+py*xy+pz*xz,camY=px*yx+py*yy+pz*yz,camZ=px*zx+py*zy+pz*zz;
    const aspect=this.width/this.height;
    const ndcX=camX/(-camZ*this.tanHalf*aspect),ndcY=camY/(-camZ*this.tanHalf);
    return {x:this.left+(ndcX+1)/2*this.width,y:this.top+(1-ndcY)/2*this.height};
  }
  // Distance ahead for a screen row, assuming the point sits at height Y.
  // Memoised: the same screen rows are queried every frame.
  distanceForY(screenY,Y=0,playerX=0){
    const key=Math.round(screenY*4)+'|'+Y+'|'+Math.round(playerX*20);
    this.memo??=new Map();const hit=this.memo.get(key);if(hit!==undefined)return hit;
    const v=this.distanceForYExact(screenY,Y,playerX);if(this.memo.size>200000)this.memo.clear();this.memo.set(key,v);return v;
  }
  distanceForYExact(screenY,Y=0,playerX=0){
    let lo=-9.5,hi=400;
    for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(this.project(0,Y,mid,playerX).y>screenY)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  }
  laneForX(screenX,screenY,Y=0,playerX=0){
    const d=this.distanceForY(screenY,Y,playerX);
    let best=0,err=Infinity;
    for(let l=0;l<3;l++){const e=Math.abs(this.project(LANE_X[l],Y,d,playerX).x-screenX);if(e<err){err=e;best=l;}}
    return {lane:best,d,err};
  }
}
