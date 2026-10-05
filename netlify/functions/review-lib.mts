import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
function store(){return getStore("hercules-reviews",{consistency:"strong"});}
function safeName(name){return String(name||"Hercules user").trim().slice(0,60)||"Hercules user";}
export async function queueOwnerReview(req,subject,profile,routing){
  const reasons=[...new Set((routing?.reasons||[]).map(x=>String(x).slice(0,80)))].slice(0,8);
  if(!routing?.ownerReviewRequired||!reasons.length)return {queued:false,formSubmitted:false,pending:false};
  const fingerprint=createHash("sha256").update([subject,reasons.join(","),(profile?.painAreas||[]).join(","),profile?.professionalRestrictionScope||""].join("|")).digest("hex");
  const reviewId=fingerprint.slice(0,24),key=`review/${reviewId}`,createdAt=new Date().toISOString(),s=store();
  let record=null;try{const raw=await s.get(key,{type:"text"});record=raw?JSON.parse(raw):null}catch{}
  if(!record){record={reviewId,createdAt,updatedAt:createdAt,status:routing.status||"REVIEW_NOTIFY",subjectHash:createHash("sha256").update(String(subject||"")).digest("hex").slice(0,28),client:safeName(profile?.name),module:reasons.includes("ALLERGY_REVIEW")?"NOURISH":"TRAIN",reasons,formSubmitted:false,ownerReviewPending:true};await s.set(key,JSON.stringify(record));}
  if(record.formSubmitted||record.notificationSent)return {queued:true,formSubmitted:true,pending:true,reviewId};
  let submitted=false;
  try{const body=new URLSearchParams({"form-name":"hercules-review",subject:"Hercules review requested",review_id:reviewId,client:record.client,module:record.module,status:record.status,reason:reasons.join(","),created_at:record.createdAt});const response=await fetch(new URL("/",req.url),{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:body.toString(),redirect:"manual"});submitted=response.ok||[301,302,303].includes(response.status)}catch{}
  record={...record,updatedAt:new Date().toISOString(),formSubmitted:submitted,ownerReviewPending:true,submissionAttemptedAt:new Date().toISOString()};try{await s.set(key,JSON.stringify(record))}catch{}
  return {queued:true,formSubmitted:submitted,pending:true,reviewId};
}
