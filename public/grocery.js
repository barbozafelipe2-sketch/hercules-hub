/* Hercules Hub • NOURISH weekly shopping helper, beta stage 3/10.
 * Uses selected weekMenu only; metadata components are NOT full recipes.
 * Never infers grams, allergens, additional recipes or extra portions.
 * Pure model makes source/safety/completeness easy to regression-test.
 */
const GROCERY_GROUPS=['protein','grain','vegetable','declared'];
const GROCERY_WEEK_LIMIT=12;
function groceryHash(text){let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function groceryCanonical(s){return String(s||'').trim().toLocaleLowerCase('en-US').normalize('NFKC').replace(/\s+/g,' ').slice(0,90)}
function groceryLabel(key,group){
  if(group==='declared')return String(key||'');
  const source=group==='protein'?PREF_OPTIONS.protein:group==='grain'?PREF_OPTIONS.grain:PREF_OPTIONS.veggie;
  const found=source?.find(x=>x[0]===key);
  if(found)return L(...found[1]);
  const extras={
    avocado:['Abacate','Avocado','Aguacate'],peas:['Ervilha','Peas','Guisantes'],pumpkin:['Abóbora','Pumpkin','Calabaza'],
    cauliflower:['Couve-flor','Cauliflower','Coliflor'],bok_choy:['Bok choy','Bok choy','Bok choy'],tempeh:['Tempeh','Tempeh','Tempeh']
  };
  return extras[key]?L(...extras[key]):String(key).replace(/_/g,' ');
}
function groceryComponents(item){
  const m=item?.[3]||{};
  if(Array.isArray(m.ingredients)&&m.ingredients.some(x=>String(x||'').trim())){
    return [...new Set(m.ingredients.map(x=>String(x||'').trim()).filter(Boolean))]
      .slice(0,24).map(x=>({key:'ingredient:'+groceryCanonical(x),name:x,group:'declared',basis:'declared'}));
  }
  const components=[];
  for(const [group,keys] of [['protein',[m.protein]],['grain',[m.grain]],['vegetable',m.veggies]]){
    for(const key of (Array.isArray(keys)?keys:[]))if(typeof key==='string'&&key.trim()){
      const clean=key.trim();components.push({key:group+':'+groceryCanonical(clean),name:clean,group,basis:'category'});
    }
  }
  return [...new Map(components.map(x=>[x.key,x])).values()];
}
function groceryModel(days,options={}){
  const servings=Math.min(6,Math.max(1,Math.trunc(Number(options.servings)||1)));
  if(options.review===true)return {blocked:true,reason:'nutrition_review',groups:[],rows:[],servings,missing:0,partial:0,mealCount:0,signature:''};
  if(!Array.isArray(days)||days.length!==7)return {blocked:true,reason:'missing_week',groups:[],rows:[],servings,missing:0,partial:0,mealCount:0,signature:''};
  const allowed=typeof options.allowed==='function'?options.allowed:()=>true;
  const components=new Map(),ids=[];
  let missing=0,partial=0,mealCount=0;
  for(let i=0;i<days.length;i++){
    if(!Array.isArray(days[i]))return {blocked:true,reason:'invalid_day',groups:[],rows:[],servings,missing:0,partial:0,mealCount:0,signature:''};
    for(const row of days[i]){
      if(!row?.item||!allowed(row.item))return {blocked:true,reason:'incompatible_meal',groups:[],rows:[],servings,missing:0,partial:0,mealCount:0,signature:''};
      const item=row.item,meta=item[3]||{},found=groceryComponents(item);
      mealCount++;ids.push(i+':'+String(row.role||'')+':'+String(item[0]||''));
      if(!Array.isArray(meta.ingredients)||!meta.ingredients.some(x=>String(x||'').trim()))partial++;
      if(!found.length)missing++;
      for(const c of found){
        if(!components.has(c.key))components.set(c.key,{...c,occurrences:0});
        components.get(c.key).occurrences++;
      }
    }
  }
  const rows=[...components.values()].sort((a,b)=>GROCERY_GROUPS.indexOf(a.group)-GROCERY_GROUPS.indexOf(b.group)||a.name.localeCompare(b.name,'en'));
  const groups=GROCERY_GROUPS.map(group=>({group,rows:rows.filter(x=>x.group===group)})).filter(g=>g.rows.length);
  return {blocked:false,reason:'',groups,rows,servings,missing,partial,mealCount,
    signature:groceryHash(ids.join('|')+'|'+rows.map(x=>x.key).join('|'))};
}
function grocerySaveWeek(key,entry){
  state.groceryWeeks=state.groceryWeeks&&typeof state.groceryWeeks==='object'&&!Array.isArray(state.groceryWeeks)?state.groceryWeeks:{};
  const prior=state.groceryWeeks;
  if(Object.hasOwn(prior,key))delete prior[key];
  prior[key]={servings:Math.min(6,Math.max(1,Math.trunc(Number(entry.servings)||1))),checked:{...entry.checked}};
  while(Object.keys(prior).length>GROCERY_WEEK_LIMIT)delete prior[Object.keys(prior)[0]];
  saveJSON(KEYS.state,state);scheduleCloudSync();
}
function renderGroceryList(){
  const base=$('#nourishContent');if(!base||!profile||!plan)return;
  base.querySelector('#groceryPanel')?.remove();
  const week=Math.max(1,Math.min(4,Number(state.mealWeek||currentWeek())||1));
  const review=plan.nutrition?.reviewRequired===true||(typeof nutritionTripleAudit==='function'&&nutritionTripleAudit().some(x=>x.verdict==='BLOCK'));
  const menu=review?null:weekMenu(week);
  const isAllowed=item=>{
    if(typeof foodAllowedByPreferences==='function'&&!foodAllowedByPreferences(item,profile))return false;
    const tokens=typeof dislikeTokens==='function'?dislikeTokens():[];
    const m=item?.[3]||{},text=(String(item?.[1]?.join(' ')||'')+' '+String((m.ingredients||[]).join(' '))).toLowerCase();
    return !tokens.some(t=>text.includes(t));
  };
  const preliminary=groceryModel(menu,{review,allowed:isAllowed});
  const key='c'+(state.cycleNumber||1)+'w'+week+'-'+preliminary.signature;
  const persisted=state.groceryWeeks?.[key]||{};
  const model=preliminary.blocked?preliminary:groceryModel(menu,{allowed:isAllowed,servings:persisted.servings||1});
  const existing=persisted.checked||{};
  const checked=key=>existing[key]===true;
  const safe=esc;
  const labels={protein:L('Proteínas','Proteins','Proteínas'),grain:L('Bases e cereais','Grains and starches','Bases y cereales'),vegetable:L('Vegetais','Vegetables','Vegetales'),declared:L('Ingredientes declarados','Declared ingredients','Ingredientes declarados')};
  const top=`<section class="card groceryPanel" id="groceryPanel" aria-label="${L('Lista semanal de compras','Weekly shopping list','Lista semanal de compras')}">
    <div class="groceryHeading"><div><div class="kicker">NOURISH • ${L('SEMANA','WEEK','SEMANA')} ${week}</div><h2>${L('Lista de compras','Shopping list','Lista de compras')}</h2></div><span class="pill gold">${L('SEMANAL','WEEKLY','SEMANAL')}</span></div>`;
  if(model.blocked){base.insertAdjacentHTML('beforeend',top+`<div class="notice warn">${L('Lista indisponível enquanto refeições ou alergias estão sob revisão. Não sugerimos ingredientes antes da validação.','List unavailable while meals or allergies are under review. No ingredients are recommended before validation.','Lista no disponible mientras las comidas o alergias están bajo revisión. No recomendamos ingredientes antes de la validación.')}</div></section>`);return}
  const owned=model.rows.filter(x=>checked(x.key)).length;
  const list=model.groups.map(({group,rows})=>`<div class="groceryGroup"><h3>${safe(labels[group])}</h3>${rows.map(item=>{
    const index=model.rows.indexOf(item),title=group==='declared'?item.name:groceryLabel(item.name,group);
    return `<label class="groceryLine ${checked(item.key)?'groceryOwned':''}"><input type="checkbox" data-grocery-check="${index}" ${checked(item.key)?'checked':''}><span class="groceryText"><b>${safe(title)}</b><small>${L('Presente em','Appears in','Aparece en')} ${item.occurrences} ${L('refeição(ões)','meal(s)','comida(s)')} • ${model.servings} ${L('porção(ões) por refeição','portion(s) per meal','porción(es) por comida')}</small></span><span class="groceryOwnedTag">${checked(item.key)?L('TENHO','HAVE','TENGO'):L('COMPRAR','BUY','COMPRAR')}</span></label>`}).join('')}</div>`).join('');
  const warning=L('Esta é uma lista preliminar de componentes registrados, NÃO a receita completa. Reconfirme os ingredientes no cardápio e nas embalagens, especialmente para alergias. Frequência de refeições e porções NÃO informam peso, volume nem quantidade a comprar.','This is a preliminary list of recorded components, NOT full recipes. Recheck meal ingredients and packaging, especially for allergies. Meal appearances and servings do NOT establish shopping weights, volumes or quantities.','Esta es una lista preliminar de componentes registrados, NO recetas completas. Revisa ingredientes y etiquetas, especialmente para alergias. Apariciones y porciones NO indican pesos, volúmenes ni cantidades de compra.');
  const noItems=!model.rows.length?`<div class="notice warn">${L('Nenhum ingrediente específico confirmado. Revise o cardápio antes de comprar.','No specific ingredients confirmed. Review the menu before shopping.','No hay ingredientes específicos confirmados. Revisa el menú antes de comprar.')}</div>`:'';
  const incomplete=model.partial?`<div class="notice warn">${L('Revisar ingredientes extras em','Review extra ingredients in','Revisar ingredientes adicionales en')} ${model.partial} ${L('refeições do catálogo.','catalog meals.','comidas del catálogo.')} ${model.missing?L('Algumas não têm componentes registrados.','Some have no components recorded.','Algunas no tienen componentes registrados.'):''}</div>`:'';
  const count=`${owned}/${model.rows.length} ${L('itens já disponíveis','items already available','productos ya disponibles')}`;
  base.insertAdjacentHTML('beforeend',top+`<div class="groceryTools"><label>${L('Porções por refeição','Servings per meal','Porciones por comida')} <select id="groceryServings" aria-label="${L('Porções por refeição','Servings per meal','Porciones por comida')}">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===model.servings?'selected':''}>${n}</option>`).join('')}</select></label><small id="groceryCount">${count}</small></div><div class="notice groceryCaution">${warning}</div>${incomplete}${noItems}${list}<div class="groceryFooter"><button type="button" id="groceryCopy" class="btn btnGhost" ${model.rows.every(x=>checked(x.key))?'disabled':''}>${L('Copiar itens para comprar','Copy items to buy','Copiar productos por comprar')}</button><small>${L('Marque os itens que já tem em casa. A lista acompanha a semana selecionada.','Check items already at home. This list follows the selected week.','Marca lo que ya tienes en casa. La lista sigue la semana elegida.')}</small></div></section>`);
  const panel=base.querySelector('#groceryPanel');
  panel?.querySelector('#groceryServings')?.addEventListener('change',e=>{
    grocerySaveWeek(key,{servings:Number(e.target.value),checked:existing});renderGroceryList();
  });
  panel?.querySelectorAll('[data-grocery-check]').forEach(el=>el.addEventListener('change',()=>{
    const item=model.rows[Number(el.dataset.groceryCheck)];if(!item)return;
    const next={...existing,[item.key]:el.checked};grocerySaveWeek(key,{servings:model.servings,checked:next});renderGroceryList();
  }));
  panel?.querySelector('#groceryCopy')?.addEventListener('click',async()=>{
    const toBuy=model.rows.filter(x=>!checked(x.key)).map(x=>(x.group==='declared'?x.name:groceryLabel(x.name,x.group))+' • '+x.occurrences+' '+L('refeição(ões)','meal(s)','comida(s)'));
    const text=[L('HERCULES • LISTA SEMANAL','HERCULES • WEEKLY LIST','HERCULES • LISTA SEMANAL'),...toBuy,'',warning].join('\n');
    try{if(!navigator.clipboard?.writeText)throw new Error('unavailable');await navigator.clipboard.writeText(text);toast(L('Lista copiada','List copied','Lista copiada'))}
    catch{toast(L('Não foi possível copiar. Selecione os itens na tela.','Could not copy. Use the onscreen list.','No se pudo copiar. Usa la lista en pantalla.'))}
  });
}
