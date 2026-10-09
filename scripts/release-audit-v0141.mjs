import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const exists=(p)=>fs.existsSync(path.join(root,p));
const checks=[];
const add=(name,pass,detail='')=>checks.push({name,pass:!!pass,detail:String(detail||'')});
const includes=(s,...xs)=>xs.every(x=>s.includes(x));
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');

const pkg=JSON.parse(read('package.json'));
const html=read('public/index.html');
const js=read('public/app.js');
const css=read('public/app.css');
const sw=read('public/sw.js');
const manifest=JSON.parse(read('public/manifest.webmanifest'));
const assetManifest=JSON.parse(read('public/assets/asset-manifest.json'));
const netlify=read('netlify.toml');
const envExample=read('.env.example');
const ai=read('netlify/functions/ai-lib.mts');
const auth=read('netlify/functions/auth-lib.mts');
const authFn=read('netlify/functions/auth.mts');
const schema=read('netlify/functions/schemas.mts');
const catalog=read('netlify/functions/catalog-lib.mts');
const cycle=read('netlify/functions/cycle-lib.mts');
const generate=read('netlify/functions/generate.mts');
const next=read('netlify/functions/next-cycle.mts');
const restore=read('netlify/functions/restore.mts');
const stateFn=read('netlify/functions/state.mts');
const coach=read('netlify/functions/coach.mts');
const requestLib=read('netlify/functions/request-lib.mts');
const usage=read('netlify/functions/usage-lib.mts');
const trace=read('netlify/functions/trace-lib.mts');
const supa=read('netlify/functions/supabase-lib.mts');

// Release/version coherence.
add('package_version_0141',pkg.version==='0.14.1',pkg.version);
add('app_version_0141',js.includes("const APP_VERSION='0.14.1'"));
add('index_asset_versions_0141',html.includes('app.css?v=0.14.1')&&html.includes('app.js?v=0.14.1'));
add('service_worker_cache_0141',sw.includes("hercules-hub-v0.14.1")&&sw.includes('/app.js?v=0.14.1')&&sw.includes('/app.css?v=0.14.1'));
add('asset_manifest_release_0141',assetManifest.release==='v0.14.1');
const assetChunkDir=path.join(root,'asset-bundle-v0.14.0');
const assetChunkFiles=fs.existsSync(assetChunkDir)?fs.readdirSync(assetChunkDir).filter(x=>/^part\d+\.b64$/.test(x)).sort():[];
add('asset_chunk_transport_present',assetChunkFiles.length>=2,String(assetChunkFiles.length));
let chunkBundleHash='';
try{
  const encoded=assetChunkFiles.map(f=>fs.readFileSync(path.join(assetChunkDir,f),'utf8').trim()).join('');
  chunkBundleHash=crypto.createHash('sha256').update(Buffer.from(encoded,'base64')).digest('hex');
}catch{}
add('asset_chunk_transport_integrity',chunkBundleHash==='25fecf17e97c4dd1a62044094eae0aaee684cd6a221bcc9bcacdf3986bbfd247',chunkBundleHash);
const prepareAssets=read('scripts/prepare-assets.mjs');
add('asset_prepare_reconstructs_chunks',includes(prepareAssets,'asset-bundle-v0.14.0','Buffer.from(encoded,\'base64\')','writeFileSync(bundle,bytes)'));
add('package_lock_present',exists('package-lock.json'));
add('release_check_script_exists',[pkg.scripts?.check,pkg.scripts?.['check:core']].some(x=>String(x||'').includes('node scripts/release-audit-v0141.mjs'))&&exists('scripts/release-audit-v0141.mjs'));
add('readme_0141',read('README.md').includes('# Hercules Hub v0.14.1'));
add('deploy_doc_0141',read('DEPLOY_NETLIFY.md').includes('v0.14.1'));
add('architecture_0141',exists('SYSTEM_ARCHITECTURE_v0.14.1.md'));
add('changelog_0141',exists('CHANGELOG_v0.14.1.md'));

