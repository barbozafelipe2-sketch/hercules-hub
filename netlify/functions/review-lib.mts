import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
function store(){return getStore({name:"hercules-reviews",consistency:"strong"});}
function safeName(name){return String(name||"Hercules user").trim().slice(0,60)||"Hercules user";}
export async function queueOwnerReview(req,subject,profile,routing){
  const reasons=[...new Set((routing?.reasons||[]).map(x=>String(x).slice(0,80)))].slice(0,8);
  if(!routing?.ownerReviewRequired||!reasons.length)return {queued:false,notificationSent:false,pending:false};
  const fingerprint=createHash("sha256").update([subject,reasons.join(","),(profile?.painAreas||[]).join(","),profile?.professionalRestrictionScope||""].join("|")).digest("hex");
  const reviewId=fingerprint.slice(0,24),key=`review/${reviewId}`,createdAt=new Date().toISOString(),s=store();
  let record=null;try{const raw=await s.get(key,{type:"text",consistency:"strong"});record=raw?JSON.parse(raw):null}catch{}
  if(!record){record={reviewId,createdAt,updatedAt:createdAt,status:routing.status||"REVIEW_NOTIFY",subjectHash:createHash("sha256").update(String(subject||"")).digest("hex").slice(0,28),client:safeName(profile?.name),module:reasons.includes("ALLERGY_REVIEW")?"NOURISH":"TRAIN",reasons,notificationSent:false};await s.set(key,JSON.stringify(record));}
  if(record.notificationSent)return {queued:true,notificationSent:true,pending:false,reviewId};
  let sent=false;
  try{const body=new URLSearchParams({"form-name":"hercules-review",review_id:reviewId,client:record.client,module:record.module,status:record.status,reason:reasons.join(","),created_at:record.createdAt});const response=await fetch(new URL("/",req.url),{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:body.toString(),redirect:"manual"});sent=response.ok||[301,302,303].includes(response.status)}catch{}
  record={...record,updatedAt:new Date().toISOString(),notificationSent:sent,notificationAttemptedAt:new Date().toISOString()};try{await s.set(key,JSON.stringify(record))}catch{}
  return {queued:true,notificationSent:sent,pending:!sent,reviewId};
}
