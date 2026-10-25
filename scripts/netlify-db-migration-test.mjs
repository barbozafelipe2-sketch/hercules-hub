import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NetlifyDB } from "@netlify/database-dev";

const directory = await mkdtemp(join(tmpdir(), "hercules-netlify-db-"));
const db = new NetlifyDB({ directory, logger: () => {} });
let accountId;
try {
  await db.start();
  const first = await db.applyMigrations("netlify/database/migrations");
  const second = await db.applyMigrations("netlify/database/migrations");
  assert.equal(first.length, 2, "the Phase 1 migrations should be applied");
  assert.equal(second.length, 0, "reapplying migrations should be idempotent");

  const { rows } = await db.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'hh_%'",
  );
  assert.equal(rows[0].count, 14, "all 14 Phase 1 tables should exist");

  accountId = randomUUID();
  const profileId = randomUUID();
  const otherAccountId = randomUUID();
  const otherProfileId = randomUUID();
  const planId = randomUUID();
  const now = new Date().toISOString();
  await db.query("INSERT INTO hh_accounts (id, email, status) VALUES ($1, $2, 'ACTIVE')", [accountId, `${accountId}@example.test`]);
  await db.query("INSERT INTO hh_accounts (id, email, status) VALUES ($1, $2, 'ACTIVE')", [otherAccountId, `${otherAccountId}@example.test`]);
  await db.query("INSERT INTO hh_profiles (id, account_id) VALUES ($1, $2)", [profileId, accountId]);
  await db.query("INSERT INTO hh_profiles (id, account_id) VALUES ($1, $2)", [otherProfileId, otherAccountId]);

  await assert.rejects(
    db.query(
      "INSERT INTO hh_plans (id, account_id, profile_id, cycle_number, payload_ciphertext, encryption_key_version) VALUES ($1, $2, $3, 1, decode('01', 'hex'), 1)",
      [planId, otherAccountId, profileId],
    ),
    /foreign key/i,
    "a plan cannot link a profile to a different account",
  );
  await assert.rejects(
    db.query(
      "INSERT INTO hh_plans (id, account_id, profile_id, cycle_number, status, audit_status, payload_ciphertext, encryption_key_version) VALUES ($1, $2, $3, 1, 'APPROVED', 'NOT_AUDITED', decode('01', 'hex'), 1)",
      [planId, accountId, profileId],
    ),
    /check constraint/i,
    "an unaudited plan cannot be approved",
  );

  const progressId = randomUUID();
  await db.query(
    "INSERT INTO hh_progress_entries (id, account_id, profile_id, source_version, payload_ciphertext, encryption_key_version) VALUES ($1, $2, $3, 1, decode('01', 'hex'), 1)",
    [progressId, accountId, profileId],
  );
  await assert.rejects(
    db.query(
      "INSERT INTO hh_progress_entries (id, account_id, profile_id, source_version, payload_ciphertext, encryption_key_version) VALUES ($1, $2, $3, 1, decode('02', 'hex'), 1)",
      [randomUUID(), accountId, profileId],
    ),
    /unique constraint/i,
    "a stale duplicate progress version cannot overwrite the existing entry",
  );

  await db.query("INSERT INTO hh_monthly_history (id, account_id, profile_id, cycle_number, payload_ciphertext, encryption_key_version, started_at) VALUES ($1, $2, $3, 1, decode('01', 'hex'), 1, $4)", [randomUUID(), accountId, profileId, now]);
  console.log("Netlify DB migration checks passed: idempotency, schema, account isolation, approval gate, and progress version uniqueness.");
} finally {
  await db.stop();
}

const reopened = new NetlifyDB({ directory, logger: () => {} });
try {
  await reopened.start();
  const { rows } = await reopened.query("SELECT status FROM hh_accounts WHERE id = $1", [accountId]);
  assert.equal(rows[0]?.status, "ACTIVE", "data should persist when the local database restarts");
  console.log("Netlify DB persistence check passed across a local database restart.");
} finally {
  await reopened.stop();
  await rm(directory, { recursive: true, force: true });
}