// Device-first UX, no credential/logout UI.
add('no_login_screen',!html.includes('loginScreen')&&!html.includes('loginForm'));
add('no_logout_ui',!/\b(logout|log out|sign out)\b/i.test(html+js));
add('first_launch_language_onboarding',includes(js,"if(!lang){showOnly('languageScreen');return}","else showOnboarding()"));
add('default_language_is_english',html.includes('<html lang="en-US">')&&js.includes("lang||'en-US'")&&!html.includes('Escolha seu idioma • Elige tu idioma'));
add('safety_answers_are_explicit',js.includes("currentPain:'',painAreas:[]")&&js.includes("redFlags:''")&&js.includes("professionalRestrictions:''")&&js.includes('validateOnboardingStep'));
add('review_notify_nonblocking_pain',js.includes("status:trainingRestricted?'RESTRICTED':ownerReviewRequired?'REVIEW_NOTIFY':'CLEAR'")&&generate.includes('conservative shaping and owner review notification'));
add('professional_no_exercise_restriction',read('netlify/functions/safety-lib.mts').includes('PROFESSIONAL_NO_EXERCISE'));
add('owner_review_queue',exists('netlify/functions/review-lib.mts')&&html.includes('name="hercules-review"')&&html.includes('data-netlify-honeypot="bot-field"')&&generate.includes('queueOwnerReview'));
add('review_blob_store_strong_consistency',read('netlify/functions/review-lib.mts').includes('getStore("hercules-reviews",{consistency:"strong"})')&&!read('netlify/functions/review-lib.mts').includes('type:"text",consistency'));
add('review_submission_not_falsely_called_email_sent',read('netlify/functions/review-lib.mts').includes('formSubmitted')&&read('netlify/functions/review-lib.mts').includes('ownerReviewPending:true')&&!read('netlify/functions/review-lib.mts').includes('notificationSent:sent'));
add('review_form_subject_versioned',html.includes('name="subject" value="Hercules review requested"'));
add('fatal_block_prevents_entry',js.includes("fatalBlock=finalAudits.some")&&js.includes("$('#auditBack').classList.remove('hidden');return"));
add('pdf_language_uses_selected_language',js.includes("L(\`RELATÓRIO MENSAL DE PROGRESSO")&&js.includes("'PRIVATE FILE: contains profile and progress data. Do not share publicly.'"));
add('returning_user_direct_home',includes(js,'if(profile&&plan)', 'showApp()'));
add('device_bootstrap_auth',includes(authFn,'action === "bootstrap"','makeDeviceSession','deviceId'));
add('device_cookie_httponly',includes(auth,'HttpOnly','SameSite=Lax','Secure'));
add('device_id_hashed_server_side',includes(auth,'deviceSubject','createHash("sha256")'));
add('no_password_admin_auth',!auth.includes('HERCULES_ADMIN_PASSWORD')&&!authFn.includes('password'));

// Branding preserved.
const logoHashes={
  'public/assets/hercules-hub-logo.png':'19c6349de536046dc5c34fe21c319b3ba65081ffb0e0376f57de7ad75bc3855f',
  'public/assets/hercules-hub-logo-light.png':'216ef0a208fc0f916eb890ec3848328a7624bf446f28bd165d46411417b54ae7',
  'public/assets/hercules-hub-mark-light.png':'c9d8082cbb21cf010994e7e19cd3b7dc4f96ec83fc0e76af1983418ccc91f757'
};
for(const [p,h] of Object.entries(logoHashes))add('official_brand_'+path.basename(p),exists(p)&&sha(p)===h,exists(p)?sha(p):'missing');
add('language_logo_rendered',html.includes('hercules-hub-logo-light.png')&&html.includes('languageLogo'));
add('topbar_logo_rendered',html.includes('topLogo')&&html.includes('hercules-hub-mark-light.png'));
add('brand_css_retained',css.includes('Official Hercules branding — retained intentionally.')&&!css.includes('logo-free UI'));

