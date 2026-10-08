import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=path.join(root,'hercules-assets-v0.14.0.tar.gz');
const chunksDir=path.join(root,'asset-bundle-v0.14.0');
const expected='25fecf17e97c4dd1a62044094eae0aaee684cd6a221bcc9bcacdf3986bbfd247';
const manifest=path.join(root,'public/assets/asset-manifest.json');

function sha256(bytes){return createHash('sha256').update(bytes).digest('hex')}
function reconstructBundle(){
  if(existsSync(bundle))return;
  if(!existsSync(chunksDir))throw new Error('Missing Hercules v0.14.0 asset bundle chunks.');
  const parts=readdirSync(chunksDir).filter(x=>/^part\d+\.b64$/.test(x)).sort();
  if(!parts.length)throw new Error('Hercules asset bundle chunks are empty.');
  const encoded=parts.map(p=>readFileSync(path.join(chunksDir,p),'utf8').trim()).join('');
  const bytes=Buffer.from(encoded,'base64');
  if(!bytes.length)throw new Error('Hercules asset bundle reconstruction produced no bytes.');
  if(sha256(bytes)!==expected)throw new Error(`Asset bundle integrity mismatch after reconstruction: ${sha256(bytes)}`);
  writeFileSync(bundle,bytes);
}

reconstructBundle();
const bytes=readFileSync(bundle);
const actual=sha256(bytes);
if(actual!==expected)throw new Error(`Asset bundle integrity mismatch: ${actual}`);
if(!existsSync(manifest)){
  rmSync(path.join(root,'public/assets'),{recursive:true,force:true});
  execFileSync('tar',['-xzf',bundle,'-C',root],{stdio:'inherit'});
}
console.log(`Hercules assets ready (${expected.slice(0,12)}…, ${existsSync(chunksDir)?'chunked source':'local bundle'}).`);
