// Final-stage route planner for the current public bundle. Obstacles are given
// by distance and lateral centre at the moment the runner reaches them, so
// sliding fences are handled by their predicted position. Plans must clear every
// obstacle under each assumed distance error; coins add value.
export const LANES=[-2.75,0,2.75];
const BODY_HALF_X=0.25,COIN_RADIUS=0.5;
// Coin position uncertainty (m) used to credit coins; see plan(). Tracked coin
// positions are within ~0.4 m (median) and ~1 m (p90) at decision distance.
export let COIN_MARGIN=1;
export const setCoinMargin=v=>{COIN_MARGIN=v;};
// The game removes coins within 20 m of an obstacle's spawn lane, so a tracked
// coin that close to a static (non-sliding) obstacle in its lane is a false
// detection; drop it (17 m leaves room for distance error).
export let DROP_BLOCKED_COINS=true;
export const setDropBlockedCoins=v=>{DROP_BLOCKED_COINS=v;};
const ease=s=>1-Math.pow(1-s,3);
export const laneDuration=speed=>(500+(150-500)*Math.min(Math.max((speed-20)/30,0),1))/1000;
export const halfDepth=speed=>0.15+(0.5-0.15)*Math.max(0,(speed-20)/30);
export function xAt(state){
  if(!state.tween)return LANES[state.target];
  const s=Math.min(state.tween.t/state.tween.d,1);
  return state.tween.from+(state.tween.to-state.tween.from)*ease(s);
}
function press(state,key,speed){
  const target=key==='L'?Math.min(2,state.target+1):Math.max(0,state.target-1);
  if(target===state.target)return false;
  const x=xAt(state);state.target=target;state.tween={from:x,to:LANES[target],t:0,d:laneDuration(speed)};
  return true;
}
const ACTIONS=[[],['L'],['R'],['L','L'],['R','R']];

/**
 * plan({z,target,tween,obstacles,coins,speedAt,margin,horizon,decisionEvery,width})
 * obstacles: [{z, x, halfX, halfZ, cost}] cost Infinity = fatal, else penalty points.
 * coins: [{lane, z, value}]
 */
export function plan({z,target,tween=null,obstacles,coins,speedAt,margin=2,horizon=60,dt=1/60,
  decisionEvery=2,width=140,zLimit=Infinity,allowInterrupt=false,coinMargin=null}){
  const margins=margin?[-margin,0,margin]:[0];
  const zEnd=Math.min(z+horizon,zLimit);
  if(zEnd<=z)return {presses:[],value:0,safe:true,endTarget:target};
  const obs=obstacles.filter(o=>o.z>z-4&&o.z<zEnd+4);
  // Coins are credited over their own (smaller) position uncertainty; the
  // obstacle margins stay as they are. With a sliding fence in view, coins are
  // credited over the obstacle margins as before, so coin value cannot pull a
  // route closer to a slider.
  const sliding=obs.some(o=>o.sliding&&o.cost===Infinity);
  const cm=coinMargin??(sliding?margin:COIN_MARGIN??margin),coinMargins=cm?[-cm,0,cm]:[0];
  const coinList=coins.filter(c=>c.z>z-3&&c.z<zEnd+2&&!(DROP_BLOCKED_COINS&&obs.some(o=>!o.sliding&&!o.box&&o.best!==false&&Math.abs(o.x-LANES[c.lane])<1.4&&Math.abs(o.z-c.z)<17)));
  let beam=[{target,tween:tween&&{...tween},z,frame:0,presses:[],taken:new Map(),value:0,hits:new Set()}];
  while(beam[0].z<zEnd){
    const next=[];
    for(const st of beam){
      const acts=st.frame%decisionEvery===0?ACTIONS:[[]];
      for(const a of acts){
        // Do not interrupt a lane change in progress (a late key would shift the
        // whole following path) unless no other route exists; a double press is
        // one atomic action.
        if(a.length&&st.tween&&!allowInterrupt)continue;
        if(a.length===2&&((a[0]==='L'&&st.target!==0)||(a[0]==='R'&&st.target!==2)))continue;
        const n={target:st.target,tween:st.tween&&{...st.tween},z:st.z,frame:st.frame+1,presses:st.presses,taken:st.taken,value:st.value,hits:st.hits};
        const speed=speedAt(n.z);
        let ok=true;for(const k of a)if(!press(n,k,speed)){ok=false;break;}
        if(!ok)continue;
        if(a.length)n.presses=[...st.presses,...a.map(key=>({key,z:st.z}))];
        n.z+=speed*dt;
        if(n.tween){n.tween.t+=dt;if(n.tween.t>=n.tween.d)n.tween=null;}
        const x=xAt(n),hd=halfDepth(speed),pad=speed*dt;
        const bx0=Math.min(x,LANES[n.target])-BODY_HALF_X,bx1=Math.max(x,LANES[n.target])+BODY_HALF_X;
        let dead=false;
        for(const o of obs){
          let touching=false;
          for(const m of margins){if(Math.abs(n.z+m-o.z)<hd+o.halfZ+pad){touching=true;break;}}
          if(!touching)continue;
          if(bx1>o.x-o.halfX&&bx0<o.x+o.halfX){
            if(o.cost===Infinity){dead=true;break;}
            if(!n.hits.has(o)){if(n.hits===st.hits)n.hits=new Set(st.hits);n.hits.add(o);n.value-=o.cost;}
          }else if(o.softClear&&!n.hits.has(o)){
            // Narrow pass beside a fence: pay in proportion to the missing clearance.
            const clear=Math.max(o.x-o.halfX-bx1,bx0-(o.x+o.halfX));
            if(clear<o.softClear){if(n.hits===st.hits)n.hits=new Set(st.hits);n.hits.add(o);n.value-=o.softCost*(1-clear/o.softClear);}
          }
        }
        if(dead)continue;
        for(const c of coinList){
          const cx=LANES[c.lane],px=Math.min(Math.max(cx,bx0),bx1);if(Math.abs(cx-px)>=COIN_RADIUS)continue;
          const lim=Math.sqrt(COIN_RADIUS**2-(cx-px)**2)+hd;
          let mask=n.taken.get(c)||0,changed=false;
          coinMargins.forEach((m,i)=>{if(!(mask&(1<<i))&&Math.abs(n.z+m-c.z)<lim){mask|=1<<i;changed=true;}});
          if(changed){if(n.taken===st.taken)n.taken=new Map(st.taken);
            const bits=v=>{let k=0;for(let i=0;i<coinMargins.length;i++)if(v&(1<<i))k++;return k;};
            const before=n.taken.get(c)||0;n.taken.set(c,mask);
            n.value+=c.value*(bits(mask)-bits(before))/coinMargins.length;}
        }
        n.score=n.value-n.presses.length*0.5;
        next.push(n);
      }
    }
    if(!next.length)return {presses:[],value:-Infinity,safe:false};
    const best=new Map();
    for(const s of next){
      const key=`${s.target}|${s.tween?Math.round(s.tween.from*4)+':'+Math.round(s.tween.t/s.tween.d*6):'-'}`;
      const b=best.get(key);if(!b||s.score>b.score)best.set(key,s);}
    beam=[...best.values()].sort((a,b)=>b.score-a.score).slice(0,width);
  }
  const top=beam[0];
  return {presses:top.presses,value:top.value,safe:true,endTarget:top.target};
}

