import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const content=fs.readFileSync('public/grocery.js','utf8');
const app=fs.existsSync('public/app.js')?fs.readFileSync('public/app.js','utf8'):null;
const currentMenu=()=>[
  [{role:'breakfast',item:['eggs',['Ovos e aveia','Eggs and oats','Huevos y avena'],'',{protein:'eggs',grain:'oats',veggies:[]}]}],
  [{role:'lunch',item:['rice-chicken',['Frango + arroz + salada','Chicken + rice + salad','Pollo + arroz + ensalada'],'',{protein:'chicken',grain:'rice',veggies:['leafy']}]}],
  [{role:'lunch',item:['rice-chicken',['Frango + arroz + salada','Chicken + rice + salad','Pollo + arroz + ensalada'],'',{protein:'chicken',grain:'rice',veggies:['leafy']}]}],
  [{role:'dinner',item:['ai-meal',['Prato gerado','Generated meal','Plato generado'],'',{ingredients:['Tofu','Brown rice','<img onerror=alert(1)>'],source:'ai-generated'}]}],
  [{role:'snack',item:['generic',['Lanche simples','Simple snack','Merienda sencilla'],'',{veggies:[]}]}],
  [],[]
];
const state={cycleNumber:1,mealWeek:1,groceryWeeks:{}};
const opts={
  PREF_OPTIONS:{protein:[['eggs',['Ovos','Eggs','Huevos']],['chicken',['Frango','Chicken','Pollo']]],grain:[['oats',['Aveia','Oats','Avena']],['rice',['Arroz','Rice','Arroz']]],veggie:[['leafy',['Folhas verdes','Leafy greens','Verduras de hoja']]]},
  L:(pt,en,es)=>en,esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  profile:{},plan:{nutrition:{reviewRequired:false}},state,locale:()=> 'en-US',
  weekMenu:()=>currentMenu(),nutritionTripleAudit:()=>[{verdict:'PASS'}],
  foodAllowedByPreferences:()=>true,dislikeTokens:()=>[],
  currentWeek:()=>1,saveJSON:()=>{opts.saved++},scheduleCloudSync:()=>{opts.synced++},toast:()=>{},KEYS:{state:'test'},
  saved:0,synced:0,navigator:{clipboard:{writeText:async()=>{}}}
};
class NodeFake{
 constructor(opts={}){Object.assign(this,opts);this.handlers={}}
 addEventListener(name,callback){this.handlers[name]=callback}
 remove(){if(this.owner)this.owner.panel=null}
}
class FakePanel extends NodeFake{
 constructor(owner,html){super({owner,html});this.select=new NodeFake({value:'1'});this.copy=new NodeFake();const indices=[...html.matchAll(/data-grocery-check="(\d+)"/g)].map(x=>Number(x[1]));this.checkboxes=indices.map(index=>new NodeFake({dataset:{groceryCheck:String(index)},checked:false}))}
 querySelector(sel){return sel==='#groceryServings'?this.select:sel==='#groceryCopy'?this.copy:null}
 querySelectorAll(sel){return sel==='[data-grocery-check]'?this.checkboxes:[]}
}
class FakeRoot {
 panel=null;html='';
 querySelector(sel){return sel==='#groceryPanel'?this.panel:null}
 insertAdjacentHTML(_position,s){this.html=s;this.panel=new FakePanel(this,s)}
}
const root=new FakeRoot();opts.$=selector=>selector==='#nourishContent'?root:null;
const sandbox=vm.createContext(opts);
vm.runInContext(content,sandbox,{timeout:1000});
const get=(expression)=>vm.runInContext(expression,sandbox,{timeout:1000});
const model=(menu=currentMenu(),options={})=>get('groceryModel')(menu,options);
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
const eq=(a,b)=>assert.equal(a,b);
check('data components anchored to selected week, not invented recipes',()=>{const m=model();eq(m.mealCount,5);eq(m.partial,4);eq(m.missing,1);eq(m.rows.length,8);});
check('deduplication counts only real appearances',()=>{const m=model();eq(m.rows.find(x=>x.key==='protein:chicken').occurrences,2);eq(m.rows.find(x=>x.key==='grain:rice').occurrences,2)});
check('generated meals use explicitly supplied ingredient strings',()=>{const m=model();eq(m.groups.some(x=>x.group==='declared'),true);eq(m.rows.filter(x=>x.group==='declared').length,3)});
check('missing metadata remains unknown, never assumed from food title',()=>{const m=model();eq(m.rows.some(x=>x.name==='snack'),false);eq(m.missing,1)});
check('servings clamped and do not fabricate weights',()=>{eq(model(currentMenu(),{servings:0}).servings,1);eq(model(currentMenu(),{servings:88}).servings,6);assert.equal(/\d+\s?(g|grams|kg)\b/.test(content),false)});
check('allergy review blocks entirely',()=>{const m=model(currentMenu(),{review:true});eq(m.blocked,true);eq(m.rows.length,0)});
check('unapproved ingredient blocks list',()=>{const m=model(currentMenu(),{allowed:x=>x?.[0]!=='rice-chicken'});eq(m.blocked,true);eq(m.reason,'incompatible_meal')});
check('invalid calendar fails safely',()=>{const m=model([[{item:null}]]);eq(m.blocked,true);eq(m.reason,'missing_week')});
check('unknown metadata only uses supplied identifier',()=>{const menu=currentMenu();menu[0][0].item[3]={protein:'mysterious_protein',grain:'',veggies:[]};const m=model(menu);eq(m.rows.some(x=>x.name==='mysterious_protein'),true)});
check('shopping lists render without unsafe generated HTML',()=>{get('renderGroceryList')();assert.match(root.html,/&lt;img onerror=alert\(1\)&gt;/);assert.doesNotMatch(root.html,/<img onerror=alert\(1\)>/)});
check('incomplete catalog warning visible',()=>{assert.match(root.html,/NOT full recipes/);assert.match(root.html,/4 catalog meals/)});
check('checkbox controls bound for every item',()=>{eq(root.panel.checkboxes.length,8);assert.equal(typeof root.panel.checkboxes[0].handlers.change,'function')});
check('ownership checkbox persisted under current cycle week and menu signature',()=>{const box=root.panel.checkboxes[0];box.checked=true;box.handlers.change();const k=Object.keys(state.groceryWeeks)[0];eq(k.startsWith('c1w1-'),true);eq(Object.values(state.groceryWeeks[k].checked).filter(Boolean).length,1);assert.ok(opts.synced>0)});
check('same selection is restored when re-rendered',()=>{get('renderGroceryList')();assert.match(root.html,/1\/8 items already available/)});
check('serving selector persists without losing ownership',()=>{root.panel.select.value='3';root.panel.select.handlers.change({target:root.panel.select});const d=Object.values(state.groceryWeeks)[0];eq(d.servings,3);eq(Object.values(d.checked).filter(Boolean).length,1);assert.match(root.html,/3 portion\(s\) per meal/)});
check('week change isolates purchased items',()=>{state.mealWeek=2;get('renderGroceryList')();assert.match(root.html,/0\/8 items already available/)});
check('plan rotation invalidates prior grocery checklist safely',()=>{state.mealWeek=1;const original=opts.weekMenu;opts.weekMenu=()=>{const d=currentMenu();d[6]=[{role:'dinner',item:['new-meal',['Novo','New','Nuevo'],'',{protein:'chicken'}]}];return d};get('renderGroceryList')();assert.match(root.html,/0\/8 items already available|0\/9 items already available/);opts.weekMenu=original});
check('nutrition review does not render food components',()=>{opts.plan.nutrition.reviewRequired=true;get('renderGroceryList')();assert.match(root.html,/List unavailable/);assert.doesNotMatch(root.html,/data-grocery-check/);opts.plan.nutrition.reviewRequired=false});
check('triple-audit structural BLOCK also stops list',()=>{opts.nutritionTripleAudit=()=>[{verdict:'BLOCK'}];get('renderGroceryList')();assert.match(root.html,/List unavailable/);opts.nutritionTripleAudit=()=>[{verdict:'PASS'}]});
check('week-state pruning bounded to last twelve',()=>{for(let i=1;i<=20;i++)get('grocerySaveWeek')('test-'+i,{servings:1,checked:{x:true}});eq(Object.keys(state.groceryWeeks).length,12)});
check('UI uses localized names and exact supplied data',()=>{eq(get('groceryLabel')('leafy','vegetable'),'Leafy greens');eq(get('groceryLabel')('rice','grain'),'Rice');opts.L=(_pt,_en,es)=>es;eq(get('groceryLabel')('rice','grain'),'Arroz')});
check('module does not generate or overwrite plans',()=>{assert.doesNotMatch(content,/generateSystem\(/);assert.doesNotMatch(content,/plan\.training\s*=/);assert.doesNotMatch(content,/state\.checkins\s*=/)});
check('grocery records are stored separately from exercise and checkin habits',()=>{assert.ok(content.includes('state.groceryWeeks'));assert.doesNotMatch(content,/state\.habits\s*=/);assert.doesNotMatch(content,/state\.completedSessions\s*=/)});
if(app){check('full app integration only after applying stage 3',()=>{assert.match(app,/if\(typeof renderGroceryList==='function'\)renderGroceryList\(\)/)})}
console.log('grocery-flow '+checks+'/'+checks+' PASS');
