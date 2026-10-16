import {ActionScheduler} from './action-scheduler.mjs';

// Manual takeover overrides even the second half of an atomic lane crossing.
// Normal enabled play retains the benchmark scheduler's route replacement rules.
export class InterruptibleScheduler extends ActionScheduler {
  constructor(options){super(options);this.allowed=options.allowed||(()=>true);this.generation=0;this.wakeDelay=null;}
  replace(groups){if(!this.allowed())return false;return super.replace(groups);}
  start(){
    if(this.active||this.error||!this.allowed())return;
    const group=this.queue.shift();if(!group)return;
    if(group.from!==undefined&&group.from!==this.getLane()){this.stats.laneMismatch++;this.arm();return;}
    const generation=this.generation;this.stats.started++;
    const active={group,promise:null};this.active=active;
    active.promise=(async()=>{
      try{
        for(const command of group.commands){
          const delay=group.at+command.offset-this.now();
          if(delay>0)await new Promise(resolve=>{
            const done=()=>{clearTimeout(timer);this.wakeDelay=null;resolve();};
            const timer=setTimeout(done,delay);this.wakeDelay=done;
          });
          if(generation!==this.generation||!this.allowed())break;
          const sent=this.now();this.onSent(command.key,sent);await this.press(command.key);
          const completed=this.now();this.stats.keys++;
          group.events.push({key:command.key,sent,completed,scheduledAt:group.at+command.offset});
        }
      }catch(error){this.error=error;this.cancelPending();}
      finally{this.active=null;this.arm();}
    })();
  }
  abort(){this.generation++;this.cancelPending();this.wakeDelay?.();return this.active?.promise||Promise.resolve();}
}
