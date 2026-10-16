import {CalibratedPilot} from './calibrated-pilot.mjs';
import {laneFenceWindows} from './window-detector.mjs';

export class RowPilot extends CalibratedPilot {
  constructor(letters,coins){
    super(letters,coins);this.rows=[];this.rowId=1;
    this.windowDetector={gates:(frame,camera)=>laneFenceWindows(frame,camera,{minNear:.403,maxNear:.89})};
  }
  resumeAfterPuzzle(){super.resumeAfterPuzzle();this.rows=[];}
  updateTracks(fences,h,now){
    const hy=h*.35,hit=1/(h*.75-hy);
    const groups=[];
    for(const f of [...fences].sort((a,b)=>b.y-a.y)){
      const inverse=1/(f.y-hy);
      let group=groups.find(g=>Math.abs(g.inverse-inverse)<.0022);
      if(!group){group={inverse,items:[]};groups.push(group);}
      group.items.push(f);
    }
    const measurements=groups.map(g=>{
      const ordered=[...g.items].sort((a,b)=>a.y-b.y);
      const y=ordered[Math.floor(ordered.length/2)].y;
      return {y,inverse:1/(y-hy),lanes:[...new Set(g.items.map(f=>f.lane))]};
    }).sort((a,b)=>b.y-a.y);
    this.rows=this.rows.filter(r=>now-r.seen<650&&now<r.impact+220&&r.y<h*.86);
    const used=new Set();
    for(const m of measurements){
      if(m.y>h*.86)continue;
      const candidates=this.rows.filter(r=>!used.has(r.id)&&m.y>=r.y-20)
        .map(r=>({r,error:Math.abs(m.inverse-(r.inverse-r.rate*(now-r.seen)))}))
        .filter(p=>p.error<.005).sort((a,b)=>a.error-b.error);
      let row=candidates[0]?.r;
      if(!row){row={id:this.rowId++,rate:this.speed,history:[],votes:[0,0,0],hits:0};this.rows.push(row);}
      used.add(row.id);row.hits++;
      row.history.push({at:now,inverse:m.inverse});row.history=row.history.filter(p=>now-p.at<700).slice(-10);
      const slopes=[];
      for(let i=0;i<row.history.length;i++)for(let j=i+1;j<row.history.length;j++){
        const a=row.history[i],b=row.history[j],dt=b.at-a.at,slope=(a.inverse-b.inverse)/dt;
        if(dt>120&&slope>.000007&&slope<.000035)slopes.push(slope);
      }
      if(slopes.length){slopes.sort((a,b)=>a-b);row.rate=.6*row.rate+.4*slopes[slopes.length>>1];this.speed=.95*this.speed+.05*row.rate;}
      for(const lane of [-1,0,1]){
        const present=m.lanes.includes(lane);
        row.votes[lane+1]=Math.max(0,Math.min(3,row.votes[lane+1]+(present?1.5:-.9)));
      }
      row.y=m.y;row.inverse=m.inverse;row.seen=now;row.impact=now+(m.inverse-hit)/row.rate;
    }
    const active=[];
    for(const row of this.rows){
      if(row.hits<2&&row.y<h*.60)continue;
      for(const lane of [-1,0,1])if(row.votes[lane+1]>=1.5){
        active.push({...row,id:row.id*3+lane+1,lane,eta:row.impact-now});
      }
    }
    this.tracks=active;return active;
  }
  analyse(frame,now=Date.now()){
    const oldLane=this.commandLane,oldMove=this.lastMove;
    const d=super.analyse(frame,now);
    if(d.lane!==oldLane){
      const traversed=[];
      for(let l=oldLane+Math.sign(d.lane-oldLane);Math.abs(l-oldLane)<=Math.abs(d.lane-oldLane);l+=Math.sign(d.lane-oldLane))traversed.push(l);
      const occupied=d.fences.some(f=>traversed.includes(f.lane)&&f.y>frame.height*.56&&f.y<frame.height*.84);
      if(occupied){
        d.keys=d.keys.filter(k=>k==='ArrowUp');d.commands=d.commands.filter(c=>c.key==='ArrowUp');
        d.lane=oldLane;d.reason='wait for visible destination fence to clear';
        this.commandLane=oldLane;this.lane=oldLane;this.lastMove=oldMove;
      }
    }
    return d;
  }
}
