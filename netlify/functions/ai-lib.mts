export type AIProvider = "openai" | "gemini" | "anthropic" | "openrouter";
export type AIRoute = "netlify-gateway" | "custom-base" | "direct" | "unavailable";

const env=(name:string)=>String(Netlify.env.get(name)||"").trim();
const trimSlash=(s:string)=>s.replace(/\/+$/g,"");
const allowDirectAI=()=>env("HERCULES_ALLOW_DIRECT_AI").toLowerCase()==="true";
const gatewayPresent=()=>!!env("NETLIFY_AI_GATEWAY_URL");
const intEnv=(name:string,fallback:number,min:number,max:number)=>{const n=Number(env(name)||fallback);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback};
const attemptTimeout=()=>intEnv("HERCULES_AI_ATTEMPT_TIMEOUT_MS",3500,2000,9000);
const fallbackBudget=()=>intEnv("HERCULES_AI_FALLBACK_BUDGET_MS",7500,4000,20000);

const PROVIDERS:Record<AIProvider,{key:string;base:string;modelEnv:string;defaultModel:string;directBase:string}>={
  openai:{key:"OPENAI_API_KEY",base:"OPENAI_BASE_URL",modelEnv:"OPENAI_MODEL",defaultModel:"gpt-5.6-luna",directBase:"https://api.openai.com"},
  gemini:{key:"GEMINI_API_KEY",base:"GOOGLE_GEMINI_BASE_URL",modelEnv:"GEMINI_MODEL",defaultModel:"gemini-3.7-flash",directBase:"https://generativelanguage.googleapis.com"},
  anthropic:{key:"ANTHROPIC_API_KEY",base:"ANTHROPIC_BASE_URL",modelEnv:"ANTHROPIC_MODEL",defaultModel:"claude-haiku-4-5",directBase:"https://api.anthropic.com"},
  openrouter:{key:"OPENROUTER_API_KEY",base:"OPENROUTER_BASE_URL",modelEnv:"OPENROUTER_MODEL",defaultModel:"openrouter/auto",directBase:"https://openrouter.ai/api/v1"}
};

function config(provider:AIProvider){
  const p=PROVIDERS[provider],key=env(p.key),configuredBase=env(p.base),gateway=gatewayPresent(),directAllowed=allowDirectAI();
  const gatewayReady=!!(gateway&&key&&configuredBase);
  const directReady=!!(directAllowed&&key);
  const configured=gatewayReady||directReady;
  const base=trimSlash(gatewayReady?configuredBase:(directReady?(configuredBase||p.directBase):""));
  const route:AIRoute=gatewayReady?"netlify-gateway":directReady?(configuredBase?"custom-base":"direct"):"unavailable";
  return {provider,key,base,route,model:env(p.modelEnv)||p.defaultModel,configured,gatewayReady,directAllowed};
}

export function availableProviders(): AIProvider[] {
  return (Object.keys(PROVIDERS) as AIProvider[]).filter(p=>config(p).configured);
}

export function providerStatus(){
  return (Object.keys(PROVIDERS) as AIProvider[]).map(p=>{const c=config(p);return {provider:p,configured:c.configured,route:c.route,model:c.model,gatewayReady:c.gatewayReady}});
}

export function aiRuntimeStatus(){
  return {gatewayPresent:gatewayPresent(),gatewayOnly:!allowDirectAI(),directAIAllowed:allowDirectAI(),providers:providerStatus()};
}

function textFromChat(data:any){
  const c=data?.choices?.[0]?.message?.content;
  if(typeof c==="string")return c.trim();
  if(Array.isArray(c))return c.map((x:any)=>x?.text||x?.content||"").join("\n").trim();
  return "";
}
function textFromGemini(data:any){
  const out:string[]=[];
  for(const cand of data?.candidates||[])for(const c of cand?.content?.parts||[])if(typeof c?.text==="string")out.push(c.text);
  return out.join("\n").trim();
}
function textFromAnthropic(data:any){
  return (data?.content||[]).filter((x:any)=>x?.type==="text"&&typeof x?.text==="string").map((x:any)=>x.text).join("\n").trim();
}

async function parseResponse(r:Response,provider:AIProvider){
  const data=await r.json().catch(()=>({}));
  if(!r.ok){
    const detail=String(data?.error?.message||data?.message||"").replace(/[\r\n]+/g," ").slice(0,180);
    throw new Error(`${provider}_${r.status}${detail?`_${detail}`:""}`);
  }
  return data;
}

export async function callProvider(provider:AIProvider, system:string, input:string, maxTokens=900, timeoutMs=attemptTimeout()){
  const c=config(provider);if(!c.configured)throw new Error(`${provider}_not_available_gateway_only`);
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),Math.max(1500,timeoutMs));
  let r:Response,text="";
  try{
  if(provider==="openai"){
    r=await fetch(`${c.base}/v1/chat/completions`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${c.key}`},body:JSON.stringify({model:c.model,max_completion_tokens:maxTokens,messages:[{role:"system",content:system},{role:"user",content:input}]}),signal:ctl.signal});
    text=textFromChat(await parseResponse(r,provider));
  }else if(provider==="gemini"){
    r=await fetch(`${c.base}/v1beta/models/${encodeURIComponent(c.model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":c.key},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:input}]}],generationConfig:{temperature:0.2,maxOutputTokens:maxTokens}}),signal:ctl.signal});
    text=textFromGemini(await parseResponse(r,provider));
  }else if(provider==="anthropic"){
    r=await fetch(`${c.base}/v1/messages`,{method:"POST",headers:{"Content-Type":"application/json","x-api-key":c.key,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:c.model,system,max_tokens:maxTokens,temperature:0.2,messages:[{role:"user",content:input}]}),signal:ctl.signal});
    text=textFromAnthropic(await parseResponse(r,provider));
  }else{
    const headers:Record<string,string>={"Content-Type":"application/json","Authorization":`Bearer ${c.key}`,"X-OpenRouter-Title":"Hercules Hub"};
    if(env("HERCULES_SITE_URL"))headers["HTTP-Referer"]=env("HERCULES_SITE_URL");
    r=await fetch(`${c.base}/chat/completions`,{method:"POST",headers,body:JSON.stringify({model:c.model,temperature:0.2,max_tokens:maxTokens,messages:[{role:"system",content:system},{role:"user",content:input}]}),signal:ctl.signal});
    text=textFromChat(await parseResponse(r,provider));
  }
    if(!text)throw new Error(`${provider}_empty`);
    return {provider,model:c.model,route:c.route,text};
  }catch(e:any){
    if(e?.name==="AbortError")throw new Error(`${provider}_timeout`);
    throw e;
  }finally{clearTimeout(timer)}
}

export async function callWithFallback(order:AIProvider[], system:string, input:string, maxTokens=900, budgetMs=fallbackBudget()){
  const configured=availableProviders();
  const chain=[...order,...configured].filter((x,i,a)=>a.indexOf(x)===i&&configured.includes(x));
  if(!chain.length)throw new Error(gatewayPresent()?"no_gateway_provider_available":"netlify_ai_gateway_not_active");
  const errors:string[]=[],started=Date.now(),budget=Math.max(4000,Math.min(20000,Math.round(Number(budgetMs)||fallbackBudget())));
  for(const p of chain){
    const remaining=budget-(Date.now()-started);if(remaining<1500)break;
    try{return await callProvider(p,system,input,maxTokens,Math.min(attemptTimeout(),remaining))}
    catch(e:any){errors.push(`${p}:${String(e?.message||"failed").slice(0,200)}`)}
  }
  throw new Error(errors.join(" | ")||"ai_failed");
}
