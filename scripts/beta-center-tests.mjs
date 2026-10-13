import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
const src=fs.readFileSync(new URL('../public/beta-center.js',import.meta.url),'utf8');
const backend=fs.readFileSync(new URL('../netlify/functions/beta-feedback.mts',import.meta.url),'utf8');
const local=new Map();
const fields={},root={innerHTML:''},settings={querySelector:()=>null,insertAdjacentHTML(){}};
let lastRequest=null,apiFails=false;
const valid={category:'bug',message:'Tap on food button had no effect',language:'en-US',screen:'NOURISH',appVersion:'0.14.1'};
const mockReceipt={ok:true,receipt:'00000000-0000-4000-a000-000000000001',month:'2026-10',eraseToken:'00000000-0000-4000-a000-000000000002'};
const ctx={lang:'en-US',state:{nav:'HOME'},APP_VERSION:'0.14.1',L:(p,e,s)=>e,
 $:s=>s==='#betaContent'?root:s==='#settingsRows'?settings:fields[s]||null,
 closeOverlay(){},openOverlay(){},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
 window:{confirm:()=>true},navigator:{clipboard:{async writeText(){}}},
 api:async(path,payload)=>{lastRequest={path,payload};if(apiFails)throw Error('Offline');return payload.action==='erase'?{ok:true,erased:true}:mockReceipt},console};
