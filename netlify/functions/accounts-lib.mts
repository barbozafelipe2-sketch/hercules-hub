import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getDatabase } from "@netlify/database";

const scrypt = promisify(scryptCallback);
const HASH_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TOKEN_TTL_MS = { EMAIL_VERIFY: 24 * 60 * 60_000, PASSWORD_RESET: 20 * 60_000 };

type QueryResult<T = Record<string, unknown>> = { rows: T[] };
type Queryable = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type AuthDatabase = Queryable & {
  transaction?: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>;
  pool?: { connect: () => Promise<Queryable & { release: () => void }> };
};

const database: AuthDatabase = {
  query<T>(sql: string, params?: unknown[]) {
    return getDatabase().pool.query(sql, params) as Promise<QueryResult<T>>;
  },
  get pool() { return getDatabase().pool as AuthDatabase["pool"]; },
};

function normalizeEmail(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("email_invalid");
  return email;
}

function validatePassword(value: unknown): string {
  const password = String(value || "");
  if (password.length < 12 || password.length > 128) throw new Error("password_policy_failed");
  return password;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, HASH_PARAMS) as Buffer;
  return `scrypt$${HASH_PARAMS.N}$${HASH_PARAMS.r}$${HASH_PARAMS.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, nText, rText, pText, saltText, hashText] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || Number(nText) !== HASH_PARAMS.N || Number(rText) !== HASH_PARAMS.r || Number(pText) !== HASH_PARAMS.p || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url"), expected = Buffer.from(hashText, "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await scrypt(password, salt, expected.length, HASH_PARAMS) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch { return false; }
}

function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

async function inTransaction<T>(db: AuthDatabase, run: (tx: Queryable) => Promise<T>): Promise<T> {
  if (db.transaction) return db.transaction(run);
  const pool = db.pool || db;
  if (!("connect" in pool) || typeof pool.connect !== "function") throw new Error("auth_database_unavailable");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}

export function getAccountAuthDatabase(): AuthDatabase { return database; }

export async function createPendingAccount(input: { email: unknown; password: unknown }, db: AuthDatabase = database) {
  const email = normalizeEmail(input.email), password = validatePassword(input.password);
  const accountId = randomUUID();
  const profileId = randomUUID();
  const verifyToken = randomBytes(32).toString("base64url"), passwordHash = await hashPassword(password);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS.EMAIL_VERIFY).toISOString();
  await inTransaction(db, async tx => {
    await tx.query("INSERT INTO hh_accounts (id, email, password_hash, status) VALUES ($1, $2, $3, 'PENDING_VERIFICATION')", [accountId, email, passwordHash]);
    await tx.query("INSERT INTO hh_profiles (id, account_id) VALUES ($1, $2)", [profileId, accountId]);
    await tx.query("INSERT INTO hh_auth_tokens (id, account_id, purpose, token_hash, expires_at) VALUES ($1, $2, 'EMAIL_VERIFY', $3, $4)", [randomUUID(), accountId, tokenHash(verifyToken), expiresAt]);
    await tx.query("INSERT INTO hh_audit_events (id, account_id, profile_id, actor_type, action) VALUES ($1, $2, $3, 'SYSTEM', 'ACCOUNT_REGISTERED')", [randomUUID(), accountId, profileId]);
  });
  return { accountId, profileId, verifyToken, verificationExpiresAt: expiresAt };
}

export async function verifyAccountEmail(token: unknown, db: AuthDatabase = database): Promise<boolean> {
  const raw = String(token || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  return inTransaction(db, async tx => {
    const consumed = await tx.query<{ account_id: string }>("UPDATE hh_auth_tokens SET consumed_at = now() WHERE token_hash = $1 AND purpose = 'EMAIL_VERIFY' AND consumed_at IS NULL AND expires_at > now() RETURNING account_id", [tokenHash(raw)]);
    const accountId = consumed.rows[0]?.account_id;
    if (!accountId) return false;
    const updated = await tx.query<{ id: string }>("UPDATE hh_accounts SET status = 'ACTIVE', email_verified_at = now(), updated_at = now() WHERE id = $1 AND status = 'PENDING_VERIFICATION' RETURNING id", [accountId]);
    if (!updated.rows[0]) throw new Error("account_verification_state_invalid");
    const profile = await tx.query<{ id: string }>("SELECT id FROM hh_profiles WHERE account_id = $1 ORDER BY created_at LIMIT 1", [accountId]);
    await tx.query("INSERT INTO hh_audit_events (id, account_id, profile_id, actor_type, action) VALUES ($1, $2, $3, 'SYSTEM', 'ACCOUNT_EMAIL_VERIFIED')", [randomUUID(), accountId, profile.rows[0]?.id || null]);
    return true;
  });
}

export async function loginAccount(input: { email: unknown; password: unknown }, db: AuthDatabase = database) {
  const email = normalizeEmail(input.email), password = String(input.password || "");
  const result = await db.query<{ id: string; password_hash: string; status: string }>("SELECT id, password_hash, status FROM hh_accounts WHERE lower(btrim(email)) = $1 AND deleted_at IS NULL", [email]);
  const account = result.rows[0];
  if (!account?.password_hash || !await verifyPassword(password, account.password_hash)) throw new Error("credentials_invalid");
  if (account.status !== "ACTIVE") throw new Error("account_not_active");
  const sessionToken = randomBytes(32).toString("base64url"), sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
  const profile = await inTransaction(db, async tx => {
    const profiles = await tx.query<{ id: string; status: string }>("SELECT id, status FROM hh_profiles WHERE account_id = $1 ORDER BY created_at LIMIT 1", [account.id]);
    const selected = profiles.rows[0];
    if (!selected || selected.status === "BLOCKED" || selected.status === "ARCHIVED") throw new Error("profile_unavailable");
    await tx.query("INSERT INTO hh_sessions (id, account_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)", [sessionId, account.id, tokenHash(sessionToken), expiresAt]);
    await tx.query("INSERT INTO hh_audit_events (id, account_id, profile_id, actor_type, action) VALUES ($1, $2, $3, 'USER', 'ACCOUNT_SESSION_CREATED')", [randomUUID(), account.id, selected.id]);
    return selected;
  });
  return { accountId: account.id, profileId: profile.id, token: sessionToken, expiresAt };
}

export async function readAccountSession(token: unknown, db: AuthDatabase = database) {
  const raw = String(token || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const result = await db.query<{ account_id: string; profile_id: string; account_status: string; profile_status: string }>(
    "SELECT s.account_id, p.id AS profile_id, a.status AS account_status, p.status AS profile_status FROM hh_sessions s JOIN hh_accounts a ON a.id = s.account_id JOIN hh_profiles p ON p.account_id = a.id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND a.status = 'ACTIVE' AND a.deleted_at IS NULL ORDER BY p.created_at LIMIT 1",
    [tokenHash(raw)],
  );
  const session = result.rows[0];
  if (!session || session.profile_status === "BLOCKED" || session.profile_status === "ARCHIVED") return null;
  await db.query("UPDATE hh_sessions SET last_seen_at = now() WHERE token_hash = $1 AND revoked_at IS NULL AND last_seen_at < now() - interval '5 minutes'", [tokenHash(raw)]);
  return { scope: "hercules", subject: `profile:${session.profile_id}`, provider: "account", accountId: session.account_id, profileId: session.profile_id, exp: Date.now() + 60_000 };
}

export async function revokeAccountSession(token: unknown, db: AuthDatabase = database): Promise<boolean> {
  const raw = String(token || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  const result = await db.query("UPDATE hh_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id", [tokenHash(raw)]);
  return result.rows.length > 0;
}

export async function createPasswordResetToken(emailInput: unknown, db: AuthDatabase = database) {
  const email = normalizeEmail(emailInput);
  const account = await db.query<{ id: string }>("SELECT id FROM hh_accounts WHERE lower(btrim(email)) = $1 AND status = 'ACTIVE' AND deleted_at IS NULL", [email]);
  if (!account.rows[0]) return null;
  const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + TOKEN_TTL_MS.PASSWORD_RESET).toISOString();
  await db.query("INSERT INTO hh_auth_tokens (id, account_id, purpose, token_hash, expires_at) VALUES ($1, $2, 'PASSWORD_RESET', $3, $4)", [randomUUID(), account.rows[0].id, tokenHash(token), expiresAt]);
  return { accountId: account.rows[0].id, token, expiresAt };
}

export async function resetAccountPassword(input: { token: unknown; password: unknown }, db: AuthDatabase = database): Promise<boolean> {
  const raw = String(input.token || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  const passwordHash = await hashPassword(validatePassword(input.password));
  return inTransaction(db, async tx => {
    const consumed = await tx.query<{ account_id: string }>("UPDATE hh_auth_tokens SET consumed_at = now() WHERE token_hash = $1 AND purpose = 'PASSWORD_RESET' AND consumed_at IS NULL AND expires_at > now() RETURNING account_id", [tokenHash(raw)]);
    const accountId = consumed.rows[0]?.account_id;
    if (!accountId) return false;
    const updated = await tx.query<{ id: string }>("UPDATE hh_accounts SET password_hash = $2, updated_at = now() WHERE id = $1 AND status = 'ACTIVE' RETURNING id", [accountId, passwordHash]);
    if (!updated.rows[0]) throw new Error("account_reset_state_invalid");
    await tx.query("UPDATE hh_sessions SET revoked_at = now() WHERE account_id = $1 AND revoked_at IS NULL", [accountId]);
    await tx.query("INSERT INTO hh_audit_events (id, account_id, actor_type, action) VALUES ($1, $2, 'SYSTEM', 'ACCOUNT_PASSWORD_RESET')", [randomUUID(), accountId]);
    return true;
  });
}

