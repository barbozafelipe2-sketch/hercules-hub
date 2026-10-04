import { readSession } from "./auth-lib.mts";
import { StateSyncSchema } from "./schemas.mts";
import { dedupeDailyCheckins, milestoneTimeValid } from "./cycle-lib.mts";
import { readJsonBounded, rateLimit } from "./request-lib.mts";
import { stateDelete, stateLoad, stateSave, supabaseConfig } from "./supabase-lib.mts";
function json(data:unknown,status=200,headers:Record<string,string>={}){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}})}
function canonicalizeState(state:any,startedAt:string){
  const out=structuredClone(state);out.startedAt=startedAt;out.checkins=dedupeDailyCheckins(out.checkins||[]).slice(0,90);const now=Date.now();
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
  if(action==="save"){
    const parsed=StateSyncSchema.safeParse(raw?.payload);if(!parsed.success)return json({error:"Invalid state payload"},400);
    try{
      const payload:any=structuredClone(parsed.data),c=supabaseConfig();
      if(c.stateReady){
        const existing=await stateLoad(session.subject),now=new Date().toISOString();const incomingCycle=Number(payload.cycleNumber||payload.state?.cycleNumber||1);let startedAt=now;
        if(existing?.state){const priorCycle=Number(existing.cycle_number||existing.state?.cycleNumber||1);if(incomingCycle<priorCycle||incomingCycle>priorCycle+1)return json({error:"Invalid or stale cycle transition",saved:false},409);startedAt=incomingCycle===priorCycle?String(existing.state.startedAt||now):now}
        payload.state=canonicalizeState(payload.state,startedAt);payload.state.cycleNumber=incomingCycle;payload.cycleNumber=incomingCycle;
      } else payload.state.checkins=dedupeDailyCheckins(payload.state.checkins||[]).slice(0,90);
      const result=await stateSave(session.subject,payload);return json({ok:true,...result,authoritativeStartedAt:payload.state?.startedAt||null,cycleNumber:payload.cycleNumber||payload.state?.cycleNumber||1});
    }catch{return json({ok:false,saved:false,error:"State storage unavailable"},200)}
  }
  if(action==="status"){const c=supabaseConfig();return json({ok:true,supabase:c.stateReady})}
  return json({error:"Invalid action"},400)
};
export const config={path:"/api/state"};