vm.createContext(ctx);vm.runInContext(src,ctx);
let n=0;const check=(name,fn)=>{fn();n++;console.log('PASS '+name)};
check('BUG report payload uses strict compact fields',()=>assert.deepEqual(Object.keys(ctx.betaFeedbackPayload('bug','The grocery button does not respond')).sort(),['appVersion','category','language','message','screen'].sort()));
check('profile identity not automatically included',()=>assert.equal(Object.prototype.hasOwnProperty.call(ctx.betaFeedbackPayload('idea','Please add a weekend reminder'),'profile'),false));
check('only explicit message recorded',()=>assert.equal(ctx.betaFeedbackPayload('idea','  A long enough user report  ').message,'A long enough user report'));
check('minimum length enforced',()=>assert.throws(()=>ctx.betaFeedbackPayload('bug','Too short')));
check('maximum length enforced',()=>assert.throws(()=>ctx.betaFeedbackPayload('bug','a'.repeat(801))));
check('illegal category rejected',()=>assert.throws(()=>ctx.betaFeedbackPayload('sensitive','This is sufficiently long text')));
check('invalid navigation falls back to HOME',()=>assert.equal(ctx.betaFeedbackPayload('bug','This is sufficiently long text','en-US','ROOT').screen,'HOME'));
check('unsupported language falls back to EN',()=>assert.equal(ctx.betaFeedbackPayload('bug','This is sufficiently long text','xx','HOME').language,'en-US'));
check('Spanish localized copy visible',()=>assert.ok(src.includes('No incluyas nombres')));
check('no automatic health telemetry',()=>assert.ok(!/getDeviceId\(|getCurrentPosition\(|profile\.weight|state\.checkins/.test(src)));
check('client blocks obvious email',()=>assert.throws(()=>ctx.betaFeedbackPayload('bug','Contact me at name@example.com for issue')));
check('client blocks obvious contact phone',()=>assert.throws(()=>ctx.betaFeedbackPayload('bug','My number is 305-555-0199 call')));
check('local erasure receipt is private and minimal',()=>{ctx.betaRememberReceipt(mockReceipt);const r=ctx.betaLastReceipt();assert.equal(r.receipt,mockReceipt.receipt);assert.equal(Object.hasOwn(r,'message'),false)});
await (async()=>{
  ctx.betaRememberReceipt(mockReceipt);const ok=await ctx.betaEraseLastReceipt();
  check('erasure is opt in and clears local receipt only on success',()=>assert.equal(ok,true));
  check('erasure endpoint includes capability but not health state',()=>assert.deepEqual(Object.keys(lastRequest.payload).sort(),['action','month','receipt','eraseToken'].sort()));
  check('successful erasure removes local secret',()=>assert.equal(ctx.betaLastReceipt(),null));
})();
// Execute actual server handler body with mocked services and browser-compatible crypto.
let runnable=stripTypeScriptTypes(backend).replace(/^import\s+.*?;\s*$/gm,'').replace('export default async function betaFeedback','async function betaFeedback').replace('export const config=','const config=')+'\nglobalThis.__exports={betaFeedback,config}';
const records=new Map();let storageFail=false,authenticated=true,allowed=true;
const store={
 async setJSON(key,value,opts){if(storageFail)throw Error('storage offline');records.set(key,{...value,_options:opts})},
 async get(key){if(storageFail)throw Error('storage offline');const v=records.get(key);if(!v)return null;const { _options,...record}=v;return record},
 async delete(key){if(storageFail)throw Error('storage offline');records.delete(key)}
};
let uuidCounter=0;
const cryptoMock={randomUUID:()=> '00000000-0000-4000-a000-'+String(++uuidCounter).padStart(12,'0'),subtle:webcrypto.subtle};
const apiCtx={getStore:()=>store,readSession:async()=>authenticated,rateLimit:()=>({allowed,retryAfter:60}),readJsonBounded:async req=>req.payload,crypto:cryptoMock,
 Date,Response,Set,Object,String,Number,JSON,TextEncoder};
vm.createContext(apiCtx);vm.runInContext(runnable,apiCtx);
const handler=apiCtx.__exports.betaFeedback;
async function test(name,fn){await fn();n++;console.log('PASS '+name)}
await test('server route is private /api/beta-feedback',()=>assert.equal(apiCtx.__exports.config.path,'/api/beta-feedback'));
await test('server method restricted to POST',async()=>assert.equal((await handler({method:'GET'})).status,405));
await test('server checks rate limit',async()=>{allowed=false;assert.equal((await handler({method:'POST',payload:valid})).status,429);allowed=true});
await test('server requires signed device session',async()=>{authenticated=false;assert.equal((await handler({method:'POST',payload:valid})).status,401);authenticated=true});
await test('server rejects unexpected profile fields',async()=>assert.equal((await handler({method:'POST',payload:{...valid,profile:{name:'DO NOT STORE'}}})).status,400));
await test('server rejects very short messages',async()=>assert.equal((await handler({method:'POST',payload:{...valid,message:'short'}})).status,400));
await test('server rejects invalid category',async()=>assert.equal((await handler({method:'POST',payload:{...valid,category:'admin'}})).status,400));
await test('server rejects accidental email',async()=>assert.equal((await handler({method:'POST',payload:{...valid,message:'Contact user@example.com with the report'}})).status,422));
await test('server rejects accidental phone number',async()=>assert.equal((await handler({method:'POST',payload:{...valid,message:'Please call 305-555-0199 this evening'}})).status,422));
const receipt=await(await handler({method:'POST',payload:valid})).json();
await test('successful write returns one-time erasure capability',()=>{assert.ok(receipt.ok&&receipt.receipt&&receipt.eraseToken&&receipt.month)});
const key=`reports/${receipt.month}/${receipt.receipt}`;
await test('server stores only whitelisted fields + hashed erase credential',()=>assert.deepEqual(Object.keys(records.get(key)).sort(),['receivedAt','category','message','language','screen','appVersion','eraseDigest','_options'].sort()));
await test('append-only intake enabled',()=>assert.equal(records.get(key)._options.onlyIfNew,true));
await test('erasure token never stored in plain text',()=>assert.equal(records.get(key).eraseToken,undefined));
await test('bad receipt capability cannot delete someone else report',async()=>{const r=await handler({method:'POST',payload:{action:'erase',month:receipt.month,receipt:receipt.receipt,eraseToken:'00000000-0000-4000-a000-999999999999'}});assert.equal(r.status,404);assert.equal(records.has(key),true)});
await test('unauthorized erasure denied',async()=>{authenticated=false;const r=await handler({method:'POST',payload:{action:'erase',month:receipt.month,receipt:receipt.receipt,eraseToken:receipt.eraseToken}});assert.equal(r.status,401);authenticated=true});
await test('wrong erasure form cannot list reports',async()=>{const r=await handler({method:'POST',payload:{action:'erase',month:'../../',receipt:receipt.receipt,eraseToken:receipt.eraseToken}});assert.equal(r.status,400)});
await test('valid erasure credential deletes its own report',async()=>{const r=await handler({method:'POST',payload:{action:'erase',month:receipt.month,receipt:receipt.receipt,eraseToken:receipt.eraseToken}});assert.equal(r.status,200);assert.equal(records.has(key),false)});
await test('repeat deletion does not falsely claim success',async()=>{const r=await handler({method:'POST',payload:{action:'erase',month:receipt.month,receipt:receipt.receipt,eraseToken:receipt.eraseToken}});assert.equal(r.status,404)});
await test('storage outage returns 503 and no false receipt',async()=>{storageFail=true;const r=await handler({method:'POST',payload:valid});assert.equal(r.status,503);storageFail=false});
await test('no public listing endpoint',()=>assert.equal(backend.includes('.list('),false));
console.log(`beta-center ${n}/${n} PASS`);
