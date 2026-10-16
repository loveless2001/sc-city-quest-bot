// A due key can fire after analysis but before route replacement. A plan
// computed from the previous lane must not cancel the escape already queued
// for that newly started movement. Re-evaluate from the next screenshot.
export function commitRoute(scheduler,groups,snapshot,current,guard=true) {
  const stale=guard&&(snapshot.commandLane!==current.commandLane||snapshot.lastMove!==current.lastMove);
  return {accepted:!stale&&scheduler.replace(groups),stale};
}
