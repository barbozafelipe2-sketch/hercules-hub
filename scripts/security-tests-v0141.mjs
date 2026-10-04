import fs from 'node:fs';
import path from 'node:path';
import {readJsonBounded,rateLimit} from '../netlify/functions/request-lib.mts';
const root=process.cwd(),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const checks=[];const check=(name,ok,detail='')=>{checks.push({name,pass:!!ok,detail});if(!ok)console.error('FAIL',name,detail)};
const html=read('public/index.html'),js=read('public/app.js'),auth=read('netlify/functions/auth.mts'),authlib=read('netlify/functions/auth-lib.mts'),state=read('netlify/functions/state.mts'),restore=read('netlify/functions/restore.mts'),ai=read('netlify/functions/ai-lib.mts'),next=read('netlify/functions/next-cycle.mts'),schemas=read('netlify/functions/schemas.mts'),toml=read('netlify.toml'),env=read('.env.example');

const okReq=new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ok:true})});
check('bounded JSON accepts small body',(await readJsonBounded(okReq,1000)).ok===true);
let tooLarge=false;try{await readJsonBounded(new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json'},body:'"'+('x'.repeat(100))+'"'}),20)}catch(e){tooLarge=e?.status===413}check('bounded JSON rejects oversized body',tooLarge);
let invalid=false;try{await readJsonBounded(new Request('https://example.test/api',{method:'POST',body:'not-json'}),100)}catch(e){invalid=e?.status===400}check('invalid JSON rejected',invalid);
const rateReq=new Request('https://example.test/api',{headers:{'x-nf-client-connection-ip':'203.0.113.8','user-agent':'audit'}});
const r1=rateLimit(rateReq,'audit-'+Date.now(),2,60_000),r2=rateLimit(rateReq,'audit-'+Date.now(),2,60_000); // independent scopes smoke only
check('rate limiter returns structured result',typeof r1.allowed==='boolean'&&typeof r2.retryAfter==='number');
const scope='audit-fixed-'+Date.now();const a=rateLimit(rateReq,scope,2,60_000),b=rateLimit(rateReq,scope,2,60_000),c=rateLimit(rateReq,scope,2,60_000);
check('rate limiter blocks after limit',a.allowed&&b.allowed&&!c.allowed);

check('no password UI or credential constants',!/<input[^>]+password/i.test(html)&&!/HERCULES_ADMIN_PASSWORD|DEFAULT_USERNAME|admin123|123456/i.test(js+auth+authlib));
check('auth accepts only bootstrap action',auth.includes('action === "bootstrap"')&&!/action === "login"|action === "signup"/.test(auth));
check('session cookie HttpOnly',authlib.includes('HttpOnly; SameSite=Lax'));
check('device ids are hashed before subject storage',authlib.includes('createHash("sha256")')&&authlib.includes('device:'));
check('session signature uses HMAC SHA-256',authlib.includes('createHmac("sha256"'));
check('session has expiration validation',authlib.includes('Number(data.exp)<=Date.now()'));

check('browser never reads AI provider secrets',!/(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY|SUPABASE_SECRET_KEY)/.test(html+js));
check('direct AI disabled by env default',env.includes('HERCULES_ALLOW_DIRECT_AI=false'));
check('direct provider route requires explicit allow',ai.includes('directReady=!!(directAllowed&&key)'));
check('Gateway route requires injected base + key',ai.includes('gatewayReady=!!(gateway&&key&&configuredBase)'));
check('AI timeouts and total fallback budget bounded',ai.includes('HERCULES_AI_ATTEMPT_TIMEOUT_MS')&&ai.includes('HERCULES_AI_FALLBACK_BUDGET_MS'));

check('restore validates wrapper + decoded data',restore.includes('RestoreRequestSchema.safeParse')&&restore.includes('RestoreDataSchema.safeParse'));
check('restore validates sha256 integrity',restore.includes('Backup integrity check failed')&&restore.includes('crypto.subtle.digest("SHA-256"'));
check('restore requires device session',restore.includes('Device session required'));
check('restore is rate-limited',restore.includes('rateLimit(req,"restore"'));
check('state save cannot advance month directly',state.includes('stateCycleWriteAllowed')&&state.includes('Cycle changes require approved next-month activation'));
check('next month uses server-approved activation',state.includes('action==="activate-cycle"')&&next.includes('Prepared next month could not be safely staged'));
check('client cannot overwrite staged next month',state.includes('payload.state.nextCycle=existing.state.nextCycle??null'));
check('month range is bounded to 600',schemas.includes('cycleNumber:z.number().int().min(1).max(600)'));
check('trace privacy schema requires false',schemas.includes('rawProfileStoredInTrace:z.literal(false)')&&schemas.includes('rawPromptStoredInTrace:z.literal(false)'));

check('next-month endpoint requires 28 days',next.includes('if(elapsed<28)'));
check('next-month endpoint requires final Week 4',next.includes('if(!lastWeek)'));
check('next-month endpoint requires valid Final Mark time',next.includes('milestoneTimeValid("finalMark"'));
check('browser summary is not canonical evidence',next.includes('Browser summaries are display hints only'));
check('safety review prevents deterministic auto approval',next.includes('const deterministicApproved=hardValidation.ok&&!safetyReview&&!explicitAIReject'));

check('CSP blocks remote runtime connections',toml.includes("connect-src 'self'"));
check('CSP blocks objects + framing',toml.includes("object-src 'none'")&&toml.includes("frame-ancestors 'none'")&&toml.includes('X-Frame-Options = "DENY"'));
check('camera/mic/geolocation denied',toml.includes('Permissions-Policy = "camera=(), microphone=(), geolocation=()"'));
check('service worker is no-store at deploy edge',toml.includes('for = "/sw.js"')&&toml.includes('no-cache, no-store'));

const passed=checks.filter(x=>x.pass).length,failed=checks.length-passed;
const report={release:'0.14.1',suite:'security-state',generatedAt:new Date().toISOString(),passed,failed,total:checks.length,checks};
fs.writeFileSync(path.join(root,'SECURITY_STATE_REPORT_v0.14.1.json'),JSON.stringify(report,null,2)+'\n');
console.log(`security-state: ${passed}/${checks.length} PASS`);if(failed)process.exit(1);
