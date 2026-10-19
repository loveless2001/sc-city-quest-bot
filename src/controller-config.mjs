import {readFile} from 'node:fs/promises';
import {CompactPilot,AdaptivePilot,DefensivePilot} from './compact-pilot.mjs';
import {TrackedPilot} from './tracked-pilot.mjs';
import {CalibratedPilot} from './calibrated-pilot.mjs';
import {RowPilot} from './row-pilot.mjs';
import {PostPilot} from './post-pilot.mjs';
import {AgilePilot} from './agile-pilot.mjs';
import {TemporalPilot} from './temporal-pilot.mjs';
import {CrossingPilot} from './crossing-pilot.mjs';
export async function createConfiguredPilot(argv){
 const args=new Set(argv);
  const ModelPilot=args.has('--crossing')?CrossingPilot:args.has('--temporal')?TemporalPilot:args.has('--agile')?AgilePilot:args.has('--posts')?PostPilot:args.has('--rows')?RowPilot:CalibratedPilot;
  const pilot=args.has('--calibrated')||args.has('--rows')||args.has('--posts')||args.has('--agile')||args.has('--temporal')||args.has('--crossing')?new ModelPilot(
    JSON.parse(await readFile(new URL('./letter-model.json',import.meta.url),'utf8')),
    JSON.parse(await readFile(new URL('./coin-model.json',import.meta.url),'utf8'))):
    args.has('--tracked')?new TrackedPilot():args.has('--defensive')?new DefensivePilot():args.has('--adaptive')?new AdaptivePilot():new CompactPilot();
  const clearance=argv.find(a=>a.startsWith('--clearance='));
  if(clearance)pilot.afterMs=Number(clearance.split('=')[1]);
  const collisionAfter=argv.find(a=>a.startsWith('--collision-after='));
  if(collisionAfter)pilot.collisionAfterMs=Number(collisionAfter.split('=')[1]);
  if(args.has('--late-jumps'))pilot.lateFeedbackJump=true;
  if(args.has('--separate-close-fences'))pilot.separateCloseFences=true;
  if(args.has('--all-feedback-jumps'))pilot.feedbackJump=true;
  if(args.has('--hazard-only-early-jumps'))pilot.hazardOnlyEarlyJumps=true;
  // Jump only for a tracked cone the route cannot avoid, in every stage: barriers
  // ('rail') cannot be jumped in the game, and the crossing pilot's own late-stage
  // jumps (every 170 ms in Bứt phá) are turned off.
  if(args.has('--jump-cones-only')){pilot.jumpConesOnly=true;pilot.lateFeedbackJump=false;pilot.feedbackJump=false;}
  if(args.has('--phase-aligned-jumps'))pilot.phaseAlignedJumps=true;
  if(args.has('--early-rails'))pilot.earlyRails=true;
  if(args.has('--late-safe-detours'))pilot.lateSafeDetourMs=350;
  if(args.has('--protect-paired-deadline'))pilot.protectPairedDeadline=true;
  if(args.has('--mature-speed-prior'))pilot.matureSpeedPrior=true;
  if(args.has('--barrier-forecast'))pilot.forecastModel=JSON.parse(await readFile(new URL(args.has('--forecast-extend')?'./barrier-forecast-extended-model.json':'./barrier-forecast-model.json',import.meta.url),'utf8'));
  if(args.has('--forecast-fine-grid'))pilot.forecastFineGrid=true;
  if(args.has('--forecast-weak-match'))pilot.forecastWeakMatch=true;
  if(args.has('--recover-fence-frame-age'))pilot.recoverFenceFrameAge=true;
  const earlySoftCost=argv.find(a=>a.startsWith('--early-soft-cost='));
  if(earlySoftCost)pilot.earlySoftCostScale=Math.max(0,Math.min(.8,Number(earlySoftCost.split('=')[1])));
  if(args.has('--paired-keyboard')||args.has('--immediate-keyboard'))pilot.observeCommandDuration=ms=>{
    if(ms>=0&&ms<400)pilot.inputMs=.8*pilot.inputMs+.2*Math.max(1,ms);
  };
  if(args.has('--conservative-adjacent'))pilot.lateAdjacentSourceMs=100;
  if(args.has('--conservative-crossing')){pilot.lateCrossSourceMs=85;pilot.lateMiddleOccupiedMs=160;}
  if(args.has('--balanced-soft-cost'))pilot.lateSoftCostScale=.1;
  const lateBefore=argv.find(a=>a.startsWith('--late-collision-before='));
  if(lateBefore)pilot.lateCollisionBeforeMs=Math.max(45,Math.min(150,Number(lateBefore.split('=')[1])));
  const lateDetour=argv.find(a=>a.startsWith('--late-detour-ms='));
  if(lateDetour)pilot.lateSafeDetourMs=Math.max(0,Math.min(700,Number(lateDetour.split('=')[1])));
  if(args.has('--ground-letters'))pilot.groundLetters=true;
  if(args.has('--strict-posts'))pilot.strictPostGeometry=true;
  if(args.has('--keep-rail-identity'))pilot.keepRailIdentity=true;
  if(args.has('--forecast-obstacle-types'))pilot.useForecastTypes=true;
  if(args.has('--correct-cone-forecasts'))pilot.correctConeForecasts=true;
  if(args.has('--same-lane-frame-age'))pilot.sameLaneFrameAge=true;
  if(args.has('--far-pickups'))pilot.farPickups=true;
  if(args.has('--public-word-clock'))pilot.publicWordClock=true;
  if(args.has('--current-game-rewards'))pilot.publicRewardValues=true;
  if(args.has('--reject-new-passed-partials'))pilot.rejectNewPassedPartials=true;
  if(args.has('--occlusion-memory'))pilot.occlusionMemory=true;
  if(args.has('--occluded-posts'))pilot.occludedPosts=true;
  if(args.has('--collection-history'))pilot.collectionHistory=true;
  if(args.has('--stable-runner'))pilot.stableRunner=true;
  if(args.has('--bonus-pickups'))pilot.collectBonuses=true;
  if(args.has('--remember-gifts'))pilot.rememberGifts=true;
  if(args.has('--ground-green-pickups'))pilot.groundGreenPickups=true;
  const greenValue=argv.find(a=>a.startsWith('--green-value='));
  if(greenValue)pilot.greenPickupValue=Math.max(5,Math.min(100,Number(greenValue.split('=')[1])));
  // Planning value of a word-race letter (default 180 with --letter-streaks, else
  // 25). The 2026-10-17 game update made letters worth 4x (40/120/200, word +800,
  // wrong lane -80): --letter-value=720 keeps the streak weighting at that scale.
  const letterValue=argv.find(a=>a.startsWith('--letter-value='));
  if(letterValue)pilot.letterPickupValue=Math.max(5,Math.min(2000,Number(letterValue.split('=')[1])));
  if(args.has('--consistent-plan-clock'))pilot.usePlanningClock=true;
  if(args.has('--time-scaled-clearance'))pilot.timeScaledClearance=true;
  if(args.has('--staggered-clearance'))pilot.staggeredClearance=true;
  if(args.has('--occluded-gap-escape'))pilot.occludedGapEscape=true;
  if(args.has('--far-orbit-coins'))pilot.farOrbitCoins=true;
  // 2026-10-17: all three location medals (medals.mjs) and navy coins from the
  // final-stage coin detector as pickups.
  if(args.has('--location-medals'))pilot.locationMedals=true;
  if(args.has('--navy-coins'))pilot.navyCoins=true;
  if(args.has('--opening-white-coins'))pilot.openingWhiteCoins=true;
  if(args.has('--pickup-entry-credit'))pilot.pickupEntryCredit=true;
  if(args.has('--source-pickup-credit'))pilot.sourcePickupCreditMs=30;
  if(args.has('--gift-pickups'))pilot.giftModel=JSON.parse(await readFile(new URL('./gift-model.json',import.meta.url),'utf8'));
  if(args.has('--timed-collection'))pilot.timedCollection=true;
  if(args.has('--soft-cones')||args.has('--occluded-cones'))pilot.coneModel=JSON.parse(await readFile(new URL('./cone-model.json',import.meta.url),'utf8'));
  if(args.has('--occluded-cones'))pilot.rememberCones=true;
  if(args.has('--early-cones'))pilot.earlyConeModel=JSON.parse(await readFile(new URL('./early-cone-model.json',import.meta.url),'utf8'));
  if(args.has('--logo-coins'))pilot.logoCoinModel=JSON.parse(await readFile(new URL('./white-logo-model.json',import.meta.url),'utf8'));
  if(args.has('--global-fence-matching'))pilot.globalFenceMatching=true;
  if(args.has('--confirm-occluded-fences'))pilot.confirmOccludedFences=true;
  if(args.has('--bounded-fence-motion'))pilot.boundFenceMotion=true;
  if(args.has('--shared-fence-speed'))pilot.sharedFenceSpeed=true;
  if(args.has('--letter-streaks'))pilot.prioritizeLetterStreaks=true;
  if(args.has('--orbit-coins'))pilot.orbitCoinModel=JSON.parse(await readFile(new URL('./orbit-coin-model.json',import.meta.url),'utf8'));
  if(args.has('--early-orbit-coins')){
    pilot.orbitCoinModel=JSON.parse(await readFile(new URL('./orbit-coin-model.json',import.meta.url),'utf8'));
    pilot.earlyOnlyOrbits=true;
  }
  if(args.has('--soft-rails'))pilot.avoidRails=true;
  const railImpact=argv.find(a=>a.startsWith('--rail-impact='));
  if(railImpact)pilot.railImpactPixels=Number(railImpact.split('=')[1]);
  if(args.has('--deadline-rewards'))pilot.deadlineRewards=true;
  if(args.has('--verified-white-coins')||args.has('--deadline-rewards'))pilot.verifiedWhiteCoins=true;
  const middleStart=argv.find(a=>a.startsWith('--middle-start='));
  if(middleStart)pilot.middleStartMs=Number(middleStart.split('=')[1]);
  if(args.has('--physical-occupancy')){
    pilot.sourceOccupiedMs=60;pilot.adjacentEntryMs=20;pilot.middleStartMs=20;pilot.middleOccupiedMs=130;
  }
  const commitAhead=argv.find(a=>a.startsWith('--commit-ahead='));
  if(commitAhead)pilot.commitAheadMs=Number(commitAhead.split('=')[1]);

 return pilot;
}
