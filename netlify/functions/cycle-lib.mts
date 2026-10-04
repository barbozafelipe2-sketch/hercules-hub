export type TrackCheckin = {
  ts:string;
  dayKey?:string;
  energy:number;
  sleep:number;
  training:number;
  nutrition:number;
  symptomFlag?:boolean;
  note?:string;
};

export type CycleSignals = {
  elapsedDays:number;
  lastWeekComplete:boolean;
  baseline:any;
  checkpoint:any;
  finalMark:any;
  checkinDays:number;
  avgEnergy:number|null;
  avgSleep:number|null;
  avgTraining:number|null;
  avgNutrition:number|null;
  symptomFlag:boolean;
  completedSessions:number;
  plannedSessions:number;
  trainingCompletion:number;
  cycleSummary:any;
  recentNotes:string[];
  priorCycles:number;
};

export type NextCycleDelta = {
  trainingAction:"hold"|"consolidate"|"maintain"|"progress";
  nutritionAction:"simplify"|"maintain"|"rotate";
  recoveryAction:"prioritize"|"maintain";
  mindAction:"simplify"|"maintain";
  evidence:string[];
  unknowns:string[];
};

export function dayKey(value:string|Date){
  const d=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(d.getTime()))return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

export function dedupeDailyCheckins(rows:any[]):TrackCheckin[]{
  const sorted=(Array.isArray(rows)?rows:[]).filter(Boolean).slice().sort((a,b)=>Date.parse(String(b?.ts||""))-Date.parse(String(a?.ts||"")));
  const seen=new Set<string>(),out:TrackCheckin[]=[];
  for(const row of sorted){
    const explicit=/^\d{4}-\d{2}-\d{2}$/.test(String(row?.dayKey||""))?String(row.dayKey):"";
    const k=explicit||dayKey(String(row?.ts||""));
    if(!k||seen.has(k))continue;
    const vals=["energy","sleep","training","nutrition"].map(x=>Number(row?.[x]));
    if(vals.some(v=>!Number.isFinite(v)||v<1||v>5))continue;
    seen.add(k);
    out.push({ts:String(row.ts),dayKey:k,energy:vals[0],sleep:vals[1],training:vals[2],nutrition:vals[3],symptomFlag:row?.symptomFlag===true,note:String(row?.note||"").slice(0,1200)});
  }
  return out;
}

export function milestoneComplete(type:"baseline"|"checkpoint"|"finalMark",record:any){
  if(!record||!Number.isFinite(Date.parse(String(record.ts||""))))return false;
  const weight=String(record.weight||"").trim();
  if(!weight)return false;
  if(type==="baseline"&&!String(record.targetWeight||"").trim())return false;
  return true;
}

export function daysSince(iso:string,now=Date.now()){
  const t=Date.parse(String(iso||""));
  return Number.isFinite(t)?Math.floor((now-t)/86400000):-1;
}

export function milestoneTimeValid(type:"baseline"|"checkpoint"|"finalMark",startedAt:string,record:any,now=Date.now()){
  if(!milestoneComplete(type,record))return false;
  const start=Date.parse(String(startedAt||"")),ts=Date.parse(String(record?.ts||""));
  if(!Number.isFinite(start)||!Number.isFinite(ts))return false;
  // Five-minute clock-skew tolerance only; future-dated milestones cannot satisfy gates.
  if(ts>now+5*60*1000)return false;
  const min=type==="finalMark"?start+28*86400000:type==="checkpoint"?start+15*86400000:start-86400000;
  return ts>=min;
}

export function week4Complete(state:any,pattern:string[]){
  const done=state?.completedSessions||{};
  return pattern.length>0&&pattern.every(p=>Object.entries(done).some(([k,v])=>v===true&&String(k).startsWith("w4:")&&String(k).endsWith(`:${p}`)));
}

function average(rows:TrackCheckin[],key:keyof Pick<TrackCheckin,"energy"|"sleep"|"training"|"nutrition">){
  const vals=rows.map(x=>Number(x[key])).filter(Number.isFinite);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}

export function buildSignals(state:any,currentPlan:any,cycleSummary:any,elapsedOverride?:number):CycleSignals{
  const checkins=dedupeDailyCheckins(state?.checkins||[]).slice(0,45);
  const pattern=Array.isArray(currentPlan?.training?.pattern)?currentPlan.training.pattern:[];
  const completed=Object.values(state?.completedSessions||{}).filter(Boolean).length;
  const planned=Math.max(0,pattern.length*4);
  const trainingCompletion=planned?Math.min(100,Math.round(completed/planned*100)):0;
  return {
    elapsedDays:Number.isFinite(elapsedOverride)?Number(elapsedOverride):daysSince(String(state?.startedAt||"")),
    lastWeekComplete:week4Complete(state,pattern),
    baseline:state?.baseline||null,
    checkpoint:state?.checkpoint||null,
    finalMark:state?.finalMark||null,
    checkinDays:checkins.length,
    avgEnergy:average(checkins,"energy"),
    avgSleep:average(checkins,"sleep"),
    avgTraining:average(checkins,"training"),
    avgNutrition:average(checkins,"nutrition"),
    symptomFlag:checkins.some(x=>x.symptomFlag===true),
    completedSessions:completed,
    plannedSessions:planned,
    trainingCompletion,
    cycleSummary:cycleSummary||{},
    recentNotes:checkins.map(x=>String(x.note||"").trim()).filter(Boolean).slice(0,12),
    priorCycles:Array.isArray(state?.cycleHistory)?state.cycleHistory.length:Math.max(0,Number(state?.cycleNumber||1)-1)
  };
}

