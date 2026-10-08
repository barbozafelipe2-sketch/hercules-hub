import { readFileSync } from "node:fs";
const load = (f) => JSON.parse(readFileSync(f, "utf8"));
const qa = load("QA_REPORT_v0.14.1.json");
const ad = load("ADAPTIVE_REPORT_v0.14.1.json");
const sec = load("SECURITY_STATE_REPORT_v0.14.1.json");
const audit = load("RELEASE_AUDIT_v0.14.1.json");
const expected = [
  ["QA_REPORT_v0.14.1.json", qa],
  ["ADAPTIVE_REPORT_v0.14.1.json", ad],
  ["SECURITY_STATE_REPORT_v0.14.1.json", sec]
];
const failed = [];
if (audit.passed !== expected.reduce((n, [, r]) => n + r.passed, 0) || audit.total !== expected.reduce((n, [, r]) => n + r.total, 0)) {
  failed.push(`RELEASE_AUDIT totals ${audit.passed}/${audit.total} do not match suite sum`);
}
for (const [file, report] of expected) {
  const suite = (audit.suites || []).find((s) => s.file === file);
  const reportFailed = report.failed ?? report.total - report.passed;
  if (!suite || suite.passed !== report.passed || suite.total !== report.total || suite.failed !== reportFailed) {
    failed.push(`${file} does not match RELEASE_AUDIT suite entry`);
  }
}
if (failed.length) {
  console.error(failed.join("\n"));
  process.exit(1);
}
console.log(`report consistency OK ${audit.passed}/${audit.total}`);
