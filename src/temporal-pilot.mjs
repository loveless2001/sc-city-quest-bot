import {AgilePilot} from './agile-pilot.mjs';

export class TemporalPilot extends AgilePilot {
  constructor(letters,coins){
    super(letters,coins);
    // Fitted from visible fence-base trajectories, not internal game state.
    this.trackHorizon=225/668;
    this.fitDirectTime=true;
  }
}
