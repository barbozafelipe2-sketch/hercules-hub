import { readSession } from "./auth-lib.mts";
import { StateSyncSchema } from "./schemas.mts";
import { dedupeDailyCheckins, dedupeSessionCompletions, milestoneTimeValid, stateCycleWriteAllowed } from "./cycle-lib.mts";
import { safetyRouting } from "./safety-lib.mts";
import { queueOwnerReview } from "./review-lib.mts";
import { readJsonBounded, rateLimit } from "./request-lib.mts";
import { stateDelete, stateLoad, stateSave, supabaseConfig } from "./supabase-lib.mts";
function json(data:unknown,status=200,headers:Record<string,string>={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}})}
function canonicalizeState(state:any,startedAt:string){
  const out=structuredClone(state);out.startedAt=startedAt;out.checkins=dedupeDailyCheckins(out.checkins||[]).slice(0,90);out.completedSessions=dedupeSessionCompletions(out.completedSessions||{});const now=Date.now();
  if(out.baseline&&!milestoneTimeValid("baseline",startedAt,out.baseline,now))out.baseline=null;
  if(out.checkpoint&&!milestoneTimeValid("checkpoint",startedAt,out.checkpoint,now))out.checkpoint=null;
  if(out.finalMark&&!milestoneTimeValid("finalMark",startedAt,out.finalMark,now))out.finalMark=null;
  return out;
}
export default async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const limited=rateLimit(req,"state",180,60_000);if(!limited.allowed)return json({error:"Too many requests"},429,{"Retry-After":String(limited.retryAfter)});
  const session=await readSession(req);if(!session)return json({error:"Device session required"},401);
  let raw:any;try{raw=await readJsonBounded(req,120_000)}catch(e:any){return json({error:e?.message||"Invalid JSON"},Number(e?.status)||400)}
  const action=String(raw?.action||"");
  if(action==="load"){
    try{const data=await stateLoad(session.subject);return json({ok:true,persistent:!!data,data})}catch{return json({ok:false,persistent:false,error:"State storage unavailable"},200)}
  }
  if(action==="reset"){
    try{const c=supabaseConfig();if(c.stateReady){const result=await stateDelete(session.subject);return json({ok:true,...result})}return json({ok:true,deleted:false,reason:"supabase_not_configured"})}catch{return json({ok:false,deleted:false,error:"State reset unavailable"},503)}
  }
  if(action==="reset-progress"){
    try{
      const c=supabaseConfig();if(!c.stateReady)return json({ok:true,persistent:false,state:null,reason:"supabase_not_configured"});
      const existing=await stateLoad(session.subject);if(!existing?.state)return json({ok:false,error:"Authoritative state not found"},409);
      const now=new Date().toISOString(),prior=existing.state||{},cycleNumber=Number(existing.cycle_number||prior.cycleNumber||1);
      const state={...prior,startedAt:now,cycleNumber,week:1,completedExercises:{},completedSessions:{},habits:{},checkins:[],mealWeek:1,mealDay:0,mealSlot:0,baseline:null,checkpoint:null,finalMark:null,nextCycle:null,postWorkout:{pending:false,session:"",mindDone:false},sync:{persistent:true,lastSyncedAt:now}};
      const checked=StateSyncSchema.safeParse({profile:existing.profile??null,plan:existing.plan??null,state,chat:Array.isArray(existing.chat)?existing.chat:[],cycleNumber});if(!checked.success)return json({ok:false,error:"Stored state cannot be safely reset"},409);
      await stateSave(session.subject,checked.data);return json({ok:true,persistent:true,state:checked.data.state,cycleNumber,authoritativeStartedAt:now});
    }catch{return json({ok:false,error:"Progress reset unavailable"},503)}
  }
  if(action==="activate-cycle"){
    try{
      const c=supabaseConfig();if(!c.stateReady)return json({ok:false,error:"Persistent state is required for server-approved cycle activation"},409);
      const existing=await stateLoad(session.subject);if(!existing?.state||!existing?.plan||!existing?.profile)return json({ok:false,error:"Current cycle state is not available"},409);
      const prior=existing.state||{},pending=prior.nextCycle||null,priorCycle=Number(existing.cycle_number||prior.cycleNumber||1),targetCycle=priorCycle+1;
      if(!pending?.nextPlan||pending?.requiresReview===true)return json({ok:false,error:"No approved next month is staged"},409);
      if(Number(pending?.trace?.cycleNumber||0)!==targetCycle)return json({ok:false,error:"Staged next month does not match the expected cycle"},409);
      const now=new Date().toISOString(),targetWeight=String(existing.profile?.targetWeight||"").trim(),finalMark=prior.finalMark||null;
      const carriedBaseline=finalMark?.weight&&targetWeight?{ts:now,height:String(existing.profile?.height||""),weight:String(finalMark.weight),targetWeight,waist:String(finalMark.waist||""),note:"Baseline carried from the prior month final mark."}:null;
      const historyEntry={cycleNumber:priorCycle,startedAt:prior.startedAt||null,endedAt:now,trackedDays:dedupeDailyCheckins(prior.checkins||[]).length,completedSessionCount:Object.values(prior.completedSessions||{}).filter(Boolean).length,completedExerciseCount:Object.values(prior.completedExercises||{}).filter(Boolean).length,baseline:prior.baseline||null,checkpoint:prior.checkpoint||null,finalMark:prior.finalMark||null};
      const traceLab=[...(Array.isArray(prior.traceLab)?prior.traceLab:[]).filter((x:any)=>x?.traceId!==pending?.trace?.traceId),...(pending?.trace?[pending.trace]:[])].slice(-40);
      const state={...prior,startedAt:now,cycleNumber:targetCycle,week:1,nav:"HOME",completedExercises:{},completedSessions:{},habits:{},checkins:[],mealWeek:1,mealDay:0,mealSlot:0,audit:null,baseline:carriedBaseline,checkpoint:null,finalMark:null,nextCycle:null,postWorkout:{pending:false,session:"",mindDone:false},traceLab,cycleHistory:[...(Array.isArray(prior.cycleHistory)?prior.cycleHistory:[]),historyEntry].slice(-120),sync:{persistent:true,lastSyncedAt:now}};
      const checked=StateSyncSchema.safeParse({profile:existing.profile,plan:pending.nextPlan,state,chat:Array.isArray(existing.chat)?existing.chat:[],cycleNumber:targetCycle});if(!checked.success)return json({ok:false,error:"Approved next month failed state validation"},409);
      await stateSave(session.subject,checked.data);return json({ok:true,persistent:true,profile:checked.data.profile,plan:checked.data.plan,state:checked.data.state,cycleNumber:targetCycle,authoritativeStartedAt:now});
    }catch{return json({ok:false,error:"Next month activation unavailable"},503)}
  }
  if(action==="save"){
    const parsed=StateSyncSchema.safeParse(raw?.payload);if(!parsed.success)return json({error:"Invalid state payload"},400);
    try{
      const payload:any=structuredClone(parsed.data),c=supabaseConfig();
      if(c.stateReady){
        const existing=await stateLoad(session.subject),now=new Date().toISOString();const incomingCycle=Number(payload.cycleNumber||payload.state?.cycleNumber||1),priorCycle=Number(existing?.cycle_number||existing?.state?.cycleNumber||1),hasExisting=!!existing?.state;
        if(!stateCycleWriteAllowed(hasExisting,priorCycle,incomingCycle))return json({error:"Cycle changes require approved next-month activation",saved:false},409);
        const startedAt=hasExisting?String(existing.state.startedAt||now):now;
        payload.state=canonicalizeState(payload.state,startedAt);payload.state.cycleNumber=incomingCycle;payload.cycleNumber=incomingCycle;
        if(hasExisting)payload.state.nextCycle=existing.state.nextCycle??null;
        const effectiveProfile=payload.profile||existing?.profile||null,effectivePlan=payload.plan||existing?.plan||null;
        if(effectiveProfile&&effectivePlan){const route=safetyRouting(effectiveProfile),priorRouting=existing?.plan?.reviewRouting||{},latest=payload.state.checkins?.[0]||{},trackPain=latest?.painFlag===true,trackRed=latest?.redFlagSymptom===true||latest?.symptomFlag===true,reasons=[...new Set([...(priorRouting.ownerReviewRequired?priorRouting.reasons||[]:[]),...route.reasons,...(trackPain?["TRACK_PAIN"]:[]),...(trackRed?["TRACK_RED_FLAG"]:[])])],restricted=!!existing?.plan?.trainingHold||route.trainingRestricted||trackRed,ownerReviewRequired=reasons.length>0;effectivePlan.trainingHold=restricted;effectivePlan.risk=restricted?"red":ownerReviewRequired?"yellow":effectivePlan.risk;effectivePlan.reviewRouting={...(effectivePlan.reviewRouting||{}),status:restricted?"RESTRICTED":ownerReviewRequired?"REVIEW_NOTIFY":"CLEAR",trainingRestricted:restricted,ownerReviewRequired,reasons,painAreas:route.painAreas,professionalRestrictionScope:route.professionalRestrictionScope};effectivePlan.training={...effectivePlan.training,reviewRequired:restricted||ownerReviewRequired,painAware:{areas:route.painAreas,reviewStatus:restricted?"RESTRICTED":ownerReviewRequired?"REVIEW_NOTIFY":"CLEAR"}};payload.profile=effectiveProfile;payload.plan=effectivePlan;if(ownerReviewRequired){try{const notice=await queueOwnerReview(req,session.subject,effectiveProfile,effectivePlan.reviewRouting);effectivePlan.reviewRouting.notification=notice}catch{}}}
      } else payload.state.checkins=dedupeDailyCheckins(payload.state.checkins||[]).slice(0,90);
      const result=await stateSave(session.subject,payload);return json({ok:true,...result,profile:payload.profile??null,plan:payload.plan??null,authoritativeStartedAt:payload.state?.startedAt||null,cycleNumber:payload.cycleNumber||payload.state?.cycleNumber||1});
    }catch{return json({ok:false,saved:false,error:"State storage unavailable"},200)}
  }
  if(action==="status"){const c=supabaseConfig();return json({ok:true,supabase:c.stateReady})}
  return json({error:"Invalid action"},400)
};
export const config={path:"/api/state"};
