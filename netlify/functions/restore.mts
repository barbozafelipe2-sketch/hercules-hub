import { readSession } from "./auth-lib.mts";
import { RestoreDataSchema, RestoreRequestSchema, StateSyncSchema } from "./schemas.mts";
import { readJsonBounded, rateLimit } from "./request-lib.mts";
import { stateSave, supabaseConfig } from "./supabase-lib.mts";
import { dedupeDailyCheckins } from "./cycle-lib.mts";

function json(data:unknown,status=200,headers:Record<string,string>={}){
  return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
}
async function sha256(text:string){
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function decodeBase64Url(value:string){
  const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
  const padded=normalized+"=".repeat((4-normalized.length%4)%4);
  return Buffer.from(padded,"base64").toString("utf8");
}

export default async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const limited=rateLimit(req,"restore",8,60*60_000);if(!limited.allowed)return json({error:"Too many restore attempts"},429,{"Retry-After":String(limited.retryAfter)});
  const session=await readSession(req);if(!session)return json({error:"Device session required"},401);
  let raw:any;try{raw=await readJsonBounded(req,650_000)}catch(e:any){return json({error:e?.message||"Invalid JSON"},Number(e?.status)||400)}
  const wrapper=RestoreRequestSchema.safeParse(raw);if(!wrapper.success)return json({error:"Invalid Hercules backup",details:wrapper.error.issues.map(x=>x.path.join(".")).slice(0,8)},400);
  const expected=`sha256:${await sha256(wrapper.data.data)}`;
  if(expected!==wrapper.data.integrity)return json({error:"Backup integrity check failed"},400);
  let decoded:any;try{decoded=JSON.parse(decodeBase64Url(wrapper.data.data))}catch{return json({error:"Backup payload could not be decoded"},400)}
  const restored=RestoreDataSchema.safeParse(decoded);if(!restored.success)return json({error:"Backup content is incomplete or incompatible",details:restored.error.issues.map(x=>x.path.join(".")).slice(0,8)},400);
  const data=structuredClone(restored.data);
  data.state.checkins=dedupeDailyCheckins(data.state.checkins||[]).slice(0,90);
  data.state.cycleNumber=data.cycleNumber;
  data.profile.language=data.language;
  data.plan.summary.language=data.language;
  const sync=StateSyncSchema.safeParse({profile:data.profile,plan:data.plan,state:data.state,chat:data.chat,cycleNumber:data.cycleNumber});
  if(!sync.success)return json({error:"Backup failed state validation"},400);
  let persisted=false;
  try{if(supabaseConfig().stateReady){await stateSave(session.subject,sync.data);persisted=true}}catch{}
  return json({ok:true,restored:{...sync.data,language:data.language},persisted,sourceVersion:wrapper.data.appVersion,exportedAt:wrapper.data.exportedAt});
};
export const config={path:"/api/restore"};