// Browser syntax / key UI structure.
let browserSyntax=true,browserErr='';try{new vm.Script(js,{filename:'public/app.js'})}catch(e){browserSyntax=false;browserErr=e.message}add('browser_js_syntax',browserSyntax,browserErr);
const requiredIds=['languageScreen','onboardingScreen','auditScreen','shell','settingsBtn','homeContent','trainContent','nourishContent','recoverContent','mindContent','trackContent','evolveContent','settingsOverlay','settingsRows','coachOverlay','coachText','coachSend','exerciseOverlay','exerciseDetail','postWorkoutOverlay','restoreFile','toast'];
for(const id of requiredIds)add('required_dom_'+id,html.includes(`id="${id}"`));
add('coach_enter_newline_behavior',js.includes("e.key==='Enter'&&(e.metaKey||e.ctrlKey)")&&js.includes('autoGrowCoach'));
add('accessible_live_toast',html.includes('role="status" aria-live="polite"'));
add('focus_visible_css',css.includes(':focus-visible'));
add('reduced_motion_css',css.includes('prefers-reduced-motion'));
add('safe_area_layout',css.includes('safe-area-inset-top')&&css.includes('safe-area-inset-bottom'));

// Server syntax.
for(const f of fs.readdirSync(path.join(root,'netlify/functions')).filter(x=>x.endsWith('.mts')).sort()){
  let ok=true,detail='';
  try{execFileSync(process.execPath,['--experimental-strip-types','--check',path.join(root,'netlify/functions',f)],{stdio:'pipe'})}
  catch(e){ok=false;detail=String(e.stderr||e.message).slice(0,300)}
  add('server_syntax_'+f,ok,detail);
}

// Netlify AI Gateway + secrets.
const frontend=html+'\n'+js+'\n'+css;
for(const key of ['OPENAI_API_KEY','GEMINI_API_KEY','ANTHROPIC_API_KEY','OPENROUTER_API_KEY','SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','HERCULES_SESSION_SECRET'])add('secret_not_frontend_'+key,!frontend.includes(key));
add('gateway_provider_envs',includes(ai,'OPENAI_BASE_URL','GOOGLE_GEMINI_BASE_URL','ANTHROPIC_BASE_URL','OPENROUTER_BASE_URL','NETLIFY_AI_GATEWAY_URL'));
add('direct_ai_default_blocked',envExample.includes('HERCULES_ALLOW_DIRECT_AI=false')&&ai.includes('allowDirectAI'));
add('provider_attempt_abort',includes(ai,'AbortController','HERCULES_AI_ATTEMPT_TIMEOUT_MS','_timeout'));
add('fallback_budget_bounded',includes(ai,'HERCULES_AI_FALLBACK_BUDGET_MS','budgetMs=fallbackBudget()','remaining<1500'));
add('latency_defaults',envExample.includes('HERCULES_AI_ATTEMPT_TIMEOUT_MS=3500')&&envExample.includes('HERCULES_AI_FALLBACK_BUDGET_MS=7500'));
add('next_cycle_stage_budgets',includes(next,'input,900,6500','`,700,3500','`,700,6500'));
add('coach_budget',coach.includes('system,input,750,7000'));
add('catalog_budgets',catalog.includes('prompt,1700,5500')&&catalog.includes('prompt,1400,5500'));
add('generate_parallel_reviews',generate.includes('Promise.allSettled(tasks)'));

// Environment variable coverage (auto-injected vars are intentionally omitted from .env.example).
const envNames=[...new Set([...fs.readdirSync(path.join(root,'netlify/functions')).filter(x=>x.endsWith('.mts')).flatMap(f=>[...read('netlify/functions/'+f).matchAll(/Netlify\.env\.get\("([A-Z0-9_]+)"\)/g)].map(m=>m[1]))])];
const autoInjected=new Set(['OPENAI_API_KEY','OPENAI_BASE_URL','GEMINI_API_KEY','GOOGLE_GEMINI_BASE_URL','ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL','OPENROUTER_API_KEY','OPENROUTER_BASE_URL','NETLIFY_AI_GATEWAY_URL']);
const undocumented=envNames.filter(n=>!autoInjected.has(n)&&!envExample.includes(n+'='));
add('all_custom_envs_documented',undocumented.length===0,undocumented.join(','));

