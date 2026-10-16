// Chromium's rendered screenshots, with frame-swap timestamps. No game state.
export class RenderedFrameStream {
  constructor(context,page,{everyNthFrame=1}={}){Object.assign(this,{context,page,everyNthFrame});this.active=false;this.serial=0;this.consumed=0;this.latest=null;this.waiters=[];this.error=null;}
  async start(){
    if(this.active)return;
    if(!this.session){
      this.session=await this.context.newCDPSession(this.page);
      this.session.on('Page.screencastFrame',event=>{
        const received=Date.now();
        this.session.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(e=>{
          if(this.active){this.error=e;this.wake();}
        });
        if(!this.active)return;
        const timestamp=event.metadata.timestamp*1000;
        const stamp=Number.isFinite(timestamp)&&Math.abs(received-timestamp)<5000?timestamp:received;
        this.latest={shot:Buffer.from(event.data,'base64'),captureStart:stamp,captureEnd:stamp,
          captureReceived:received,captureKind:'rendered-stream',serial:++this.serial};
        this.wake();
      });
    }
    this.active=true;this.latest=null;this.error=null;
    try{await this.session.send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:870,maxHeight:668,everyNthFrame:this.everyNthFrame});}
    catch(e){this.active=false;throw e;}
  }
  wake(){for(const wake of this.waiters.splice(0))wake();}
  async next(){
    await this.start();
    const deadline=Date.now()+5000;
    while(!this.error&&this.active&&(!this.latest||this.latest.serial<=this.consumed)){
      if(Date.now()>deadline)throw new Error('Rendered screenshot stream stalled for five seconds');
      await new Promise(resolve=>{
        const timer=setTimeout(()=>{this.waiters=this.waiters.filter(w=>w!==wake);resolve();},1000);
        const wake=()=>{clearTimeout(timer);resolve();};this.waiters.push(wake);
      });
    }
    if(this.error)throw this.error;
    if(!this.active)throw new Error('Rendered screenshot stream stopped while waiting');
    this.consumed=this.latest.serial;return this.latest;
  }
  async stop(){
    if(!this.active)return;
    this.active=false;this.wake();await this.session.send('Page.stopScreencast');this.latest=null;
  }
}