// Requested margin first, then narrower, so a tight spot still yields the safest route.
export function planRobust(options,factors=[1,0.7,0.45,0.2,0]){
  for(const f of factors){
    const r=plan({...options,margin:options.margin*f});
    if(r.safe)return {...r,margin:options.margin*f};
  }
  return {presses:[],value:-Infinity,safe:false,margin:null};
}

// Never end without a route, and never stop avoiding a fence that is likely
// there. Relax step by step:
//   1 sliding fences at their measured width (narrow passes allowed),
//   2 only the most likely explanation of each row is fatal; the alternatives
//     are very expensive instead,
//   3 also allow re-pressing during a lane change,
//   4 only the next 20 m,
//   5 nothing fatal: the cheapest set of hits.
export const ALT_COST=2500,LAST_RESORT_COST=20000;
const THIN=1.614+0.05;
export function planWithFallbacks(options){
  const thin=o=>({...o,obstacles:o.obstacles.map(b=>b.cost===Infinity?{...b,halfX:Math.min(b.halfX,THIN)}:b)});
  const bestOnly=o=>({...o,obstacles:o.obstacles.map(b=>b.cost===Infinity&&b.best===false?{...b,cost:ALT_COST}:b)});
  const steps=[
    [o=>o,[1,0.7,0.45,0.2,0]],
    [o=>thin(o),[1,0.45,0]],
    [o=>bestOnly(thin(o)),[1,0.45,0]],
    [o=>({...bestOnly(thin(o)),allowInterrupt:true}),[1,0.45,0]],
    [o=>({...bestOnly(thin(o)),allowInterrupt:true,horizon:20}),[0.45,0]],
    [o=>({...thin(o),allowInterrupt:true,horizon:20,obstacles:thin(o).obstacles.map(b=>b.cost===Infinity?{...b,cost:b.best===false?ALT_COST:LAST_RESORT_COST}:b)}),[0]],
  ];
  for(let i=0;i<steps.length;i++){const [f,m]=steps[i];const r=planRobust(f(options),m);if(r.safe)return {...r,fallback:i};}
  return {presses:[],value:-Infinity,safe:false,margin:null,fallback:steps.length};
}
