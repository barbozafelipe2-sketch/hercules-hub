import assert from "node:assert/strict";
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

  await assert.rejects(createPendingAccount({ email: "bad-email", password: "Long-enough-test-password-1" }, db), /email_invalid/);
  await assert.rejects(createPendingAccount({ email: "new@example.test", password: "short" }, db), /password_policy_failed/);
  console.log("Account-auth checks passed: pending registration, email verification, password login/reset, profile identity, hashed tokens, session revocation, and password policy.");
} finally {
  await db.stop();
}
