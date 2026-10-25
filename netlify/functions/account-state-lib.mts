import { randomUUID } from "node:crypto";
import { getDatabase } from "@netlify/database";
import { decryptParticipantData, encryptParticipantData } from "./encryption-lib.mts";

type StateRow = { source_version: string | number; payload_ciphertext: Buffer | Uint8Array; encryption_key_version: number };
type StateQueryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};
type StateDatabase = StateQueryable & {
  transaction?: <T>(fn: (tx: StateQueryable) => Promise<T>) => Promise<T>;
  connect?: () => Promise<StateDatabase & { release: () => void }>;
};

const database: StateDatabase = {
  query<T>(sql: string, params?: unknown[]) { return getDatabase().pool.query(sql, params) as Promise<{ rows: T[] }>; },
  connect() { return getDatabase().pool.connect() as Promise<StateDatabase & { release: () => void }>; },
};

function uuid(value: unknown): string {
  const id = String(value || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("account_state_identity_invalid");
  return id;
}

export type AccountStateRead = { revision: number; data: unknown | null };
export type AccountStateWrite = { ok: true; revision: number } | { ok: false; reason: "STALE_VERSION" | "PROFILE_UNAVAILABLE" };

export async function loadAccountState(profileIdInput: unknown, accountIdInput: unknown, db: StateDatabase = database): Promise<AccountStateRead> {
  const profileId = uuid(profileIdInput), accountId = uuid(accountIdInput);
  const result = await db.query<StateRow & { profile_status: string; account_status: string }>(
    `SELECT ps.source_version, ps.payload_ciphertext, ps.encryption_key_version,
            p.status AS profile_status, a.status AS account_status
       FROM hh_profiles p
       JOIN hh_accounts a ON a.id = p.account_id
       LEFT JOIN hh_profile_state ps ON ps.profile_id = p.id AND ps.account_id = p.account_id
      WHERE p.id = $1 AND p.account_id = $2 AND a.deleted_at IS NULL`,
    [profileId, accountId],
  );
  const row = result.rows[0];
  if (!row || row.account_status !== "ACTIVE" || ["BLOCKED", "ARCHIVED"].includes(row.profile_status)) throw new Error("account_state_profile_unavailable");
  if (row.source_version == null) return { revision: 0, data: null };
  const revision = Number(row.source_version);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("account_state_version_invalid");
  const data = decryptParticipantData(row.payload_ciphertext, Number(row.encryption_key_version), { purpose: "profile-state", profileId });
  return { revision, data };
}

export async function saveAccountState(input: {
  profileId: unknown; accountId: unknown; expectedRevision: unknown; data: unknown;
}, db: StateDatabase = database): Promise<AccountStateWrite> {
  const profileId = uuid(input.profileId), accountId = uuid(input.accountId);
  const expectedRevision = Number(input.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error("account_state_version_invalid");
  const encrypted = encryptParticipantData(input.data, { purpose: "profile-state", profileId });
  const persist = async (tx: StateQueryable): Promise<AccountStateWrite> => {
    const current = await tx.query<{ status: string; account_status: string }>(
      `SELECT p.status, a.status AS account_status
         FROM hh_profiles p JOIN hh_accounts a ON a.id = p.account_id
        WHERE p.id = $1 AND p.account_id = $2 AND a.deleted_at IS NULL
        FOR UPDATE OF p, a`, [profileId, accountId],
    );
    const row = current.rows[0];
    if (!row || row.account_status !== "ACTIVE" || ["BLOCKED", "ARCHIVED"].includes(row.status)) return { ok: false, reason: "PROFILE_UNAVAILABLE" };
    const nextRevision = expectedRevision + 1;
    const stored = await tx.query(
      `INSERT INTO hh_profile_state (account_id, profile_id, source_version, payload_ciphertext, encryption_key_version, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (profile_id) DO UPDATE
         SET source_version = EXCLUDED.source_version,
             payload_ciphertext = EXCLUDED.payload_ciphertext,
             encryption_key_version = EXCLUDED.encryption_key_version,
             updated_at = now()
       WHERE hh_profile_state.account_id = EXCLUDED.account_id
         AND hh_profile_state.source_version = $6
       RETURNING source_version`,
      [accountId, profileId, nextRevision, encrypted.ciphertext, encrypted.keyVersion, expectedRevision],
    );
    if (!stored.rows.length) return { ok: false, reason: "STALE_VERSION" };
    await tx.query(
      "INSERT INTO hh_audit_events (id, account_id, profile_id, actor_type, action, metadata) VALUES ($1, $2, $3, 'USER', 'PROFILE_STATE_SAVED', $4::jsonb)",
      [randomUUID(), accountId, profileId, JSON.stringify({ revision: nextRevision })],
    );
    return { ok: true, revision: nextRevision };
  };
  if (db.transaction) return db.transaction(persist);
  if (!db.connect) throw new Error("account_state_database_unavailable");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await persist(client);
    if (!result.ok) {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally { client.release(); }
}
