/**
 * Hercules TEST-only historical corpus regression v1.
 * Input: unchanged 28,500-row synthetic source from approved Hercules Hub Drive Lab.
 * Source fields may be missing/unsupported; never silently impute them or promote QA to care.
 * An explicit scenario adapter can simulate a limitation review; it is not a patient fact.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { safetyRouting } from '../../netlify/functions/safety-lib.mts';
import { buildSignals, deterministicDelta, validateDelta, clampDelta, applyDelta, week4Complete, milestoneTimeValid } from '../../netlify/functions/cycle-lib.mts';
import { makeTrace } from '../../netlify/functions/trace-lib.mts';

const here=path.dirname(fileURLToPath(import.meta.url));
const source=gunzipSync(readFileSync(path.join(here,'fixtures/historical-28500.csv.gz')));
const sourceHash=createHash('sha256').update(source).digest('hex');
assert.equal(sourceHash,'b1b5bb021161483db4ad5204093cd7e8637363c71099523a04ce2fef0096bdc1','Source hash/lineage changed unexpectedly');

/** Strict RFC-4180 subset parser: permits quoted delimiters, quoted CRLF and escaped quotes. */
function parseCsv(str){
 const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
 for(let i=0;i<str.length;i++){
  const c=str[i];
  if(quoted){if(c==='"'){if(str[i+1]==='"'){cell+='"';i++}else {quoted=false;afterQuote=true}}else cell+=c;continue}
  if(afterQuote){if(c===','){row.push(cell);cell='';afterQuote=false;continue}
   if(c==='\r'||c==='\n'){row.push(cell);rows.push(row);row=[];cell='';afterQuote=false;if(c==='\r'&&str[i+1]==='\n')i++;continue}
   throw new Error('Unexpected characters following CSV quoted cell at char '+i)}
  if(c==='"'){if(cell!=='')throw new Error('Malformed CSV quote at '+i);quoted=true;continue}
  if(c===','){row.push(cell);cell='';continue}
  if(c==='\r'||c==='\n'){row.push(cell);rows.push(row);row=[];cell='';if(c==='\r'&&str[i+1]==='\n')i++;continue}
  cell+=c;
 }
 if(quoted)throw new Error('CSV ends inside quoted field');
 if(cell!==''||row.length){row.push(cell);rows.push(row)}
 const [headers,...data]=rows;
 assert.deepEqual(headers,['id','fonte','country','language','age','sport','venue','goal','days','minutes','limit','menu','start','status']);
 return data.map((values,i)=>{assert.equal(values.length,headers.length,'Malformed source row '+(i+2));return Object.fromEntries(headers.map((k,j)=>[k,values[j]]))});
}
const rows=parseCsv(source.toString('utf8').replace(/^\uFEFF/,''));
assert.equal(rows.length,28500,'Whole corpus must be exercised, not a subset');
const expectedSources=new Map([
 ['lab-esportes-100.csv',4200],['lab-casos-4000.csv',4000],
 ...Array.from({length:5},(_,i)=>[`lab-ronda-${i+1}-2000.csv`,2000]),
 ...Array.from({length:10},(_,i)=>[`lab-var-r${i+1}-1000.csv`,1000]),
 ['lab-jiu-capoeira-sambo.csv',300]
]);
const counts={};const add=(group,key)=>{const k=String(key);if(!counts[group])counts[group]={};counts[group][k]=(counts[group][k]||0)+1};
const sourceIds=new Map(),compositeKeys=new Set(),faults=[];
const supportedGoals=new Set(['build_muscle','general_fitness','fat_loss','consistency','strength']);
const supportedVenues=new Set(['gym','home','both']);
const supportedMinutes=new Set(['20','30','45','60']);
const languageMap={Portuguese:'pt-BR',English:'en-US',Spanish:'es'};
const areaMap={neck:'neck',wrist:'wrist_hand',back:'low_back',shoulder:'shoulder',knee:'knee'};
const sessionDays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const roles={hold:0,consolidate:1,maintain:2,progress:3};
const iso='2026-10-08T00:00:00.000Z';
let mappedCoreRows=0,duplicateRawIds=0,traceSamples=0,proposedAdapters=0;
for(const [index,r] of rows.entries()){
 assert.equal(r.status,'SYNTHETIC — PRACTICE ONLY','Unexpected provenance status at row '+(index+2));
 assert.ok(r.id&&r.fonte,'Missing id or source at row '+(index+2));
 assert.ok(expectedSources.has(r.fonte),'Unreviewed source '+r.fonte);
 const composite=`${r.fonte}::${r.id}`;
 assert.ok(!compositeKeys.has(composite),'Duplicate source+ID; cannot disambiguate lineage '+composite);
 compositeKeys.add(composite);
 if(sourceIds.has(r.id))duplicateRawIds++;
 sourceIds.set(r.id,(sourceIds.get(r.id)||0)+1);
 add('sourceFiles',r.fonte);
 for(const k of ['goal','venue','minutes','language','limit'])if(!r[k])add('missingFields',k);
 if(r.language && !languageMap[r.language])add('unmappedLanguages',r.language);
 if(r.sport)add('sports',r.sport);else add('missingFields','sport');
 const ageKnown=r.age.trim()!=='';
 if(ageKnown){const n=Number(r.age);assert.ok(Number.isInteger(n)&&n>=0&&n<=120,'Unexpected age representation: '+composite)}else add('missingFields','age');
 const dayCount=Number(r.days);
 assert.ok(Number.isInteger(dayCount),'Invalid days representation '+composite);
 const daysValid=dayCount>=2&&dayCount<=7;
 if(!daysValid)add('incompatible','days');
 const minutesValid=supportedMinutes.has(r.minutes);
 if(!minutesValid)add('incompatible','minutes');
 const goalValid=supportedGoals.has(r.goal);
 if(!goalValid)add('incompatible','goal');
 const venueValid=supportedVenues.has(r.venue);
 if(!venueValid)add('incompatible','venue');
 if(!r.language)add('incompatible','missing_language');
 if(r.sport)add('notInOnboarding','sport');
 if(ageKnown)add('notInOnboarding','age');
 if(r.country)add('notInOnboarding','country');
 if(r.menu)add('unvalidatedAssets','meal_not_an_approved_menu_asset');
 if(daysValid&&minutesValid&&goalValid&&venueValid) mappedCoreRows++;
 // Explicitly derived lab challenge: a named synthetic limitation is represented as
 // an ordinary discomfort, requiring review; an empty limitation is UNKNOWN, not 'no'.
 const knownLimit=Object.hasOwn(areaMap,r.limit),unspecified=!r.limit;
 const challenge={currentPain:knownLimit?'yes':r.limit==='none'?'no':'',painAreas:knownLimit?[areaMap[r.limit]]:[],redFlags:'',professionalRestrictions:'',professionalRestrictionScope:'',safetyDetails:''};
 const route=safetyRouting(challenge);
 const red=safetyRouting({...challenge,redFlags:'yes'});
 assert.ok(red.trainingRestricted&&red.status==='RESTRICTED','Synthetic red-flag counterfactual must HOLD '+composite);
 const restricted=safetyRouting({...challenge,professionalRestrictions:'yes',professionalRestrictionScope:'no_exercise'});
 assert.ok(restricted.trainingRestricted&&restricted.status==='RESTRICTED','Synthetic professional no-exercise counterfactual must HOLD '+composite);
 if(knownLimit){assert.equal(route.status,'REVIEW_NOTIFY',composite);assert.ok(route.ownerReviewRequired&&!route.trainingRestricted,composite)}
 else {assert.equal(route.status,'CLEAR',composite);assert.ok(!route.trainingRestricted,composite)}
 if(unspecified)add('unknownSafetyInput','limitation_unknown');
 add('safetyRoutes',route.status);
 // No source TRACK, days elapsed, or certified clearance => keep UNKNOWN / NOT READY.
 // Important: no synthetic adherence or sleep score is invented to force progression.
 const patterns=(dayCount===2?['fullA','fullB']:dayCount===3?['fullA','fullB','fullC']:dayCount>=4?['upperA','lowerA','upperB','lowerB']:[]);
 const plan={version:'0.14.1',trainingHold:route.trainingRestricted,reviewRouting:{ownerReviewRequired:route.ownerReviewRequired},
  training:{pattern:patterns,sets:2,reviewRequired:route.ownerReviewRequired},nutrition:{},recover:{},mind:{},evolve:{}};
 const state={startedAt:'',cycleNumber:1,completedSessions:{},checkins:[],baseline:null,checkpoint:null,finalMark:null,cycleHistory:[]};
 const signals=buildSignals(state,plan,{},0);
 assert.equal(signals.checkinDays,0,composite);
 assert.equal(signals.trainingCompletion,0,composite);
 assert.equal(signals.avgEnergy,null,composite);
 assert.equal(signals.avgSleep,null,composite);
 assert.equal(week4Complete(state,patterns),false,composite);
 assert.equal(milestoneTimeValid('finalMark',iso,null),false,composite);
 const baseline=deterministicDelta(signals,plan);
 assert.notEqual(baseline.trainingAction,'progress','No observed TRACK may progress: '+composite);
 assert.equal(baseline.trainingAction,'consolidate',composite);
 assert.equal(baseline.nutritionAction,'maintain',composite);
 assert.ok(baseline.unknowns.includes('daily_tracking')&&baseline.unknowns.includes('day15_checkpoint'),composite);
 assert.equal(validateDelta(baseline,signals,plan).ok,true,composite);
 const illegal=validateDelta({...baseline,trainingAction:'progress'},signals,plan);
 assert.equal(illegal.ok,false,'Progress guard absent '+composite);
 const clamped=clampDelta({trainingAction:'progress',nutritionAction:'rotate'},baseline);
 assert.ok(roles[clamped.trainingAction]<=roles[baseline.trainingAction],composite);
 // Synthetic QA-only proposal; no month activation, no write, no AI call.
 const next=applyDelta(plan,baseline,{level:'',minutes:minutesValid?r.minutes:'',mealPrepPreference:'',proteinPreferences:[],grainPreferences:[],veggiePreferences:[],openToOtherVeggies:false,foodStyles:[],eatOutFrequency:''},state);
 proposedAdapters++;
 assert.equal(next.adaptation?.cycle,2);
 if(knownLimit&&next.training?.reviewRequired!==true)faults.push({source:composite,classification:'ENGINE_DEFECT',code:'REVIEW_FLAG_DROPPED_ON_APPLY_DELTA'});
 if(index%500===0){
  const trace=await makeTrace({kind:'initial-generation',appVersion:'0.14.1',cycleNumber:1,
   input:{syntheticKey:composite},output:{safetyRoute:route.status,trainingAction:baseline.trainingAction},
   deterministic:{source:'historical-fixture',synthetic:true},reviewers:[],authority:'QA_ONLY',decision:baseline.trainingAction});
  assert.equal(trace.privacy.rawProfileStoredInTrace,false);
  assert.equal(trace.privacy.rawPromptStoredInTrace,false);
  assert.match(trace.inputDigest,/^sha256:[a-f0-9]{64}$/);
  traceSamples++;
 }
 add('deltaActions',baseline.trainingAction);
}
for(const [src,n] of expectedSources)assert.equal(counts.sourceFiles[src],n,'Source count changed '+src);
assert.equal(expectedSources.size,18);
assert.equal(duplicateRawIds,1000,'Historical duplicate raw IDs need explicit lineage treatment');
assert.equal(sourceIds.size,27500,'Unexpected distinct ID count');
const report={schema:'hercules-historical-engine-regression-v1',authority:'EXPERIMENTAL_QA_ONLY',
 sourceFile:'Hércules Drive > Hércules hub > Lab > lab-cases-unico.csv',sourceSha256:sourceHash,
 historicalRows:rows.length,compositeKeys:compositeKeys.size,distinctRawIds:sourceIds.size,
 repeatedRawIds:duplicateRawIds,sourceFiles:counts.sourceFiles,
 engineFunctions:['safetyRouting','buildSignals','deterministicDelta','validateDelta','clampDelta','applyDelta','week4Complete','milestoneTimeValid','makeTrace'],
 partialOnboardingCompatibleCoreRows:mappedCoreRows,
 missingFields:counts.missingFields,incompatibleNativeOnboarding:counts.incompatible,
 notInOnboarding:counts.notInOnboarding,unknownSafetyInput:counts.unknownSafetyInput,
 safetyRoutes:counts.safetyRoutes,actions:counts.deltaActions,
 digestSamples:traceSamples,counterfactualRestrictedSafetyChecks:rows.length*2,hypotheticalAdaptationEvaluations:proposedAdapters,faults: faults.slice(0,10),faultCount:faults.length,
 knownLimits: 'Named source.limit interpreted as explicit ordinary-limitation challenge; not medical clearance.',
 missingHistory:'No TRACK inputs in source => UNKNOWN, never assert a month is eligible.',
 sourceEvaluationSeparation:'Never read source.expected labels to drive engine, no fake adherence, no fabricated review decisions.',
 validationBoundary:'Real engine functions are exercised; not full app, real client, clinical or nutritional correctness validation.'};
assert.equal(faults.length,0,'Engine defect: pending-review TRAIN flag dropped by applyDelta');
const frozen=JSON.parse(readFileSync(path.join(here,'historical-baseline-v1.json'),'utf8'));
assert.deepEqual(report,frozen,'Source or decision baseline drift; review before changing the frozen QA snapshot');
console.log(JSON.stringify(report,null,2));