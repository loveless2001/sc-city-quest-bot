// Learned rows predict possible fences. Repeated live low-hurdle observations
// can correct a prediction's type, but never erase a visible hard-fence track.
import {coneForForecast} from './cone-forecast-identity.mjs';
export class ForecastObstacleTypes {
 constructor(){this.confirmedRails=new Map();this.diagnostics=[];}
 update(fences,rails,height,at,cones=[]){
  const horizon=height*225/668,hardHit=1/(height*.75-horizon);
  for(const [id,entry]of this.confirmedRails)if(at>entry.impact+200)this.confirmedRails.delete(id);
  this.diagnostics=[];
  return fences.filter(f=>{
   if(!f.forecast)return true;
   const rail=rails.find(t=>t.hits>=4&&t.lane===f.lane&&t.rate>.000002&&t.rate<.00008&&
    at>=t.seen&&at-t.seen<=200&&Math.abs(t.seen+(t.inverse-hardHit)/t.rate-f.impact)<=60);
   if(rail)this.confirmedRails.set(f.id,{impact:f.impact,railId:rail.id,hits:rail.hits});
   const cone=coneForForecast(f,fences,cones,height,at);
   if(cone)this.confirmedRails.set(f.id,{impact:f.impact,...cone});
   const known=this.confirmedRails.get(f.id);
   if(!known||Math.abs(known.impact-f.impact)>100)return true;
   this.diagnostics.push({id:f.id,lane:f.lane,forecastRow:f.forecastRow,...known});
   return false;
  });
 }
}
