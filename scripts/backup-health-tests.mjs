import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../public/backup-health.js',import.meta.url),'utf8');
const local=new Map();
const ui={status:{remove(){},insertAdjacentHTML(p,s){ui.html=s}},section:{textContent:'DATA & RECOVERY',insertAdjacentHTML(p,s){ui.html=s}}};
let warned='';let allowRestore=true;
const ctx={profile:{name:'Test',primaryGoal:'strength'},plan:{version:'1',trainingHold:false},state:{startedAt:'2026-09-01',checkins:[],nav:'HOME',sync:{persistent:false,lastSyncedAt:''}},chat:[],
 $:s=>s==='#settingsRows'?{querySelector:x=>null,querySelectorAll:x=>[ui.section],insertAdjacentHTML:(p,s)=>ui.html=s}:null,
 localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
 L:(p,e,s)=>e,lang:'en-US',locale:()=> 'en-US',esc:x=>String(x),
 window:{confirm:s=>{warned=s;return allowRestore}},console,Date,JSON,Math};
vm.createContext(ctx);vm.runInContext(src,ctx);
let n=0;function check(name,fn){fn();n++;console.log('PASS '+name)}
check('new device starts with no export',()=>assert.equal(ctx.backupStatusModel().kind,'no-export'));
check('snapshot includes profile',()=>assert.match(ctx.backupSnapshotString(),/"name":"Test"/));
check('snapshot includes plan',()=>assert.match(ctx.backupSnapshotString(),/"version":"1"/));
check('snapshot includes tracking',()=>assert.match(ctx.backupSnapshotString(),/"checkins":\[\]/));
check('marker created by export initiation',()=>{ctx.backupMarkExportRequested();assert.ok(local.has('hh_proto_backup_export_marker_v1'))});
check('export marked as attempted, never as saved',()=>assert.equal(ctx.backupStatusModel().kind,'attempted'));
check('clear UX says verify PDF was saved',()=>assert.match(ui.html,/Check that the PDF was saved/));
check('navigation changes do not trigger false dirty',()=>{ctx.state.nav='TRACK';assert.equal(ctx.backupStatusModel().changed,false)});
check('menu navigation changes do not trigger false dirty',()=>{ctx.state.mealDay=3;ctx.state.mealWeek=4;ctx.state.mealSlot=1;assert.equal(ctx.backupStatusModel().changed,false)});
check('sync timestamp does not trigger false dirty',()=>{ctx.state.sync={persistent:true,lastSyncedAt:'2026-10-09'};assert.equal(ctx.backupStatusModel().changed,false)});
check('new check-in correctly marks progress changed',()=>{ctx.state.checkins.push({energy:3});assert.equal(ctx.backupStatusModel().kind,'changed')});
check('change message recommends new PDF',()=>{ctx.renderBackupStatus();assert.match(ui.html,/Create an updated PDF/)});
check('updated export clears changed marker',()=>{ctx.backupMarkExportRequested();assert.equal(ctx.backupStatusModel().kind,'attempted')});
check('plan mutation marks dirty',()=>{ctx.plan.trainingHold=true;assert.equal(ctx.backupStatusModel().changed,true)});
check('profile mutation marks dirty',()=>{ctx.backupMarkExportRequested();ctx.profile.primaryGoal='general_fitness';assert.equal(ctx.backupStatusModel().changed,true)});
check('old marker format rejected',()=>{local.set('hh_proto_backup_export_marker_v1','{bad json');assert.equal(ctx.backupReadMarker(),null)});
check('restore cancels before server overwrite',()=>{allowRestore=false;assert.equal(ctx.confirmBackupRestore(),false);assert.match(warned,/may replace its synced copy/)});
check('restore approval can proceed',()=>{allowRestore=true;assert.equal(ctx.confirmBackupRestore(),true)});
check('first-launch restore has no overwrite confirm',()=>{ctx.profile=null;allowRestore=false;assert.equal(ctx.confirmBackupRestore(),true)});
check('post-restore marker erased',()=>{ctx.profile={name:'Test'};ctx.backupMarkExportRequested();ctx.backupMarkRestoreCompleted();assert.equal(ctx.backupStatusModel().kind,'no-export')});
check('all status strings are localized through L()',()=>assert.ok(src.includes('Ninguna exportación')&&src.includes('Exporta el estado actual')));
check('no cryptographic trust attributed to UI marker',()=>assert.match(src,/NOT an integrity\/authentication checksum/));
console.log(`backup-health ${n}/${n} PASS`);
