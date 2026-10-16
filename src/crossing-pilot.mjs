import {TemporalPilot} from './temporal-pilot.mjs';
import {BarrierForecast} from './barrier-forecast.mjs';
import {ForecastObstacleTypes} from './forecast-obstacle-types.mjs';

export class CrossingPilot extends TemporalPilot {
  resumeAfterPuzzle(){
    super.resumeAfterPuzzle();
    this.wordClock?.pause();
    this.forecastTypes=null;
    // A puzzle pauses the road clock. If encountered during this stage, fall
    // back to live vision instead of guessing how long that pause lasted.
    if(this.barrierForecast&&this.barrierForecast.origin!==null){
      this.barrierForecast.disabled=true;this.barrierForecast.active=false;
      this.barrierForecast.diagnostics={active:false,disabled:true,reason:'Puzzle paused the road clock'};
    }
  }
  updateTracks(fences,h,now){
    const tracks=super.updateTracks(fences,h,now);
    if(!this.forecastModel)return tracks;
    if(!this.barrierForecast)this.barrierForecast=new BarrierForecast(this.forecastModel,{weakMatch:this.forecastWeakMatch});
    const late=/B\u1ee9t ph\u00e1/.test(this.stageText);
    const forecast=this.barrierForecast.update(tracks,now,late);
    if(!late)this.forecastTypes=null;
    if(!late||!this.useForecastTypes)return forecast;
    this.forecastTypes??=new ForecastObstacleTypes();
    return this.forecastTypes.update(forecast,this.railTracker?.tracks||[],h,now,this.correctConeForecasts?this.occludedConeTracker?.tracks||[]:[]);
  }
  analyse(frame,now=Date.now()){
    const decision=super.analyse(frame,now);
    if(this.wordClock)decision.wordClock=this.wordClock.diagnostics;
    if(this.barrierForecast)decision.forecastStatus=this.barrierForecast.diagnostics;
    if(this.fenceFrameAge)decision.fenceFrameAge=this.fenceFrameAge.diagnostics;
    if(this.keepRailIdentity)decision.rejectedKnownRails=this.rejectedKnownRails||[];
    if(this.forecastTypes)decision.forecastTypeCorrections=this.forecastTypes.diagnostics;
    if(this.rejectNewPassedPartials)decision.rejectedPassedPartials=this.rejectedPassedPartials||[];
    return decision;
  }
  constructor(letters,coins){
    super(letters,coins);
    this.moveDurationMs=120;
    this.crossDurationMs=180;
    this.busyDurationMs=120;
    this.moveCooldownMs=80;
    this.middleOccupiedMs=140;
    this.destinationStartMs=60;
    this.hopInputMs=60;
    this.lateFeedbackJump=true;
    this.jumpRetryMs=70;
  }
}
