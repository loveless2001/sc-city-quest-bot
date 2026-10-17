import {CourseClock,wordRowDistances} from './course-clock.mjs';
import {LETTER_INTERVAL} from './endgame-v3-course.mjs';
import {WordHudTracker} from './word-hud.mjs';
export class WordClock{
  constructor(){this.clock=new CourseClock();this.hud=new WordHudTracker();this.stage=null;this.rows=[];this.matches=new Map();}
  pause(){this.clock.pause();this.matches.clear();}
  observe(frame,stage,now){
    this.clock.observe(stage,now);
    if(stage!==this.stage){this.stage=stage;this.rows=[];this.matches.clear();}
    const h=this.hud.update(frame,stage,now);
    if(h.total>=8&&h.total<=21&&h.total!==this.rows.length){this.rows=wordRowDistances(stage,h.total);this.matches.clear();}
    this.diagnostics={stage,phase:this.clock.phase,rows:this.rows.length,corrected:[]};
  }
  correct(events,height,observedAt,planningAt){
    const playerZ=this.clock.distance(observedAt);if(playerZ===null||!this.rows.length)return events;
    const focal=height/2/Math.tan(Math.PI/6),pitch=4/21;
    for(const e of events){
      if(e.kind!=='letter'||e.memory||e.object?.letter<.8||e.object?.bw<10||e.y<height*.415)continue;
      // Pinhole inversion at the published letter center height1.2m. Bobbing
      // and imperfect boxes are tolerated only within a fraction of row spacing.
      const q=(e.y-height/2)/focal,deltaZ=3.8*(1-q*pitch)/(q+pitch)-10;
      const worldZ=playerZ+deltaZ;
      const index=this.rows.reduce((best,z,i)=>Math.abs(z-worldZ)<Math.abs(this.rows[best]-worldZ)?i:best,0);
      const gap=Math.min(index?this.rows[index]-this.rows[index-1]:LETTER_INTERVAL,index+1<this.rows.length?this.rows[index+1]-this.rows[index]:LETTER_INTERVAL);
      if(Math.abs(this.rows[index]-worldZ)>Math.min(6,gap*.3))continue;
      const old=this.matches.get(index),hits=old?.lane===e.lane?old.hits+1:1;
      this.matches.set(index,{lane:e.lane,hits,seen:observedAt,event:e});
    }
    const projected=[];
    for(const [index,m]of this.matches){
      const arrival=this.clock.arrival(this.rows[index]),eta=arrival-planningAt;
      if(eta< -60){this.matches.delete(index);continue;}
      if(m.hits<2||observedAt-m.seen>1100||eta<0||eta>2100)continue;
      projected.push({...m.event,id:`word-${index}`,eta,memory:observedAt>m.seen,publicRow:index});
      this.diagnostics.corrected.push({index,lane:m.lane,eta,oldEta:m.event.eta,hits:m.hits});
    }
    // Replace only letter events associated with a repeatedly observed row.
    const replacedIds=new Set(projected.map(p=>this.matches.get(p.publicRow).event.id));
    return [...events.filter(e=>e.kind!=='letter'||!replacedIds.has(e.id)&&!projected.some(p=>p.lane===e.lane&&Math.abs(p.eta-e.eta)<450)),...projected].sort((a,b)=>a.eta-b.eta);
  }
}
