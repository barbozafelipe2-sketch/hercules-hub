function bucketStore(){
  const g=globalThis;
  if(!g.__herculesRateBuckets)g.__herculesRateBuckets=new Map();
  return g.__herculesRateBuckets;
}
function clientKey(req){
  const direct=req.headers.get('x-nf-client-connection-ip')||req.headers.get('client-ip')||'';
  const forwarded=(req.headers.get('x-forwarded-for')||'').split(',')[0]?.trim()||'';
  return direct||forwarded||`unknown:${String(req.headers.get('user-agent')||'').slice(0,80)}`;
}
export async function readJsonBounded(req,maxBytes){
  const declared=Number(req.headers.get('content-length')||0);
  if(Number.isFinite(declared)&&declared>maxBytes)throw Object.assign(new Error('Request too large'),{status:413});
  const text=await req.text();
  if(Buffer.byteLength(text,'utf8')>maxBytes)throw Object.assign(new Error('Request too large'),{status:413});
  try{return JSON.parse(text)}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}
}
export function rateLimit(req,scope,limit,windowMs){
  const buckets=bucketStore(),now=Date.now(),key=`${scope}:${clientKey(req)}`,prior=buckets.get(key);
  const bucket=!prior||prior.resetAt<=now?{count:0,resetAt:now+windowMs}:prior;
  bucket.count+=1;buckets.set(key,bucket);
  if(buckets.size>2000){for(const [k,v] of buckets){if(v.resetAt<=now)buckets.delete(k);if(buckets.size<=1500)break}}
  return {allowed:bucket.count<=limit,retryAfter:Math.max(1,Math.ceil((bucket.resetAt-now)/1000)),remaining:Math.max(0,limit-bucket.count)};
}
