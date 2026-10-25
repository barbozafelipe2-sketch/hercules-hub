import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { NetlifyDB } from "@netlify/database-dev";
import { applyMigrations } from "@netlify/database-dev";
import {
  createPendingAccount,
  createPasswordResetToken,
  loginAccount,
  readAccountSession,
  resetAccountPassword,
  revokeAccountSession,
  verifyAccountEmail,
} from "../netlify/functions/accounts-lib.mts";
import { loadAccountState, saveAccountState } from "../netlify/functions/account-state-lib.mts";

const previousEncryptionKey = process.env.HERCULES_DATA_ENCRYPTION_KEY_V1;
const previousEncryptionVersion = process.env.HERCULES_DATA_ENCRYPTION_CURRENT_VERSION;
process.env.HERCULES_DATA_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64url");
process.env.HERCULES_DATA_ENCRYPTION_CURRENT_VERSION = "1";
const db = new NetlifyDB({ logger: () => {} });
try {
  await db.start();
  await applyMigrations(db, "netlify/database/migrations");

  const pending = await createPendingAccount({ email: "  Participant@Example.test ", password: "Long-enough-test-password-1" }, db);
  assert.equal((await db.query("SELECT email FROM hh_accounts WHERE id = $1", [pending.accountId])).rows[0].email, "participant@example.test", "email is normalized before storage");
  assert.equal((await db.query("SELECT profile_id FROM hh_audit_events WHERE account_id = $1 AND action = 'ACCOUNT_REGISTERED'", [pending.accountId])).rows.length, 1, "registration has a system audit event");
  const storedToken = (await db.query("SELECT token_hash FROM hh_auth_tokens WHERE account_id = $1 AND purpose = 'EMAIL_VERIFY'", [pending.accountId])).rows[0].token_hash;
  assert.notEqual(storedToken, pending.verifyToken, "verification tokens are stored as hashes");
  await assert.rejects(loginAccount({ email: "participant@example.test", password: "Long-enough-test-password-1" }, db), /account_not_active/);
  assert.equal(await verifyAccountEmail("bad", db), false, "malformed verification tokens are rejected");
  assert.equal(await verifyAccountEmail(pending.verifyToken, db), true, "a valid verification token activates the account");
  assert.equal(await verifyAccountEmail(pending.verifyToken, db), false, "verification tokens are single use");

  const session = await loginAccount({ email: "participant@example.test", password: "Long-enough-test-password-1" }, db);
  assert.equal(session.profileId, pending.profileId, "login resolves the permanent profile ID");
  const savedSession = (await db.query("SELECT token_hash FROM hh_sessions WHERE id = (SELECT id FROM hh_sessions WHERE account_id = $1 LIMIT 1)", [pending.accountId])).rows[0];
  assert.notEqual(savedSession.token_hash, session.token, "session tokens are stored only as hashes");
  assert.equal((await readAccountSession(session.token, db)).subject, `profile:${pending.profileId}`, "a session belongs to the permanent profile across devices");
  assert.equal(await revokeAccountSession(session.token, db), true, "an active session can be revoked");
  assert.equal(await readAccountSession(session.token, db), null, "revoked sessions cannot authenticate");

  const second = await loginAccount({ email: "participant@example.test", password: "Long-enough-test-password-1" }, db);
  const reset = await createPasswordResetToken("PARTICIPANT@example.test", db);
  assert.ok(reset?.token, "active accounts can receive a reset token for delivery by the future email adapter");
  assert.notEqual((await db.query("SELECT token_hash FROM hh_auth_tokens WHERE account_id = $1 AND purpose = 'PASSWORD_RESET'", [pending.accountId])).rows[0].token_hash, reset.token, "reset tokens are stored only as hashes");
  assert.equal(await resetAccountPassword({ token: reset.token, password: "Replacement-password-2" }, db), true, "a valid reset token changes the password");
  assert.equal(await readAccountSession(second.token, db), null, "password reset revokes all existing sessions");
  await assert.rejects(loginAccount({ email: "participant@example.test", password: "Long-enough-test-password-1" }, db), /credentials_invalid/);
  const finalSession = await loginAccount({ email: "participant@example.test", password: "Replacement-password-2" }, db);
  assert.equal((await readAccountSession(finalSession.token, db)).profileId, pending.profileId);

  const firstSnapshot = { profile: { note: "sensitive-marker" }, plan: null, state: { cycleNumber: 1 } };
  const firstWrite = await saveAccountState({ profileId: pending.profileId, accountId: pending.accountId, expectedRevision: 0, data: firstSnapshot }, db);
  assert.deepEqual(firstWrite, { ok: true, revision: 1 }, "a profile accepts its first versioned snapshot");
  assert.deepEqual(await loadAccountState(pending.profileId, pending.accountId, db), { revision: 1, data: firstSnapshot }, "the profile snapshot decrypts only in its original profile context");
  const encryptedRow = (await db.query("SELECT payload_ciphertext FROM hh_profile_state WHERE profile_id = $1", [pending.profileId])).rows[0];
  assert.equal(Buffer.from(encryptedRow.payload_ciphertext).includes(Buffer.from("sensitive-marker")), false, "stored profile state is ciphertext, not plaintext");
  await assert.rejects(loadAccountState(pending.profileId, randomUUID(), db), /account_state_profile_unavailable/, "another account cannot read the profile snapshot");
  assert.deepEqual(await saveAccountState({ profileId: pending.profileId, accountId: pending.accountId, expectedRevision: 0, data: { stale: true } }, db), { ok: false, reason: "STALE_VERSION" }, "a stale snapshot cannot overwrite a newer version");

  const concurrentWrites = await Promise.all([
    saveAccountState({ profileId: pending.profileId, accountId: pending.accountId, expectedRevision: 1, data: { winner: "A" } }, db),
    saveAccountState({ profileId: pending.profileId, accountId: pending.accountId, expectedRevision: 1, data: { winner: "B" } }, db),
  ]);
  assert.equal(concurrentWrites.filter(result => result.ok).length, 1, "only one concurrent write can claim a revision");
  assert.equal(concurrentWrites.filter(result => !result.ok && result.reason === "STALE_VERSION").length, 1, "the other concurrent write is rejected as stale");
  const latestState = await loadAccountState(pending.profileId, pending.accountId, db);
  assert.equal(latestState.revision, 2, "concurrent writes advance the profile revision once");
  assert.ok(["A", "B"].includes(latestState.data.winner), "the latest encrypted state is one complete winning snapshot");

  await db.query("UPDATE hh_profiles SET status = 'BLOCKED' WHERE id = $1", [pending.profileId]);
  assert.deepEqual(await saveAccountState({ profileId: pending.profileId, accountId: pending.accountId, expectedRevision: 2, data: { blocked: true } }, db), { ok: false, reason: "PROFILE_UNAVAILABLE" }, "blocked profiles cannot save state");
  await assert.rejects(loadAccountState(pending.profileId, pending.accountId, db), /account_state_profile_unavailable/, "blocked profiles cannot read state");

  await assert.rejects(createPendingAccount({ email: "bad-email", password: "Long-enough-test-password-1" }, db), /email_invalid/);
  await assert.rejects(createPendingAccount({ email: "new@example.test", password: "short" }, db), /password_policy_failed/);
  console.log("Account and persistence checks passed: registration, verification, login/reset, permanent profile identity, token hashing, revocation, encryption, tenant isolation, stale/concurrent write rejection, and profile blocking.");
} finally {
  await db.stop();
  if (previousEncryptionKey === undefined) delete process.env.HERCULES_DATA_ENCRYPTION_KEY_V1;
  else process.env.HERCULES_DATA_ENCRYPTION_KEY_V1 = previousEncryptionKey;
  if (previousEncryptionVersion === undefined) delete process.env.HERCULES_DATA_ENCRYPTION_CURRENT_VERSION;
  else process.env.HERCULES_DATA_ENCRYPTION_CURRENT_VERSION = previousEncryptionVersion;
}
