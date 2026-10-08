import { readFileSync } from "node:fs";
import path from "node:path";
const snapshotDir = process.argv[2];
if (!snapshotDir) {
  console.error("usage: node scripts/assert-reports-match.mjs <snapshot-dir>");
  process.exit(2);
}
const files = ["QA_REPORT_v0.14.1.json", "ADAPTIVE_REPORT_v0.14.1.json", "SECURITY_STATE_REPORT_v0.14.1.json"];
const stable = (value) => JSON.stringify(value, (key, v) => key === "generatedAt" ? undefined : v);
const failed = [];
for (const file of files) {
  const before = JSON.parse(readFileSync(path.join(snapshotDir, file), "utf8"));
  const after = JSON.parse(readFileSync(file, "utf8"));
  if (stable(before) !== stable(after)) failed.push(file);
}
if (failed.length) {
  console.error("Committed reports diverged from npm run check (ignoring generatedAt): " + failed.join(", "));
  process.exit(1);
}
console.log("committed reports match suite output");
