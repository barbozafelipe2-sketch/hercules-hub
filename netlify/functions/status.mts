import { readSession } from "./auth-lib.mts";
import { availableProviders, aiRuntimeStatus, providerStatus } from "./ai-lib.mts";
import { supabaseConfig } from "./supabase-lib.mts";
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
export default async(req:Request)=>{
  if(req.method!=="GET")return json({error:"Method not allowed"},405);
  const s=await readSession(req);if(!s)return json({error:"Device session required"},401);
  const c=supabaseConfig(),routes=providerStatus(),runtime=aiRuntimeStatus();
  return json({aiProviders:availableProviders(),aiRoutes:routes,netlifyGateway:runtime.gatewayPresent,gatewayOnly:runtime.gatewayOnly,directAIAllowed:runtime.directAIAllowed,supabaseState:c.stateReady,sessionProvider:s.provider});
};
export const config={path:"/api/status"};
