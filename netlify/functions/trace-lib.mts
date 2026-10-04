function stable(value){
  if(value===null||typeof value!=="object")return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
}
export async function digest(value){
  const bytes=new TextEncoder().encode(stable(value));
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
export async function makeTrace(input){
  const now=new Date().toISOString();
  const inputDigest=await digest(input.input),outputDigest=await digest(input.output);
  return {
    schema:"hercules-trace-v2",
    traceId:crypto.randomUUID(),
    createdAt:now,
    kind:input.kind,
    appVersion:input.appVersion,
    cycleNumber:input.cycleNumber,
    inputDigest:`sha256:${inputDigest}`,
    outputDigest:`sha256:${outputDigest}`,
    deterministic:input.deterministic,
    reviewers:(input.reviewers||[]).map(x=>({label:x.label||null,provider:x.provider||null,model:x.model||null,route:x.route||null,verdict:x.verdict||null,status:x.status||"completed"})),
    decision:input.decision,
    authority:input.authority||"SUPERVISED",
    assetCatalog:input.assetCatalog||"bundled-release-assets",
    ...(input.catalog?{catalog:input.catalog}:{}),
    privacy:{rawProfileStoredInTrace:false,rawPromptStoredInTrace:false},
    notes:(input.notes||[]).slice(0,12)
  };
}
