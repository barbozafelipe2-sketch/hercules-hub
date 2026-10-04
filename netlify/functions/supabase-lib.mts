export function supabaseConfig(){
  const url=Netlify.env.get("SUPABASE_URL")?.replace(/\/$/,"")||"";
  const secret=Netlify.env.get("SUPABASE_SECRET_KEY")||Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  return {url,secret,stateReady:!!(url&&secret)};
}
function adminHeaders(secret:string){
  return secret.startsWith("sb_secret_")?{"apikey":secret}:{"apikey":secret,"Authorization":`Bearer ${secret}`};
}
export async function stateLoad(ownerKey:string){
  const c=supabaseConfig();if(!c.stateReady)return null;
  const q=encodeURIComponent(ownerKey);
  const r=await fetch(`${c.url}/rest/v1/hercules_user_state?select=profile,plan,state,chat,cycle_number,updated_at&owner_key=eq.${q}&limit=1`,{headers:adminHeaders(c.secret)});
  if(r.status===404)return null;const data=await r.json().catch(()=>null);if(!r.ok)throw new Error("state_load_failed");return Array.isArray(data)?data[0]||null:null;
}
export async function stateSave(ownerKey:string,payload:any){
  const c=supabaseConfig();if(!c.stateReady)return {saved:false,reason:"supabase_not_configured"};
  const row={owner_key:ownerKey,profile:payload.profile??null,plan:payload.plan??null,state:payload.state??null,chat:payload.chat??[],cycle_number:Number(payload.cycleNumber||payload.state?.cycleNumber||1),updated_at:new Date().toISOString()};
  const r=await fetch(`${c.url}/rest/v1/hercules_user_state?on_conflict=owner_key`,{method:"POST",headers:{"Content-Type":"application/json",...adminHeaders(c.secret),"Prefer":"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(row)});
  if(!r.ok)throw new Error("state_save_failed");return {saved:true};
}
export async function stateDelete(ownerKey:string){
  const c=supabaseConfig();if(!c.stateReady)return {deleted:false,reason:"supabase_not_configured"};
  const q=encodeURIComponent(ownerKey);
  const r=await fetch(`${c.url}/rest/v1/hercules_user_state?owner_key=eq.${q}`,{method:"DELETE",headers:{...adminHeaders(c.secret),"Prefer":"return=minimal"}});
  if(!r.ok)throw new Error("state_delete_failed");return {deleted:true};
}
