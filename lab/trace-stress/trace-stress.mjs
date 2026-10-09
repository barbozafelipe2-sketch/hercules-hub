// Synthetic Trace Lab stress harness: TEST ONLY. Production decisions are never written here.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {safetyRouting} from '../../netlify/functions/safety-lib.mts';
import {buildSignals,deterministicDelta,validateDelta,clampDelta,applyDelta} from '../../netlify/functions/cycle-lib.mts';
import {makeTrace} from '../../netlify/functions/trace-lib.mts';

const here=path.dirname(fileURLToPath(import.meta.url));
const raw=readFileSync(path.join(here,'fixtures/profiles-2000.jsonl'),'utf8').trim().split(/\r?\n/);
const seeds=raw.map((line,i)=>{try{return JSON.parse(line)}catch{throw Error('Bad synthetic JSON line '+(i+1))}});
assert.equal(seeds.length,2000);
assert.equal(new Set(seeds.map(s=>s.id)).size,2000);
const modes=['complete','ordinary-pain','red-flag','professional-no-exercise','professional-guidance','tracked-symptom','low-recovery','low-sleep','no-checkins','low-adherence'];
const badVenues=new Set(),badGoals=new Set(),sports=new Set(),counters={};
let processed=0,traces=0,reviewProgress=0,restrictedProgress=0;
const day0=Date.parse('2026-10-08T00:00:00Z'),iso=(d)=>new Date(day0-d*86400000).toISOString();
const baseDays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const realVenues=new Set(['gym','home','both']);
const realGoals=new Set(['build_muscle','general_fitness','fat_loss','consistency','strength']);
for(const seed of seeds){
 assert.match(seed.id,/^lab15-\d{4}$/);
 assert.ok(Number.isInteger(seed.age)&&seed.age>=18&&seed.age<=100);
 assert.ok(Number.isInteger(seed.days)&&seed.days>=1&&seed.days<=7);
 for(const k of ['sport','goal','venue','level','limit','prep'])assert.equal(typeof seed[k],'string');
 if(Object.keys(seed).some(k=>/email|phone|address|name|ssn/i.test(k)))throw Error('Unexpected personal field in synthetic seed');
 if(!realVenues.has(seed.venue))badVenues.add(seed.venue);
 if(!realGoals.has(seed.goal))badGoals.add(seed.goal);
 if(seed.sport)sports.add(seed.sport);
 const trainingDays=Math.min(4,Math.max(2,seed.days));
 const pattern=trainingDays===2?['fullA','fullB']:trainingDays===3?['fullA','fullB','fullC']:['upperA','lowerA','upperB','lowerB'];
 for(const mode of modes){
  const critical=mode==='red-flag',noExercise=mode==='professional-no-exercise';
  const pain=mode==='ordinary-pain',guidance=mode==='professional-guidance',symptom=mode==='tracked-symptom';
  const painArea={wrist:'wrist_hand',back:'low_back',knee:'knee',shoulder:'shoulder',neck:'neck'}[seed.limit]||'knee';
  const route=safetyRouting({
    redFlags:critical?'yes':'no',
    professionalRestrictions:noExercise||guidance?'yes':'no',
    professionalRestrictionScope:noExercise?'no_exercise':guidance?'avoid_specific':'',
    currentPain:pain?'yes':'no',painAreas:pain?[painArea]:[],safetyDetails:''
  });
  if(critical||noExercise)assert.ok(route.trainingRestricted&&route.status==='RESTRICTED');
  else if(pain||guidance)assert.ok(route.ownerReviewRequired&&!route.trainingRestricted&&route.status==='REVIEW_NOTIFY');
  else assert.ok(!route.trainingRestricted);
  const completed={};
  for(let w=1;w<=4;w++)for(let i=0;i<pattern.length;i++){
   const k=(w-1)*pattern.length+i;
   if(mode==='low-adherence'&&k>=Math.ceil(pattern.length*4*0.5))continue;
   if(mode!=='low-adherence'&&k===pattern.length*4-1&&seed.age%2===0)continue;
   completed['w'+w+':'+pattern[i]]=true;
  }
  const missing=mode==='no-checkins';
  const feedback=missing?[]:Array.from({length:10+(seed.days%5)},(_,i)=>{
   const low=mode==='low-recovery',sleep=mode==='low-sleep';
   const v=seed.age%3===0?5:4;
   return {ts:iso(i+1),dayKey:iso(i+1).slice(0,10),
    energy:low?2:v,sleep:sleep?2:v,training:low?2:v,
    nutrition:mode==='low-recovery'?2:v,
    painFlag:pain&&i===0,redFlagSymptom:symptom&&i===0};
  });
  const cycle=1+(seed.age%7);
  const st={startedAt:iso(30),cycleNumber:cycle,completedSessions:completed,checkins:feedback,
    baseline:{ts:iso(30),weight:'180',targetWeight:'175'},
    checkpoint:{ts:iso(14),weight:'179'},finalMark:{ts:iso(1),weight:'178'}};
  const plan={version:'trace-test',trainingHold:route.trainingRestricted,
    reviewRouting:{ownerReviewRequired:route.ownerReviewRequired},
    training:{pattern,sets:2},nutrition:{},recover:{},mind:{},evolve:{}};
  const signals=buildSignals(st,plan,{},30);
  const delta=deterministicDelta(signals,plan);
  assert.equal(validateDelta(delta,signals,plan).ok,true,'Invalid delta: '+mode);
  if(critical||noExercise||symptom)assert.equal(delta.trainingAction,'hold');
  if(pain||guidance||missing||mode==='low-recovery'||mode==='low-sleep'||mode==='low-adherence')assert.notEqual(delta.trainingAction,'progress');
  const rank={hold:0,consolidate:1,maintain:2,progress:3};
  const bounded=clampDelta({trainingAction:'progress',nutritionAction:'rotate',recoveryAction:'maintain',mindAction:'maintain'},delta);
  assert.ok(rank[bounded.trainingAction]<=rank[delta.trainingAction]);
  if(route.ownerReviewRequired&&delta.trainingAction==='progress')reviewProgress++;
  if(route.trainingRestricted&&delta.trainingAction==='progress')restrictedProgress++;
  const next=applyDelta(plan,delta,{
    level:seed.level==='build'?'intermediate':'beginner',minutes:String(seed.days>=4?60:30),
    mealPrepPreference:['mixed','batch_cook','fresh_daily'].includes(seed.prep)?seed.prep:'mixed',
    proteinPreferences:[],grainPreferences:[],veggiePreferences:[],foodStyles:[],eatOutFrequency:'1-2_week',
    openToOtherVeggies:true
  },st);
  assert.equal(next.adaptation.cycle,cycle+1);
  if(processed%500===0){
   const trace=await makeTrace({kind:'next-cycle',appVersion:'0.14.1',cycleNumber:cycle+1,
    input:{syntheticId:seed.id,mode},output:{trainingAction:delta.trainingAction},
    deterministic:{route:route.status},reviewers:[],decision:delta.trainingAction,authority:'SYNTHETIC_QA'});
   assert.equal(trace.privacy.rawProfileStoredInTrace,false);
   assert.equal(trace.privacy.rawPromptStoredInTrace,false);
   assert.match(trace.inputDigest,/^sha256:[a-f0-9]{64}$/);
   traces++;
  }
  processed++;
  const key=mode+':'+delta.trainingAction;
  counters[key]=(counters[key]||0)+1;
 }
}
assert.equal(processed,20000);
assert.equal(reviewProgress,0,'Pending review produced progression');
assert.equal(restrictedProgress,0,'Restricted case produced progression');
console.log(JSON.stringify({
 schema:'hercules-trace-stress-v1',mode:'QA_ONLY_REAL_ENGINE',seedCount:seeds.length,
 syntheticCases:processed,traceDigestSamples:traces,byScenarioAction:counters,
 unsupportedOnboardingDimensions:{venues:[...badVenues].sort(),goals:[...badGoals].sort(),sports:[...sports].sort(),
  age:'not captured',sex:'not captured',sport:'not captured'},
 reviewPendingProgress:reviewProgress,restrictedProgress,
 conclusion:'Synthetic consistency tests only. Not real-user, clinical, performance, or production validation.'
},null,2));
