import {PostPilot} from './post-pilot.mjs';

export class AgilePilot extends PostPilot {
  constructor(letters,coins){
    super(letters,coins);
    this.useContinuousCamera=true;
    this.moveDurationMs=60;
    this.crossDurationMs=90;
    this.busyDurationMs=60;
    this.moveCooldownMs=40;
    this.feedbackJump=false;
    this.collectSafeRewards=true;
  }
}
