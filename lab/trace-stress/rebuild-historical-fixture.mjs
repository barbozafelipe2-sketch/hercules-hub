/**
 * Rebuild the immutable, synthetic 28,500-row lab fixture from UTF-8 Base64 shards.
 * GitHub's connected writer cannot commit binary bytes; this representation
 * decodes to the original gzip exactly. Verify BOTH compressed and raw hashes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const folder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const expectedNames = Array.from({ length: 16 }, (_, i) => `historical-28500.csv.gz.b64.${String(i).padStart(2, '0')}`);
const names = readdirSync(folder).filter(name => /^historical-28500\.csv\.gz\.b64\.\d{2}$/.test(name)).sort();
assert.deepEqual(names, expectedNames, 'Missing or extra fixture shards; refuse partial corpus');
const encoded = names.map((name, i) => {
  const part = readFileSync(path.join(folder, name), 'utf8');
  assert.match(part, /^[A-Za-z0-9+/=]+$/, `Non-Base64 bytes in ${name}`);
  assert.equal(part.length, i === names.length - 1 ? 24976 : 26000, `Fixture shard length changed: ${name}`);
  return part;
}).join('');
assert.equal(encoded.length, 414976, 'Unexpected total fixture Base64 length');
const compressed = Buffer.from(encoded, 'base64');
assert.equal(compressed.length, 311232, 'Unexpected compressed fixture size');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(digest(compressed), 'cdb00e24fc1368fffefc462633c5b67b16723ab1307666684b2ebca2cb198cd9', 'Compressed historical fixture integrity failure');
const original = gunzipSync(compressed);
assert.equal(digest(original), 'b1b5bb021161483db4ad5204093cd7e8637363c71099523a04ce2fef0096bdc1', 'Raw historical source lineage mismatch');
const target = path.join(folder, 'historical-28500.csv.gz');
if (existsSync(target)) assert.deepEqual(readFileSync(target), compressed, 'Existing compressed fixture differs; refuse overwrite');
else writeFileSync(target, compressed, { flag: 'wx' });
console.log(JSON.stringify({ status: 'source_verified', compressedBytes: compressed.length, rawSha256: digest(original), shards: names.length }));