// Request/security boundaries.
add('bounded_json_reader',includes(requestLib,'readJsonBounded','Buffer.byteLength'));
add('rate_limit_memory_cleanup',includes(requestLib,'rateLimit','buckets.size>2000'));
add('daily_ai_quota',includes(usage,'consumeDailyQuota','hercules-usage'));
add('generate_rate_and_quota',includes(generate,'rateLimit(req,"generate"','consumeDailyQuota(session.subject,"generate"'));
add('coach_rate_and_quota',includes(coach,'rateLimit(req,"coach"','consumeDailyQuota(session.subject,"coach"'));
add('next_cycle_rate_and_quota',includes(next,'rateLimit(req,"next-cycle"','consumeDailyQuota(session.subject,"next-cycle"'));
add('restore_rate_limit',restore.includes('rateLimit(req,"restore"'));
add('state_payload_zod',stateFn.includes('StateSyncSchema.safeParse'));
add('profile_strict_zod',schema.includes('}).strict();')&&schema.includes('export const ProfileSchema'));
add('bounded_client_state',includes(schema,'ClientStateSchema','checkins:z.array(CheckinSchema).max(90)','traceLab:z.array(TraceSchema).max(40)','cycleHistory:z.array(BoundedJson).max(120)'));
add('csp_self_only_connect',netlify.includes("connect-src 'self'"));
add('csp_no_unsafe_script',!(/script-src[^;]*'unsafe-inline'/.test(netlify)));
add('csp_frame_object_block',includes(netlify,"object-src 'none'","frame-ancestors 'none'"));

// Continuous adaptation Month 2..N.
add('cycle_number_high_bound',schema.includes('cycleNumber:z.number().int().min(1).max(600)'));
add('next_cycle_increments_generic',next.includes('targetCycle=Number(effectiveState.cycleNumber||1)+1'));
add('frontend_activation_uses_server_when_persistent',js.includes("action:'activate-cycle'")&&js.includes('systemStatus.supabaseState'));
add('month28_gate_server',includes(next,'elapsed<28','week4Complete','milestoneComplete("finalMark"','milestoneTimeValid("finalMark"'));
add('month28_gate_client',includes(js,'day>=28&&lastWeekComplete()&&milestoneComplete'));
add('signals_rebuilt_server_side',includes(next,'buildSignals(effectiveState,currentPlan,{},elapsed)','Browser summaries are display hints only'));
add('deterministic_delta_caps_ai',includes(cycle,'AI may make a candidate more conservative','ranks[c]<=ranks[base]'));
add('safety_hold_controls_delta',includes(cycle,'currentPlan?.trainingHold||signals.symptomFlag','trainingAction="hold"'));
add('safety_never_auto_release',includes(next,'safetyReview','requiresReview=safetyReview||!automaticApproved'));
add('deterministic_nonsafety_fallback',includes(next,'deterministicApproved=hardValidation.ok&&!safetyReview&&!explicitAIReject','automaticApproved=finalApproved||deterministicApproved'));
add('explicit_ai_reject_blocks',next.includes('explicitAIReject=challenge.verdict.verdict==="REJECT"'));
add('prior_cycle_history_retained',js.includes('state.cycleHistory=[')&&js.includes('.slice(-120)'));

