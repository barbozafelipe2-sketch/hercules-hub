import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";

function quotaStore(){return getStore({name:"hercules-usage",consistency:"strong"});}
function keyFor(subject:string,scope:string){
  const day=new Date().toISOString().slice(0,10),id=createHash("sha256").update(subject).digest("hex").slice(0,28);
  return `quota/${day}/${id}/${scope}`;
}
export async function consumeDailyQuota(subject:string,scope:string,limit:number){
  if(!subject||limit<1)return {allowed:false,remaining:0,persistent:false};
  try{
    const s=quotaStore(),key=keyFor(subject,scope);
    const raw=await s.get(key,{type:"text",consistency:"strong"});
    const prior=raw?JSON.parse(raw):{count:0};
    const count=Math.max(0,Number(prior?.count||0));
    if(count>=limit)return {allowed:false,remaining:0,persistent:true};
    const next=count+1;await s.set(key,JSON.stringify({count:next,updatedAt:new Date().toISOString()}));
    return {allowed:true,remaining:Math.max(0,limit-next),persistent:true};
  }catch{
    // Per-IP in-memory rate limits remain the safety fallback if Blobs is unavailable.
    return {allowed:true,remaining:null,persistent:false};
  }
}
