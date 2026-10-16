// A two-lane escape can be represented as two consecutive adjacent moves.
// Keep their inputs together once the first starts, even across a new frame.
export function routeGroups(route,{clock,horizon,events,hopInputMs=60,atomic=false}){
  const groups=[];
  for(const move of route.slice(0,3)){
    if(move.at>horizon)break;
    const key=move.to<move.from?'ArrowLeft':'ArrowRight',distance=Math.abs(move.to-move.from);
    const previous=groups.at(-1);
    if(atomic&&distance===1&&previous?.commands.length===1&&previous.to===move.from
      &&previous.commands[0].key===key&&move.at-previous.moveAt<=180){
      previous.commands.push({key,offset:move.at-previous.moveAt});previous.to=move.to;continue;
    }
    groups.push({at:clock+move.at,from:move.from,to:move.to,moveAt:move.at,events,
      commands:Array.from({length:distance},(_,n)=>({key,offset:n*hopInputMs}))});
  }
  return groups;
}
