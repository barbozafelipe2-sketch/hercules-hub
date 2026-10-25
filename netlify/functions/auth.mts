import { makeDeviceSession, normalizeDeviceId, readSession, sessionCookie } from "./auth-lib.mts";
import { loginAccount } from "./accounts-lib.mts";
import { readJsonBounded, rateLimit } from "./request-lib.mts";
function json(data: unknown, status=200, headers: Record<string,string>={}) { return new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}}); }
export default async (req: Request) => {
  if(req.method === "GET") { const s=await readSession(req); return json({authenticated:!!s,provider:s?.provider||null,accountId:s?.accountId||null,profileId:s?.profileId||null}); }
  if(req.method !== "POST") return json({error:"Method not allowed"},405);
  const rl=rateLimit(req,"auth:bootstrap",20,15*60_000);if(!rl.allowed)return json({error:"Too many requests"},429,{"Retry-After":String(rl.retryAfter)});
  let body:any; try { body=await readJsonBounded(req,4_000); } catch(e:any) { return json({error:e?.message||"Invalid JSON"},Number(e?.status)||400); }
  const action=String(body?.action||"");
  if(action === "login") {
    const loginLimit=rateLimit(req,"auth:login",8,15*60_000);if(!loginLimit.allowed)return json({error:"Too many login attempts"},429,{"Retry-After":String(loginLimit.retryAfter)});
    try{
      const session=await loginAccount({email:body?.email,password:body?.password});
      return json({ok:true,provider:"account",accountId:session.accountId,profileId:session.profileId},200,{"Set-Cookie":sessionCookie(req,session.token,30*24*60*60)});
    }catch(error:any){
      if(["email_invalid","credentials_invalid","account_not_active"].includes(String(error?.message)))return json({error:"Email or password invalid"},401);
      if(String(error?.message)==="profile_unavailable")return json({error:"Account profile unavailable"},403);
      return json({error:"Account authentication unavailable"},503);
    }
  }
  if(action === "bootstrap") {
    try{
      const deviceId=normalizeDeviceId(String(body?.deviceId||""));
      const token=await makeDeviceSession(deviceId);
      return json({ok:true,provider:"device"},200,{"Set-Cookie":sessionCookie(req,token)});
    }catch{return json({error:"Invalid device session request"},400)}
  }
  return json({error:"Invalid action"},400);
};
export const config={path:"/api/auth"};