export function deterministicDelta(signals:CycleSignals,currentPlan:any):NextCycleDelta{
  const unknowns:string[]=[];
  for(const [label,val] of [["energy",signals.avgEnergy],["sleep",signals.avgSleep],["training",signals.avgTraining],["nutrition",signals.avgNutrition]] as const){if(val===null)unknowns.push(label)}
  if(!signals.checkinDays)unknowns.push("daily_tracking");
  if(!milestoneComplete("checkpoint",signals.checkpoint))unknowns.push("day15_checkpoint");
  const evidence:string[]=[`training_completion=${signals.trainingCompletion}%`,`tracked_days=${signals.checkinDays}`];
  if(signals.avgEnergy!==null)evidence.push(`avg_energy=${signals.avgEnergy.toFixed(2)}/5`);
  if(signals.avgSleep!==null)evidence.push(`avg_sleep=${signals.avgSleep.toFixed(2)}/5`);
  if(signals.avgTraining!==null)evidence.push(`avg_training=${signals.avgTraining.toFixed(2)}/5`);
  if(signals.avgNutrition!==null)evidence.push(`avg_nutrition=${signals.avgNutrition.toFixed(2)}/5`);
  if(signals.symptomFlag)evidence.push("explicit_concerning_symptom=true");

  let trainingAction:NextCycleDelta["trainingAction"]="maintain";
  if(currentPlan?.trainingHold||signals.symptomFlag)trainingAction="hold";
  else if(signals.trainingCompletion<60||(signals.avgTraining!==null&&signals.avgTraining<2.6)||(signals.avgEnergy!==null&&signals.avgEnergy<2.6)||(signals.avgSleep!==null&&signals.avgSleep<2.6))trainingAction="consolidate";
  else if(signals.trainingCompletion>=80&&signals.avgTraining!==null&&signals.avgTraining>=3.4&&signals.avgEnergy!==null&&signals.avgEnergy>=3&&signals.avgSleep!==null&&signals.avgSleep>=3)trainingAction="progress";

  let nutritionAction:NextCycleDelta["nutritionAction"]="maintain";
  if(signals.avgNutrition!==null&&signals.avgNutrition<2.6)nutritionAction="simplify";
  else if(signals.avgNutrition!==null&&signals.avgNutrition>=3.2&&signals.checkinDays>=7)nutritionAction="rotate";

  const recoveryAction:NextCycleDelta["recoveryAction"]=(signals.avgEnergy!==null&&signals.avgEnergy<2.8)||(signals.avgSleep!==null&&signals.avgSleep<2.8)?"prioritize":"maintain";
  const mindAction:NextCycleDelta["mindAction"]=(signals.avgTraining!==null&&signals.avgTraining<2.6)?"simplify":"maintain";
  return {trainingAction,nutritionAction,recoveryAction,mindAction,evidence,unknowns:[...new Set(unknowns)]};
}

export function clampDelta(input:any,fallback:NextCycleDelta):NextCycleDelta{
  const trainingRank={hold:0,consolidate:1,maintain:2,progress:3} as const;
  const nutritionRank={simplify:0,maintain:1,rotate:2} as const;
  const recoveryRank={prioritize:0,maintain:1} as const;
  const mindRank={simplify:0,maintain:1} as const;
  const bounded=<T extends string>(candidate:any,base:T,ranks:Record<string,number>):T=>{
    const c=String(candidate||"");
    return Object.hasOwn(ranks,c)&&ranks[c]<=ranks[base]?c as T:base;
  };
  const extraUnknowns=Array.isArray(input?.unknowns)?input.unknowns.map((x:any)=>String(x).slice(0,100)).slice(0,12):[];
  return {
    // AI may make a candidate more conservative, never more aggressive than deterministic evidence permits.
    trainingAction:bounded(input?.trainingAction,fallback.trainingAction,trainingRank),
    nutritionAction:bounded(input?.nutritionAction,fallback.nutritionAction,nutritionRank),
    recoveryAction:bounded(input?.recoveryAction,fallback.recoveryAction,recoveryRank),
    mindAction:bounded(input?.mindAction,fallback.mindAction,mindRank),
    // Evidence is deterministic/input-derived only. Model-written evidence never becomes canonical evidence.
    evidence:[...fallback.evidence],
    unknowns:[...new Set([...fallback.unknowns,...extraUnknowns])].slice(0,12)
  };
}

