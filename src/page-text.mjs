// The page text (HUD stage and score, puzzle and result screens) read for each
// early-game frame. A read waits for the game's main thread, which can be busy
// for 100 ms or more in the first seconds of a run; the frame should not wait
// that long. One read runs at a time. get() waits for the running read (starting
// one if needed) until graceMs after it started; past that, the read keeps
// running in the background while the frame uses the last finished read, if
// that started less than maxAgeMs ago, and waits for the running read only when
// nothing that recent exists. A read that fails is reported once, on the next
// get().
export class OverlappedText{
  constructor(read,{graceMs=25,maxAgeMs=250,clock=Date.now}={}){
    Object.assign(this,{read,graceMs,maxAgeMs,clock});this.last=null;this.running=null;this.error=null;
  }
  // Starts a read unless one is running.
  start(){
    if(this.running)return this.running;
    const startedAt=this.clock(),run={startedAt};
    run.promise=Promise.resolve().then(()=>this.read()).then(
      text=>{const doneAt=this.clock();run.readMs=doneAt-startedAt;if(text!=null)this.last={text,startedAt,doneAt};return text;},
      error=>{this.error=error;throw error;});
    run.promise.catch(()=>{}).finally(()=>{if(this.running===run)this.running=null;});
    this.running=run;return run;
  }
  // Text for the current frame: {text, stale, ageMs, readMs}. text is null when
  // the read timed out (as the read itself reports it). stale:false always
  // awaits the running read.
  async get({stale=true}={}){
    try{
      if(this.error)throw this.error;
      const run=this.start(),done=text=>({text,stale:false,ageMs:this.clock()-run.startedAt,readMs:run.readMs});
      if(!stale)return done(await run.promise);
      const wait=Math.max(0,this.graceMs-(this.clock()-run.startedAt));
      let timer;
      const fresh=await Promise.race([run.promise.then(text=>({text})),new Promise(r=>{timer=setTimeout(()=>r(null),wait);})]).finally(()=>clearTimeout(timer));
      if(fresh)return done(fresh.text);
      if(this.last&&this.clock()-this.last.startedAt<=this.maxAgeMs)
        return {text:this.last.text,stale:true,ageMs:this.clock()-this.last.startedAt,readMs:null};
      return done(await run.promise);
    }catch(error){this.error=null;throw error;}
  }
  // Text of the last finished read, if any (it says whether the run was on screen).
  get lastText(){return this.last?.text??null;}
}

// Page text that shows the running game, not a menu, puzzle or result screen.
export const playingText=text=>!!text&&text.includes('Điểm số')&&!text.includes('Đang vào game')&&
  !text.includes('NEXT QUEST')&&!/GHÉP HÌNH|THỬ THÁCH BẤT NGỜ/.test(text);
