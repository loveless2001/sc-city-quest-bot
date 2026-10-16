export class BotControl {
  constructor(){this.enabled=false;this.available=false;this.generation=0;this.revision=0;this.message='Loading game…';this.listeners=new Set();}
  snapshot(){return {enabled:this.enabled,available:this.available,generation:this.generation,revision:this.revision,message:this.message};}
  publish(){this.revision++;for(const listener of this.listeners)listener(this.snapshot());return this.snapshot();}
  availability(available,message){this.available=available;if(!available){this.enabled=false;this.generation++;}this.message=message;return this.publish();}
  setEnabled(enabled,message){
    enabled=Boolean(enabled&&this.available);
    if(this.enabled!==enabled){this.generation++;this.enabled=enabled;}
    this.message=message||(enabled?'Finding runner…':this.available?'You control the game':this.message);
    return this.publish();
  }
  status(message){if(this.message===message)return;this.message=message;this.publish();}
  valid(token){return this.available&&this.enabled&&token===this.generation;}
}

// This script only adds our own controls to the visible document. It never
// inspects game objects, application stores or network state.
export function installBotPanel(){
  if(window.top!==window)return;
  let state={enabled:false,available:false,revision:-1,message:'Loading game…'},button,note;
  const draw=()=>{
    if(!button)return;
    button.textContent=state.enabled?'Stop bot · F8':'Start bot · F8';
    button.setAttribute('aria-label',state.enabled?'Stop bot (F8)':'Start bot (F8)');
    button.style.background=state.enabled?'#8f1d1d':'#174d70';
    button.setAttribute('aria-pressed',String(state.enabled));
    note.textContent=state.message;
  };
  window.__cityQuestBotDisplay=next=>{if(next.revision>=state.revision){state=next;draw();}};
  const request=action=>window.__cityQuestBotControl(action).then(window.__cityQuestBotDisplay).catch(()=>{
    state={...state,enabled:false,message:'Bot disconnected'};draw();
  });
  function mount(){
    if(!document.body)return;
    const panel=document.createElement('aside');panel.id='city-quest-bot-controls';
    panel.style.cssText='position:fixed;right:8px;bottom:12px;width:166px;z-index:2147483647;padding:8px;box-sizing:border-box;background:#15212bf2;color:white;border:1px solid #708090;border-radius:9px;font:12px/1.35 Arial,sans-serif;text-align:center;';
    button=document.createElement('button');button.type='button';
    button.style.cssText='width:100%;padding:9px 3px;border:0;border-radius:6px;color:white;font:bold 13px Arial;cursor:pointer;';
    button.addEventListener('click',()=>request('toggle'));
    note=document.createElement('div');note.style.cssText='margin-top:6px;';note.setAttribute('role','status');
    panel.append(button,note);document.body.append(panel);draw();request('state');
  }
  window.addEventListener('keydown',event=>{
    if(event.code==='F8'){
      event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)request('toggle');
    }else if(event.code==='Escape'&&state.enabled){
      event.preventDefault();event.stopImmediatePropagation();request('stop');
    }
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)request('stop');});
  window.addEventListener('blur',()=>request('stop'));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}

export async function attachBotControls(page,control){
  await page.exposeBinding('__cityQuestBotControl',({frame},action)=>{
    if(frame!==page.mainFrame())return control.snapshot();
    if(action==='toggle')return control.setEnabled(!control.enabled);
    if(action==='stop')return control.setEnabled(false);
    return control.snapshot();
  });
  await page.addInitScript(installBotPanel);
  const render=state=>{if(!page.isClosed())page.evaluate(s=>window.__cityQuestBotDisplay?.(s),state).catch(()=>{});};
  control.listeners.add(render);
  return ()=>control.listeners.delete(render);
}
