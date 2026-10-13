import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const my=fs.readFileSync('public/my-day.js','utf8');
const extra=fs.readFileSync('public/extra.js','utf8');
const app=fs.readFileSync('public/app.js','utf8');
let tests=0;
const check=(name,fn)=>{fn();tests++;console.log('PASS '+name)};
const now=Date.parse('2026-10-14T16:00:00Z'); // Wed; started last Wed; Mon is previous cycle week
class FixedDate extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
let chosen=[],body='';
const root={querySelector:()=>null,insertAdjacentHTML:(_pos,html)=>{body=html},querySelectorAll:(selector)=>selector==='[data-myday-day]'?[]:chosen};
const profile={name:'Synthetic QA',primaryGoal:'consistency',activityType:'swimming',activityDays:['Sun']};
const plan={summary:{selectedDays:['Mon','Thu'],minutes:35,meals:3},training:{pattern:['fullA','fullB']},trainingHold:false,nutrition:{reviewRequired:false},reviewRouting:{ownerReviewRequired:false}};
const state={startedAt:'2026-10-07T12:00:00.000Z',cycleNumber:1,completedSessions:{'w1:fullA':true},checkins:[],habits:{}};
const targets=[];
const sandbox={Date:FixedDate,profile,plan,state,extraSelectedDay:'',extraOpened:'',currentWeek:()=>2,$:()=>root,
  L:(pt,en,es)=>en,esc:x=>String(x).replace(/</g,'&lt;'),dayLabel:x=>x,activityLabel:()=> 'Swimming',
  sessionName:x=>x,locale:()=> 'en-US',navigate:x=>targets.push(x),renderNourish:()=>{},renderMind:()=>{},
  saveJSON:()=>{},KEYS:{state:'test'},document:{querySelector:()=>null}};
vm.createContext(sandbox);
vm.runInContext(my,sandbox);
vm.runInContext('globalThis.__view={read:()=>myDayExtraTargetWeek,setDay:d=>{myDaySelectedDay=d;myDayRenderedDateKey="2026-10-14"}};',sandbox);
check('week-boundary model uses date-scoped week for Monday',()=>{
  const model=vm.runInContext('myDayModel(profile,plan,state,new Date(),currentWeek())',sandbox);
  assert.equal(model.days[0].dateKey,'2026-10-12');assert.equal(model.days[0].week,1);assert.equal(model.days[0].completed,true);
});
check('Wednesday current cycle week is 2',()=>{assert.equal(sandbox.currentWeek(),2)});
sandbox.__view.setDay('Mon');chosen=[{dataset:{mydayTarget:'WATER'}}];
check('historical hydration action renders an actual clickable item',()=>{vm.runInContext('renderMyDayHome()',sandbox);assert.match(body,/data-myday-target="WATER"/);assert.equal(typeof chosen[0].onclick,'function')});
check('clicking past-week hydration sets the target week',()=>{chosen[0].onclick();assert.equal(sandbox.__view.read(),1);assert.equal(sandbox.extraSelectedDay,'Mon');assert.equal(sandbox.extraOpened,'water');assert.equal(targets.at(-1),'MIND')});
check('EXTRA derives the write week from selected historical week',()=>{
  const match=extra.match(/const day=extraSelectedDay,week=(.+?),cycle=state\.cycleNumber\|\|1,s=extraScheduleDay\(day\);/);
  assert.ok(match,'expected canonical EXTRA key expression');
  const resolve=new Function('myDayExtraTargetWeek','currentWeek',`return (${match[1]});`);
  assert.equal(resolve(sandbox.__view.read(),()=>2),1);
  assert.equal(`extra:1:w${resolve(sandbox.__view.read(),()=>2)}:Mon:water`,'extra:1:w1:Mon:water');
  assert.equal(resolve(null,()=>2),2);
  assert.equal(resolve(5,()=>2),2);
  assert.equal(resolve(0,()=>2),2);
});
check('manual EXTRA day change resets week override',()=>{assert.match(extra,/extraSelectedDay=b\.dataset\.extraDay;extraOpened='';if\(typeof myDayExtraTargetWeek!=='undefined'\)myDayExtraTargetWeek=null;renderExtra\(\)/)});
check('leaving EXTRA resets the old week bridge',()=>{assert.match(app,/function navigate\(v,save=true\)\{if\(v!=='MIND'&&typeof myDayExtraTargetWeek!=='undefined'\)myDayExtraTargetWeek=null;/)});
check('TRAIN hold prevents opening sport from MY DAY',()=>{
 const old=plan.trainingHold;plan.trainingHold=true;sandbox.__view.setDay('Sun');chosen=[{dataset:{mydayTarget:'SPORT'}}];
 vm.runInContext('renderMyDayHome()',sandbox);assert.doesNotMatch(body,/data-myday-target="SPORT"/);plan.trainingHold=old;
});
check('bridge is only transient, not written to persisted state',()=>{assert.equal('myDayExtraTargetWeek' in state,false);assert.equal('myDayExtraTargetWeek' in profile,false)});
console.log(`extra-week-bridge ${tests}/${tests} PASS`);
