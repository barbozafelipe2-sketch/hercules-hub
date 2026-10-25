import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const src=fs.readFileSync(new URL('../public/backup-health.js',import.meta.url),'utf8');
const appSrc=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const local=new Map();const ui={html:''};
let confirmResponse=true,confirmation='',wrapper=null,parseCalls=0;
const ctx={
 profile:{name:'Current athlete'},plan:{summary:{meals:3}},state:{checkins:[],sync:{persistent:false}},chat:[],
 localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
 $:s=>s==='#settingsRows'?{querySelector:()=>null,querySelectorAll:()=>[],insertAdjacentHTML:(pos,html)=>ui.html=html}:null,
 L:(pt,en,es)=>en,locale:()=> 'en-US',esc:x=>String(x),Date,JSON,Math,console,
 parseBackupFromFile:()=>{parseCalls++;return wrapper},
 sha256Text:async str=>createHash('sha256').update(str).digest('hex'),
 b64UrlToUtf8:txt=>Buffer.from(txt.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'),
 window:{confirm:txt=>{confirmation=txt;return confirmResponse}}
};
vm.createContext(ctx);vm.runInContext(src,ctx);
const record={language:'en-US',profile:{profileId:'7b68dc67-b340-4e4e-9e11-ae26002ef08c',name:'Restored Test',language:'en-US',primaryGoal:'general_fitness',level:'beginner',days:['Mon','Tue','Wed'],location:'home',minutes:'30',meals:'3',cooking:'basic',sleep:'7',stress:'3',currentPain:'no',redFlags:'no',professionalRestrictions:'no'},plan:{version:'0.14.1',createdAt:'2026-10-01T12:00:00Z',risk:'green',trainingHold:false,allergyReview:false,summary:{goal:'General fitness',strengthDays:3,selectedDays:['Mon','Tue','Wed'],minutes:30,location:'home',meals:3,level:'beginner',language:'en-US'},training:{pattern:['fullA','fullB'],sets:3,splitReason:'test',progression:['a','b','c','d'],reviewRequired:false},nutrition:{reviewRequired:false,weeks:4,meals:3,slotPolicy:'role-stable',principles:['balanced']},recover:{sleep:'7',stress:3},mind:{focus:'steady'},track:{signals:['sessions']},evolve:{mode:'reviewable',materialChangesAutomatic:false,safetyReleaseAutomatic:false}},state:{startedAt:'2026-10-01T12:00:00Z',cycleNumber:2,checkins:[{ts:'2026-10-01T12:00:00Z',energy:3,sleep:3,training:3,nutrition:3}],completedSessions:{},completedExercises:{},habits:{},cycleHistory:[],traceLab:[]},chat:[],cycleNumber:2};
function makeWrapper(input=record){const data=Buffer.from(JSON.stringify(input)).toString('base64url');return {schema:'hercules-backup-v1',appVersion:'0.14.1',exportedAt:'2026-10-08T12:00:00.000Z',data,integrity:'sha256:'+createHash('sha256').update(data).digest('hex')}}
const stubFile={name:'Hercules-Test.pdf',type:'application/pdf'};
let n=0;async function check(name,fn){await fn();n++;console.log('PASS '+name)}
await check('preflight validates genuine portable payload',async()=>{wrapper=makeWrapper();const r=await ctx.backupInspectRestore(stubFile,new Uint8Array());assert.equal(r.summary.cycle,2);assert.equal(r.summary.name,'Restored Test')});
await check('preview count is from actual data',async()=>assert.equal((await ctx.backupInspectRestore(stubFile,new Uint8Array())).summary.checkins,1));
await check('preview includes export timestamp and source language',async()=>{const r=await ctx.backupInspectRestore(stubFile,new Uint8Array());assert.equal(r.summary.language,'en-US');assert.equal(r.summary.exportedAt,'2026-10-08T12:00:00.000Z')});
await check('profile ID is preserved and legacy backups remain importable',async()=>{const r=await ctx.backupInspectRestore(stubFile,new Uint8Array());assert.equal(r.data.profile.profileId,'7b68dc67-b340-4e4e-9e11-ae26002ef08c');const old={...record,profile:{...record.profile}};delete old.profile.profileId;wrapper=makeWrapper(old);assert.equal((await ctx.backupInspectRestore(stubFile,new Uint8Array())).data.profile.profileId,undefined);wrapper=makeWrapper()});
await check('tampered payload rejected before any server call',async()=>{wrapper={...makeWrapper(),data:'BOGUS'+makeWrapper().data};await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('tampered hash rejected',async()=>{wrapper={...makeWrapper(),integrity:'sha256:'+'a'.repeat(64)};await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('invalid schema rejected',async()=>{wrapper={...makeWrapper(),schema:'other-backup'};await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('missing plan rejected',async()=>{wrapper=makeWrapper({...record,plan:null});await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('invalid language rejected',async()=>{wrapper=makeWrapper({...record,language:'secret'});await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('invalid cycle rejected',async()=>{wrapper=makeWrapper({...record,cycleNumber:-7});await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('broken timestamp rejected',async()=>{wrapper={...makeWrapper(),exportedAt:'not a date'};await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('canceling preview confirmation stops requested overwrite',async()=>{wrapper=makeWrapper();const r=await ctx.backupInspectRestore(stubFile,new Uint8Array());confirmResponse=false;assert.equal(ctx.confirmBackupRestore(r),false);assert.match(confirmation,/Cycle 2/)});
await check('existing profile replacement is explicit and identity preserved',async()=>{confirmResponse=true;const r=await ctx.backupInspectRestore(stubFile,new Uint8Array());assert.equal(ctx.confirmBackupRestore(r),true);assert.match(confirmation,/profile ID.*preserved/i)});
await check('first launch also confirms restored identity',async()=>{ctx.profile=null;confirmResponse=false;const r=await ctx.backupInspectRestore(stubFile,new Uint8Array());assert.equal(ctx.confirmBackupRestore(r),false);assert.match(confirmation,/Import this backup/)});
await check('old non-preview confirm remains safe on first launch',async()=>assert.equal(ctx.confirmBackupRestore(),true));
await check('corrupt backup never fabricates summary',async()=>{wrapper=null;await assert.rejects(()=>ctx.backupInspectRestore(stubFile,new Uint8Array()))});
await check('preview work is local and never writes a server state',async()=>assert.equal(src.includes("api('/api/restore'"),false));
await check('restore commits locally without requiring the restore API',async()=>{assert.doesNotMatch(appSrc,/api\('\/api\/restore'/);assert.match(appSrc,/const inspected=await backupInspectRestore/);assert.match(appSrc,/writeRestoreSnapshot\(snapshot\)/);assert.match(appSrc,/hh_restore_sync_pending_v1/)});
await check('PDF export indicator remains neutral after attempted download',async()=>{ctx.profile={name:'Current athlete'};ctx.backupMarkExportRequested();assert.match(ui.html,/EXPORT STARTED/);assert.match(ui.html,/pill neutral/)});
await check('no file is presented as proven downloaded',async()=>assert.match(ui.html,/Check that the PDF was saved/));
console.log(`backup-preview ${n}/${n} PASS`);
