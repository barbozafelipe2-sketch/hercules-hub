/* Hercules Beta operations-only retention utility.
 * NO browser route, no automatic production writes, and no deploy-time action.
 * Invoke with Netlify site credentials under an authorized operator environment.
 * Preview is the default; deletion needs TWO explicit flags.
 */
const opts=new Set(process.argv.slice(2));
if(opts.has('--help')){
  console.log('Hercules Beta retention: node scripts/prune-beta-feedback.mjs [--execute --confirm-retention]. Default: dry run. Requires authorized Netlify Blobs credentials; never run against unreviewed stores.');
  process.exit(0);
}
const execute=opts.has('--execute')&&opts.has('--confirm-retention');
if(opts.has('--execute')&&!opts.has('--confirm-retention'))throw Error('Refusing deletion without --confirm-retention');
const KEEP_DAYS=30;
const cutoff=Date.now()-KEEP_DAYS*86_400_000;
const {getStore}=await import('@netlify/blobs');
const store=getStore('hercules-beta-feedback');
let reviewed=0,eligible=0,deleted=0,invalid=0;
for await(const page of store.list({prefix:'reports/',paginate:true})){
  for(const {key} of page.blobs){
    // Only accept the exact Beta-report namespace and UUID-shaped keys.
    if(!/^reports\/20\d{2}-(0[1-9]|1[0-2])\/[a-f0-9-]{36}$/i.test(key)){invalid++;continue}
    reviewed++;
    const row=await store.get(key,{type:'json'});
    const ms=Date.parse(String(row?.receivedAt||''));
    if(!Number.isFinite(ms)){invalid++;continue} // do not delete ambiguous records
    if(ms>cutoff)continue;
    eligible++;
    if(execute){await store.delete(key);deleted++}
  }
}
console.log(JSON.stringify({store:'hercules-beta-feedback',dryRun:!execute,retentionDays:KEEP_DAYS,reviewed,eligible,deleted,invalid,generatedAt:new Date().toISOString()}));
if(invalid)process.exitCode=2; // investigate unknown/corrupt entries manually
