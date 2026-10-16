// Fence and pickup ETAs already account for expected processing and input delay.
// Express the remaining movement lock in that same future coordinate system.
// Both the previous and next key use the same input-delay estimate, which
// cancels here. Schedule the route against this exact send clock, rather than
// silently shifting it by the current frame's actual processing duration.
export function planningClock({now,lastMove,busyDuration,processing,enabled}) {
  const sendClock=enabled?now+processing:undefined;
  return {sendClock,busy:Math.max(0,lastMove+busyDuration-(sendClock??now))};
}
