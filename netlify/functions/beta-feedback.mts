// Private, minimal opt-in beta reports, with user-held erasure capability.
// Never accept profile, health state, media uploads or unauthenticated reads.
import {getStore} from '@netlify/blobs';
import {readSession} from './auth-lib.mts';
import {readJsonBounded,rateLimit} from './request-lib.mts';

const TYPES=new Set(['bug','confusing','idea','praise']);
const LANGUAGES=new Set(['pt-BR','en-US','es']);
const SCREENS=new Set(['HOME','TRAIN','NOURISH','RECOVER','MIND','TRACK','EVOLVE']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
const POSSIBLY_IDENTIFYING=/(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?\d[\d\s().-]{8,}\d)\b|\b\d{3}[- ]?\d{2}[- ]?\d{4}\b)/i;
function json(body:unknown,status=200,headers:Record<string,string>={}){
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
}
async function digest(value:string){
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function onlyKeys(raw:any,keys:string[]){
  return raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).every(k=>keys.includes(k));
}
export default async function betaFeedback(req:Request){
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  const limit=rateLimit(req,'beta-feedback',10,60*60_000);
  if(!limit.allowed)return json({error:'Too many feedback requests'},429,{'Retry-After':String(limit.retryAfter)});
  if(!await readSession(req))return json({error:'Device session required'},401);
  let raw:any;
  try{raw=await readJsonBounded(req,3500)}catch(e:any){return json({error:'Invalid request'},Number(e?.status)||400)}
  const store=getStore('hercules-beta-feedback');
  if(raw?.action==='erase'){
    if(!onlyKeys(raw,['action','month','receipt','eraseToken'])||!MONTH.test(String(raw.month))||
       !UUID.test(String(raw.receipt))||!UUID.test(String(raw.eraseToken)))return json({error:'Invalid erasure request'},400);
    const key=`reports/${raw.month}/${raw.receipt}`;
    try{
      const record:any=await store.get(key,{type:'json'});
      if(!record?.eraseDigest||record.eraseDigest!==await digest(raw.eraseToken))return json({error:'Receipt not found or invalid erasure token'},404);
      await store.delete(key);
      return json({ok:true,erased:true},200);
    }catch{return json({error:'Could not confirm deletion'},503)}
  }
  if(!onlyKeys(raw,['category','message','language','screen','appVersion']))return json({error:'Unexpected fields'},400);
  if(!TYPES.has(raw.category)||typeof raw.message!=='string'||raw.message.trim().length<15||raw.message.trim().length>800)return json({error:'Invalid feedback'},400);
  if(POSSIBLY_IDENTIFYING.test(raw.message))return json({error:'Remove contact numbers or email addresses before sending'},422);
  if(!LANGUAGES.has(raw.language)||!SCREENS.has(raw.screen)||typeof raw.appVersion!=='string'||!/^[0-9.\-a-z]{1,20}$/i.test(raw.appVersion))return json({error:'Invalid metadata'},400);
  const now=new Date(),receipt=crypto.randomUUID(),eraseToken=crypto.randomUUID();
  const month=`${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;
  const key=`reports/${month}/${receipt}`;
  const record={receivedAt:now.toISOString(),category:raw.category,message:raw.message.trim(),language:raw.language,screen:raw.screen,appVersion:raw.appVersion,eraseDigest:await digest(eraseToken)};
  try{await store.setJSON(key,record,{onlyIfNew:true})}
  catch{return json({error:'Feedback storage unavailable; not received'},503)}
  // Erasure token is only given to the sender; never saved verbatim server-side.
  return json({ok:true,receipt,month,eraseToken},201);
}
export const config={path:'/api/beta-feedback',rateLimit:{action:'rate_limit',aggregateBy:'ip',windowSize:60,windowLimit:4}};
