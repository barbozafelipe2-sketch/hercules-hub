import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ProfileSchema} from '../netlify/functions/schemas.mts';

const app=fs.readFileSync('public/app.js','utf8');
const extra=fs.readFileSync('public/extra.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
let count=0;
const check=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const oldProfile={name:'Beta',language:'en-US',primaryGoal:'general_fitness',level:'beginner',days:['Mon','Tue','Wed'],location:'home',minutes:'30',meals:'3',cooking:'basic',sleep:'7',stress:'3',currentPain:'no',redFlags:'no',professionalRestrictions:'no',accuracy:true,prototypeAck:true};
check('legacy profile parsed with optional defaults',()=>{
 const result=ProfileSchema.safeParse(oldProfile);assert.equal(result.success,true);assert.equal(result.data.activityType,'none');assert.deepEqual(result.data.activityDays,[]);
});
check('swimming Sundays persists in schema and no invented days',()=>{
 const result=ProfileSchema.safeParse({...oldProfile,activityType:'swimming',activityDays:['Sun']});assert.equal(result.success,true);assert.deepEqual(result.data.activityDays,['Sun']);
});
check('invalid sport day and invalid custom overflow rejected',()=>{
 assert.equal(ProfileSchema.safeParse({...oldProfile,activityDays:['Funday']}).success,false);
 assert.equal(ProfileSchema.safeParse({...oldProfile,activityType:'other',activityOther:'x'.repeat(81)}).success,false);
});
check('language, activity selection and buttons wired',()=>{
 assert.match(app,/MIND:\['EXTRA','EXTRA','EXTRA'\]/);
 assert.match(app,/data-activity-type/);assert.match(app,/data-activity-day/);
 assert.match(app,/if\(step===1&&onboardingDraft.activityType/);
 assert.match(app,/typeof renderExtra==='function'/);
});
check('scripts included and SW cache refreshed',()=>{
 assert.match(html,/app\.js\?v=0\.14\.1-extra1/);assert.match(html,/extra\.js\?v=0\.14\.1-extra1/);
 assert.match(sw,/extra\.js\?v=0\.14\.1-extra1/);assert.match(sw,/hercules-hub-v0\.14\.1-extra1/);
});
const selectedProfile={...oldProfile,activityType:'swimming',activityDays:['Sun']};
const plan={summary:{selectedDays:['Mon','Tue','Wed']},trainingHold:false};
const allDays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const ui={innerHTML:''},buttons=['mind','stretch','water','sport'].map(kind=>({dataset:{extraOpen:kind}})),dayButtons=allDays.map(day=>({dataset:{extraDay:day}}));
const controls={};
const ctx={profile:selectedProfile,plan,state:{cycleNumber:1,habits:{},postWorkout:{pending:false}},DAYS:allDays,
 extraSelectedDay:'Sun',extraOpened:'',currentWeek:()=>1,dayLabel:s=>s,activityLabel:p=>p.activityType==='swimming'?'Swimming':'None',
 L:(pt,en,es)=>en,esc:s=>String(s).replaceAll('<','&lt;'),$:(selector)=>selector==='#mindContent'?ui:(selector==='#extraMarkDone'&&ui.innerHTML.includes('id="extraMarkDone"')?(controls.mark={}):null),
 $$:(selector)=>selector==='[data-extra-open]'?buttons:selector==='[data-extra-day]'?dayButtons:[],saveState:()=>{},navigate:()=>{}};
vm.runInNewContext(extra,ctx,{timeout:1000});
check('Sunday sport appears only on declared day',()=>{
 assert.equal(ctx.extraScheduleDay('Sun').activity,true);
 assert.equal(ctx.extraScheduleDay('Sat').activity,false);
 assert.equal(ctx.extraScheduleDay('Mon').training,true);
 ctx.renderExtra();assert.match(ui.innerHTML,/Swimming/);assert.match(ui.innerHTML,/data-extra-open="sport"/);
 assert.match(ui.innerHTML,/data-extra-open="water"/);assert.match(ui.innerHTML,/data-extra-open="stretch"/);
});
check('each interactive EXTRA guide opens deeper instructions',()=>{
 for(const kind of ['mind','stretch','water','sport']){
   const btn=buttons.find(x=>x.dataset.extraOpen===kind);btn.onclick();
   assert.match(ui.innerHTML,/id="extraDetail"/);assert.ok(ui.innerHTML.includes('id="extraMarkDone"'));
 }
});
check('EXTRA completion writes to current day without altering TRAIN sessions',()=>{
 const before=JSON.stringify(ctx.plan);ctx.extraOpened='water';ctx.renderExtra();controls.mark.onclick();
 assert.equal(ctx.state.habits['extra:1:w1:Sun:water'],true);
 assert.equal(JSON.stringify(ctx.plan),before);
});
check('other days show easy suggestions, never automatic swimming',()=>{
 dayButtons.find(x=>x.dataset.extraDay==='Sat').onclick();
 assert.equal(ctx.extraScheduleDay('Sat').activity,false);
 assert.doesNotMatch(ui.innerHTML,/data-extra-open="sport"/);
 assert.match(ui.innerHTML,/data-extra-open="mind"/);
});
check('controlling TRAIN restriction prevents sport prompt',()=>{
 ctx.plan.trainingHold=true;ctx.extraSelectedDay='Sun';ctx.renderExtra();
 assert.doesNotMatch(ui.innerHTML,/data-extra-open="sport"/);
});
check('PDF export requires plan but not day 28 or Final Mark',()=>{
 assert.match(app,/async function exportMonthlyReport\(\)\{try/);
 assert.match(app,/reportReady=!!\(profile&&plan\)/);
 assert.doesNotMatch(app,/async function exportMonthlyReport\(\)\{if\(elapsedDays\(\)/);
 assert.match(app,/STATUS: CURRENT PROGRESS SNAPSHOT/);
});
console.log('extra-flow '+count+'/'+count+' PASS');
