import {spawn} from 'node:child_process';
import {mkdir,open,readFile,unlink,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function exists(path){try{await access(path);return true;}catch{return false;}}

// Keep only the game tab and put it in front. Edge opens its own start tab and
// may restore tabs of an earlier session beside ours; a game in a background tab
// neither renders nor keeps focus (and the game ends a run that loses focus).
export async function keepGameTab(page){
  try{
    // A tab's target id is the id of its main frame.
    const pageSession=await page.context().newCDPSession(page),ownId=(await pageSession.send('Page.getFrameTree')).frameTree.frame.id;
    await pageSession.detach().catch(()=>{});
    const session=await page.context().browser().newBrowserCDPSession(),{targetInfos}=await session.send('Target.getTargets');
    const tabs=targetInfos.filter(t=>t.type==='page');
    // Close nothing unless our own tab is positively among them.
    if(tabs.some(t=>t.targetId===ownId))for(const t of tabs)if(t.targetId!==ownId)await session.send('Target.closeTarget',{targetId:t.targetId}).catch(()=>{});
    await session.detach().catch(()=>{});
  }catch{}
  await page.bringToFront().catch(()=>{});
}

export async function launchUserBrowser(chromium,{profile,channel='chrome'}={}){
  const candidates=channel==='chromium'?[chromium.executablePath()]:
    channel==='msedge'?[join(process.env['ProgramFiles(x86)']||'', 'Microsoft/Edge/Application/msedge.exe'),join(process.env.ProgramFiles||'','Microsoft/Edge/Application/msedge.exe')]:
    [join(process.env.ProgramFiles||'','Google/Chrome/Application/chrome.exe'),join(process.env['ProgramFiles(x86)']||'','Google/Chrome/Application/chrome.exe'),join(process.env.LOCALAPPDATA||'','Google/Chrome/Application/chrome.exe')];
  let executable;for(const path of candidates)if(await exists(path)){executable=path;break;}
  if(!executable)throw new Error(`Browser not found (${channel}). Use --edge, or install Chromium and use --chromium.`);
  profile=resolve(profile);await mkdir(profile,{recursive:true});
  const lockPath=join(profile,'city-quest-bot.lock');
  try{
    const prior=JSON.parse(await readFile(lockPath,'utf8'));let alive=true;
    try{process.kill(prior.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
    if(alive)throw new Error('The interactive bot is already running. Use its existing browser window.');
    await unlink(lockPath);
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));await lock.close();
  const portPath=join(profile,'DevToolsActivePort');
  await unlink(portPath).catch(e=>{if(e.code!=='ENOENT')throw e;});
  let browser,child,closed=false;
  const close=async()=>{
    if(closed)return;closed=true;
    if(browser?.isConnected()){
      try{const session=await browser.newBrowserCDPSession();await session.send('Browser.close');}catch{}
      await browser.close().catch(()=>{});
    }else if(child&&child.exitCode===null)child.kill();
    await unlink(lockPath).catch(()=>{});
  };
  try{
    // No windowsHide: for a GUI program it makes Windows create the first
    // browser window hidden, so the game never appears on screen.
    // Edge on a new profile restarts itself and shows sign-in and sync prompts;
    // these switches (as Playwright launches Edge) skip that.
    const edgeArgs=channel==='msedge'?['--edge-skip-compat-layer-relaunch','--disable-sync','--disable-search-engine-choice-screen']:[];
    // Render 1:1 whatever the Windows display scaling: at 125% the page would be
    // drawn at 1.25x and the screenshots scaled back down, which blurs them
    // (3.4x less fine detail measured) and weakens fence and coin detection.
    child=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--no-first-run','--no-default-browser-check',
      '--force-device-scale-factor=1',...edgeArgs,'--window-size=886,780','about:blank'],{stdio:'ignore'});
    let launchError;child.once('error',e=>launchError=e);
    const deadline=Date.now()+15000;let port;
    while(Date.now()<deadline){
      // A browser that hands over to a relaunched process exits early; its
      // successor still writes the DevTools port file, so keep waiting for it.
      if(launchError)throw launchError;
      if(await exists(portPath)){port=Number((await readFile(portPath,'utf8')).split('\n')[0]);if(port>0&&port<65536)break;}
      await sleep(100);
    }
    if(!port)throw new Error(child.exitCode!==null?'Browser closed before the bot connected.':'Timed out connecting to the dedicated game browser.');
    // Public Playwright option: preserve native focus behavior and browser defaults.
    browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true});
    const context=browser.contexts()[0],page=context.pages()[0]||await context.newPage();
    await keepGameTab(page);
    await page.setViewportSize({width:870,height:668});
    return {browser,context,page,close};
  }catch(error){await close();throw error;}
}