// Adaptive catalog behavior.
add('generated_meal_schema',includes(schema,'GeneratedMealSchema','source:z.literal("ai-generated")','createdForCycle'));
add('generated_exercise_schema',includes(schema,'GeneratedExerciseSchema','GEN-EX-','source:z.literal("ai-generated")'));
add('catalog_can_fill_meal_gaps',includes(catalog,'gapRoles(plan)','targetMealCount','createMeals'));
add('catalog_can_add_exercise_variations',includes(catalog,'targetExerciseCount','createExercises','conservative accessory or variation candidates'));
add('catalog_mts_generic_syntax',catalog.includes('const uniq=<T,>(xs:T[])'));
add('catalog_preserves_preferences',includes(catalog,'proteinPreferences','grainPreferences','veggiePreferences','openToOtherVeggies','filterMeal'));
add('free_text_dietary_preferences_enforced',includes(catalog,'dietaryPreferenceFlags','mealAllowedByPreferences','LAND_MEAT_RE','EGG_DAIRY_RE')&&includes(js,'dietaryPreferenceFlagsFor','foodAllowedByPreferences','LAND_MEAT_RE','EGG_DAIRY_RE'));
add('closed_veggie_preference_hard_gate',catalog.includes('openToOtherVeggies===false')&&js.includes('openToOtherVeggies===false'));
add('month_menu_cross_week_rotation',js.includes('function monthMenu()')&&js.includes('previousWeekMeals')&&js.includes('monthMealUse'));
add('nutrition_triple_audit_runtime',js.includes('function nutritionTripleAudit()')&&js.includes('mergeNutritionAudit')&&js.includes('NUTRITION QA'));
add('generated_meal_asset_status',schema.includes('assetStatus:z.enum(["new_asset_required","approved_asset"])')&&catalog.includes('assetStatus:"new_asset_required"'));
add('broken_asset_branded_fallback',js.includes("ph.className='assetFallback'")&&css.includes('.assetFallback'));
add('reset_copy_mentions_server_sync',js.includes('synced server copy too'));
add('catalog_allergy_conservative',includes(catalog,'if(plan?.allergyReview)return 0','!plan?.allergyReview'));
add('catalog_carries_forward',includes(catalog,'...existing.meals,...generatedMeals','...existing.exercises,...generatedExercises','carried-forward'));
add('catalog_trace_provenance',includes(next,'generatedMealCount','generatedExerciseCount','bundled-assets+adaptive-catalog'));
add('trace_counts_current_cycle_only',next.includes('generatedMeals:catalogMeta.generatedMealCount||0')&&next.includes('generatedExercises:catalogMeta.generatedExerciseCount||0'));
add('drive_not_runtime_dependency',assetManifest.liveGoogleDriveDependency===false&&assetManifest.runtimeSource==='versioned-asset-bundle');
add('no_drive_runtime_url',!/(drive\.google\.com|docs\.google\.com)/i.test(html+js+ai+catalog+generate+next));

// Trace Lab.
add('trace_v2_schema',schema.includes('hercules-trace-v2')&&trace.includes('schema:"hercules-trace-v2"'));
add('trace_hashes',includes(trace,'SHA-256','inputDigest','outputDigest'));
add('trace_privacy_flags',includes(trace,'rawProfileStoredInTrace:false','rawPromptStoredInTrace:false'));
add('trace_initial_generation',generate.includes('kind:"initial-generation"'));
add('trace_next_cycle',next.includes('kind:"next-cycle"'));
add('trace_ui',includes(js,'DECISION TRACE LAB','inputDigest','outputDigest','renderTraceLab'));

// Backup/report/restore.
add('pdf_export_present',includes(js,'Export Monthly Report','buildPdfBytes','HERCULES_BACKUP_V1_BEGIN'));
add('pdf_integrity_hash',includes(js,'sha256Text(encoded)','integrity:\'sha256:\'+hash'));
add('restore_server_integrity',includes(restore,'Backup integrity check failed','RestoreDataSchema.safeParse','StateSyncSchema.safeParse'));
add('restore_rejects_oversize_client',js.includes('bytes.length>2_000_000'));
add('restore_request_bounded_server',restore.includes('readJsonBounded(req,650_000)'));
add('first_launch_restore',html.includes('restoreFirstLaunch')&&js.includes("restoreFirstLaunch.onclick=chooseRestoreFile"));
add('settings_export_restore',js.includes('id="exportReport"')&&js.includes('id="restoreProgress"'));
add('report_privacy_documented',read('README.md').includes('Treat exported reports as private'));

// Persistence semantics.
add('supabase_server_secret_only',includes(supa,'SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY')&&!frontend.includes('SUPABASE_SECRET_KEY'));
add('state_owner_device_subject',includes(auth,'deviceSubject','device:'));
add('state_cycle_transition_guard',includes(stateFn,'stateCycleWriteAllowed','Cycle changes require approved next-month activation','action==="activate-cycle"'));
add('state_server_started_at',includes(stateFn,'canonicalizeState(payload.state,startedAt)','payload.state.cycleNumber=incomingCycle'));
add('reset_system_server_delete',includes(stateFn,'action==="reset"','stateDelete(session.subject)'));
add('reset_progress_preserves_profile_plan',includes(stateFn,'action==="reset-progress"','profile:existing.profile??null','plan:existing.plan??null'));
add('no_logout_action_backend',!authFn.includes('logout'));

