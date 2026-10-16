// Keep a short, replaceable plan running while screenshots are in flight.
// A started two-key crossing is atomic: a new frame cannot cancel its second key.
export class ActionScheduler {
  constructor({press,onSent,getLane,now=Date.now,refreshDuringSingleInput=false}){
    Object.assign(this,{press,onSent,getLane,now,refreshDuringSingleInput});
    this.queue=[];this.active=null;this.timer=null;this.error=null;
    this.stats={started:0,cancelled:0,keys:0,laneMismatch:0};
  }
  replace(groups){
    if(this.error)return false;
    // A slow acknowledgement of a single key must not discard a newly seen
    // escape. Keep that in-flight key, replace only the pending route, and
    // start the fresh route as soon as it finishes. Full crossings stay atomic.
    if(this.active&&(!this.refreshDuringSingleInput||this.active.group.commands.length>1))return false;
    this.cancelPending();
    this.queue=groups.map(g=>({...g})).sort((a,b)=>a.at-b.at);
    this.arm();return true;
  }
  cancelPending(){
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    this.stats.cancelled+=this.queue.length;this.queue=[];
  }
  flushDue(){
    // CPU work can delay a timer callback even though its deadline has passed.
    // Run that existing commitment before another screenshot replaces it.
    // A started two-key crossing retains the normal atomic protection.
    if(this.active||this.error||!this.queue.length||this.queue[0].at>this.now())return false;
    if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}
    this.stats.flushedDue=(this.stats.flushedDue||0)+1;
    this.start();return true;
  }
  arm(){
    if(this.active||this.error||!this.queue.length)return;
    if(this.timer!==null)clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;this.start();},Math.max(0,this.queue[0].at-this.now()));
  }
  start(){
    if(this.active||this.error)return;
    const group=this.queue.shift();if(!group)return;
    if(group.from!==undefined&&group.from!==this.getLane()){
      this.stats.laneMismatch++;this.arm();return;
    }
    this.stats.started++;
    const active={group,promise:null};this.active=active;
    active.promise=(async()=>{
      try{
        for(const command of group.commands){
          const delay=group.at+command.offset-this.now();
          if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
          const sent=this.now();this.onSent(command.key,sent);
          await this.press(command.key);
          const completed=this.now();this.stats.keys++;
          group.events.push({key:command.key,sent,completed,scheduledAt:group.at+command.offset});
        }
      }catch(e){this.error=e;this.cancelPending();}
      finally{this.active=null;this.arm();}
    })();
  }
  async drain(){
    this.cancelPending();
    if(this.active)await this.active.promise;
  }
}