export function validateDelta(delta:NextCycleDelta,signals:CycleSignals,currentPlan:any){
  const issues:string[]=[];
  if((currentPlan?.trainingHold||signals.symptomFlag)&&delta.trainingAction!=="hold")issues.push("Active safety HOLD/symptom cannot produce a non-HOLD training action.");
  if(delta.trainingAction==="progress"){
    if(signals.trainingCompletion<80)issues.push("Progress requires >=80% training completion.");
    if(signals.avgTraining===null||signals.avgTraining<3.4)issues.push("Progress requires explicit training feedback >=3.4/5.");
    if(signals.avgEnergy===null||signals.avgEnergy<3)issues.push("Progress requires explicit energy feedback >=3/5.");
    if(signals.avgSleep===null||signals.avgSleep<3)issues.push("Progress requires explicit sleep feedback >=3/5.");
  }
  if(delta.nutritionAction==="rotate"&&(signals.avgNutrition===null||signals.avgNutrition<3.2||signals.checkinDays<7))issues.push("Nutrition rotation requires >=7 tracked days and nutrition feedback >=3.2/5.");
  return {ok:issues.length===0,issues};
}

export function applyDelta(currentPlan:any,delta:NextCycleDelta,profile:any,state:any){
  const next=structuredClone(currentPlan);
  const cycle=Number(state?.cycleNumber||1)+1;
  next.version=`${currentPlan.version}-cycle-${cycle}`;
  next.createdAt=new Date().toISOString();
  const progressionByAction:Record<NextCycleDelta["trainingAction"],string[]>={
    hold:["TRAIN remains REVIEW/HOLD until the safety issue is appropriately resolved.","No automatic load or volume progression.","Preserve prior anchors only as reference, not clearance.","Qualified review or explicit safe resolution is required before affected progression."],
    consolidate:["Repeat comfortable loads and rebuild consistent execution; do not chase load increases.","Prioritize clean reps and a minimum viable session when needed.","Progress reps only when technique and recovery remain stable.","Consolidate the month and reassess from explicit TRACK feedback."],
    maintain:["Keep successful anchor movements and comparable loading.","Add reps within the existing range before increasing load.","Use only purposeful accessory variation when it improves fit or equipment practicality.","Consolidate successful work and use the final week as a performance check."],
    progress:["Keep anchor movements and progress reps within the prescribed range.","When the top of the rep range is achieved with target effort, use a small load increase next exposure.","Preserve technique and target effort; do not turn progression into maximal testing.","Consolidate the new working level and reassess using explicit TRACK data."]
  };
  const currentSets=Math.max(2,Math.min(4,Number(next.training?.sets||2)));
  const nextSets=delta.trainingAction==="consolidate"?2:delta.trainingAction==="progress"&&profile?.level!=="beginner"&&Number(profile?.minutes||0)>=45?Math.min(4,currentSets+1):currentSets;
  next.training={...next.training,sets:nextSets,progression:progressionByAction[delta.trainingAction],reviewRequired:delta.trainingAction==="hold"||!!currentPlan.trainingHold,adaptiveDesign:{cycle,preserveCoreAnchors:true,accessoryRotation:delta.trainingAction==="progress"?"purposeful":delta.trainingAction==="consolidate"?"minimal":"bounded",volumePolicy:delta.trainingAction,workingSetTarget:nextSets}};
  next.trainingHold=delta.trainingAction==="hold"||!!currentPlan.trainingHold;
  if(next.trainingHold)next.risk="red";
  const nutritionNote=delta.nutritionAction==="simplify"?"Simplify meal structure, reuse practical components, and reduce preparation friction while preserving the user's restrictions and selected preferences.":delta.nutritionAction==="rotate"?"Increase week-to-week meal rotation inside the user's selected proteins, carb bases, vegetables and cooking styles while preserving meal roles.":"Maintain the current practical rotation and substitutions; change only where explicit feedback supports it.";
  next.nutrition={...next.nutrition,rotationSeed:cycle,adaptation:delta.nutritionAction,adaptationNote:nutritionNote,optimizer:{cycle,ingredientReuse:profile.mealPrepPreference==="batch_cook"||delta.nutritionAction==="simplify"?"high":profile.mealPrepPreference==="fresh_daily"?"low":"balanced",variety:delta.nutritionAction==="rotate"?"high":profile.mealPrepPreference==="fresh_daily"?"high":"balanced"},preferenceSnapshot:{proteins:profile.proteinPreferences,grains:profile.grainPreferences,vegetables:profile.veggiePreferences,openToOtherVeggies:profile.openToOtherVeggies,styles:profile.foodStyles,mealPrep:profile.mealPrepPreference,eatOut:profile.eatOutFrequency}};
  next.recover={...next.recover,cycleFocus:delta.recoveryAction};
  next.mind={...next.mind,cycleFocus:delta.mindAction};
  next.evolve={...next.evolve,mode:"validated-adaptive-cycles",materialChangesAutomatic:true,safetyReleaseAutomatic:false};
  next.adaptation={version:"cycle-delta-v0.14.0",cycle,delta,evidencePolicy:"explicit-structured+bounded-notes",coreExerciseAnchorsChanged:false,catalogMayExpand:true};
  return next;
}