// PWA/assets integrity.
add('manifest_valid',manifest.name==='Hercules Hub'&&manifest.display==='standalone'&&manifest.start_url==='/'&&manifest.scope==='/');
add('apple_touch_icon_present',html.includes('rel="apple-touch-icon"')&&html.includes('hercules-hub-logo.png'));
add('sw_precaches_brand',sw.includes('/assets/hercules-hub-logo.png')&&sw.includes('/assets/hercules-hub-logo-light.png')&&sw.includes('/assets/hercules-hub-mark-light.png'));
add('sw_precaches_release_assets_best_effort',sw.includes('precacheRelease')&&sw.includes("manifest.assets")&&sw.includes('Promise.allSettled'));
for(const icon of manifest.icons||[])add('manifest_icon_exists_'+icon.sizes,exists('public/'+icon.src),icon.src);
add('sw_no_api_cache',sw.includes("url.pathname.startsWith('/api/')")&&sw.includes("if(req.method!=='GET')return"));
add('sw_old_cache_cleanup',sw.includes('keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))'));

let manifestHashesOk=true,manifestMissing=[];
for(const item of assetManifest.assets||[]){
  const rel='public'+item.path;
  if(!exists(rel)){manifestHashesOk=false;manifestMissing.push(item.path);continue}
  if(fs.statSync(path.join(root,rel)).size!==item.bytes||sha(rel)!==item.sha256){manifestHashesOk=false;manifestMissing.push(item.path+':mismatch')}
}
add('asset_manifest_fingerprints_match',manifestHashesOk,manifestMissing.slice(0,12).join(','));
const actualAssets=[];
for(const dir of ['public/assets/exercises','public/assets/home','public/assets/food'])for(const f of fs.readdirSync(path.join(root,dir)))if(fs.statSync(path.join(root,dir,f)).isFile())actualAssets.push(path.relative(path.join(root,'public'),path.join(root,dir,f)));
add('catalog_asset_counts',assetManifest.counts.exercise===34&&assetManifest.counts.home===13&&assetManifest.counts.food===56&&assetManifest.counts.brand===3&&assetManifest.counts.total===106,JSON.stringify(assetManifest.counts));
add('asset_payload_under_10mb',assetManifest.totalBytes<10*1024*1024,String(assetManifest.totalBytes));
const literalAssetRefs=[...new Set([...html.matchAll(/(?:src|href)="(assets\/[A-Za-z0-9_./-]+)"/g)].map(m=>m[1]).concat([...js.matchAll(/["'](assets\/[A-Za-z0-9_./-]+\.(?:webp|png))["']/g)].map(m=>m[1])) )];
const missingRefs=literalAssetRefs.filter(r=>!exists('public/'+r));
add('all_literal_asset_refs_exist',missingRefs.length===0,missingRefs.join(','));

// Documentation semantics.
const docs=read('README.md')+'\n'+read('DEPLOY_NETLIFY.md')+'\n'+read('SYSTEM_ARCHITECTURE_v0.14.1.md');
add('docs_no_password_setup',!docs.includes('HERCULES_ADMIN_PASSWORD')&&!/email\/password auth/i.test(docs));
add('docs_gateway_credit_truth',docs.includes('consumes Netlify credits'));
add('docs_drive_master_not_runtime',docs.includes('master/editorial')&&docs.includes('not a runtime dependency'));

const failed=checks.filter(x=>!x.pass);
for(const c of checks)console.log(`${c.pass?'PASS':'FAIL'}  ${c.name}${c.detail?' :: '+c.detail:''}`);
console.log(`\n${checks.length-failed.length}/${checks.length} checks passed`);
const report={version:'0.14.1',generatedAt:new Date().toISOString(),status:failed.length?'FAIL':'PASS',passed:checks.length-failed.length,total:checks.length,checks};
fs.writeFileSync(path.join(root,'QA_REPORT_v0.14.1.json'),JSON.stringify(report,null,2));
if(failed.length)process.exit(1);
