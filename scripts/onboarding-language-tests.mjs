import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const stepStart=app.indexOf('function stepDefs(){');
const stepEnd=app.indexOf('\nfunction yesNoField',stepStart);
const switchStart=app.indexOf('function changeOnboardingLanguage(');
const switchEnd=app.indexOf("\n$('#onboardLanguage').onchange",switchStart);
assert.ok(stepStart>=0&&stepEnd>stepStart,'stepDefs exists');
assert.ok(switchStart>=0&&switchEnd>switchStart,'language-switch handler exists');

const languages={pt:'pt-BR',en:'en-US',es:'es'};
const draft={name:'Felipe',primaryGoal:'general_fitness',level:'intermediate',days:['Mon','Wed'],units:'imperial',height:'180',weight:'180',targetWeight:'170',location:'gym',minutes:'45',preferredTime:'evening',activityType:'none',activityOther:'',activityDays:[],meals:'3',cooking:'basic',mealPrepPreference:'mixed',eatOutFrequency:'sometimes',proteinPreferences:[],grainPreferences:[],veggiePreferences:[],openToOtherVeggies:true,foodStyles:[],foodPreferences:'',dislikes:'',allergies:'none',sleep:'7',stress:'3',currentPain:'no',painAreas:[],redFlags:'no',professionalRestrictions:'no',professionalRestrictionScope:'',safetyDetails:'',accuracy:false,prototypeAck:false};
const weekDays={Mon:['Seg','Mon','Lun'],Tue:['Ter','Tue','Mar'],Wed:['Qua','Wed','Mié'],Thu:['Qui','Thu','Jue'],Fri:['Sex','Fri','Vie'],Sat:['Sáb','Sat','Sáb'],Sun:['Dom','Sun','Dom']};
const ctx={
 lang:'pt-BR',onboardingDraft:draft,
 L:(pt,en,es)=>ctx.lang==='pt-BR'?pt:ctx.lang==='es'?es:en,
 esc:x=>String(x??'').replace(/[&<>"']/g,''),
 GOAL_KEY:{build_muscle:1,general_fitness:1,fat_loss:1,consistency:1,strength:1},
 goalLabel:k=>ctx.L('Condicionamento geral','General fitness','Condición física general'),
 DAYS:Object.keys(weekDays),dayLabel:k=>ctx.L(...weekDays[k]),
 ACTIVITY_OPTIONS:{none:['Nenhuma','None','Ninguna'],swimming:['Natação','Swimming','Natación'],other:['Outra','Other','Otra']},
 prefChips:()=>'<div class="chips">protein options</div>',painAreaChips:()=>'<div class="chips">pain areas</div>',
 yesNoField:(key,label)=>`<div class="yesNo">${label}</div>`
};
vm.createContext(ctx);
vm.runInContext(app.slice(stepStart,stepEnd),ctx);
const steps=ctx.stepDefs();
assert.equal(steps.length,5,'five onboarding steps are defined');
const expected={
 'pt-BR':['Sua realidade','Treino que cabe na sua vida','Nutrição prática','Recuperação e segurança','Confirmar e gerar'],
 'en-US':['Your reality','Training that fits your life','Practical nutrition','Recovery & safety','Confirm & generate'],
 es:['Tu realidad','Entreno que cabe en tu vida','Nutrición práctica','Recuperación y seguridad','Confirmar y generar']
};
for(const [short,code] of Object.entries(languages)){
 ctx.lang=code;
 const localized=ctx.stepDefs();
 assert.equal(JSON.stringify(Array.from(localized,x=>x.title)),JSON.stringify(expected[code]),`${code} titles translate across all steps`);
 assert.ok(localized.every(x=>x.copy.trim().length>20),`${code} step guidance is present`);
 for(const [i,step] of localized.entries()){
  const html=step.render();
  assert.ok(html.length>100,`${code} step ${i+1} renders fields`);
  assert.doesNotMatch(html,/undefined|null/gi,`${code} step ${i+1} has no missing translation values`);
 }
}

let activeDraft={name:'Felipe'},form={name:'Felipe updated'},currentStep=3,rendered=0;
const switchCtx={
 onboardingDraft:activeDraft,onboardStep:currentStep,
 syncDraft(){activeDraft.name=form.name},
 setLanguage(code){switchCtx.lang=code;activeDraft.language=code},
 renderStep(){rendered++;form.name=activeDraft.name},
 lang:'pt-BR'
};
vm.createContext(switchCtx);
vm.runInContext(app.slice(switchStart,switchEnd),switchCtx);
for(const code of ['pt-BR','en-US','es']){
 form.name=`Felipe ${code}`;
 assert.equal(switchCtx.changeOnboardingLanguage(code),true,`${code} can be selected during onboarding`);
 assert.equal(activeDraft.name,`Felipe ${code}`,`${code} switch preserves typed answers`);
 assert.equal(activeDraft.language,code,`${code} switch updates profile language`);
 assert.equal(switchCtx.onboardStep,3,`${code} switch keeps the current onboarding step`);
}
const prior=rendered;
assert.equal(switchCtx.changeOnboardingLanguage('fr'),false,'unsupported language is ignored');
assert.equal(rendered,prior,'unsupported language does not rerender or reset onboarding');
console.log('onboarding-language PASS: PT/EN/ES render; switching preserves answers and step');
