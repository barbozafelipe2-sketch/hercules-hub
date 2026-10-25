-- Hercules Hub Phase 1 foundation.
-- Additive-only schema: does not alter or migrate the existing Supabase state.
-- Sensitive payload columns are ciphertext; application-level encryption/decryption
-- must be implemented before writing real participant data to these tables.

CREATE TABLE IF NOT EXISTS hh_accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text,
  status text NOT NULL DEFAULT 'PENDING_VERIFICATION'
    CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'DELETED')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS hh_accounts_email_normalized_uq
  ON hh_accounts (lower(btrim(email)));

CREATE TABLE IF NOT EXISTS hh_profiles (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES hh_accounts(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'en-US'
    CHECK (language IN ('en-US', 'pt-BR', 'es')),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'REVIEW_PENDING', 'BLOCKED', 'ARCHIVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, account_id)
);

CREATE TABLE IF NOT EXISTS hh_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES hh_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(token_hash) >= 64)
);

CREATE INDEX IF NOT EXISTS hh_sessions_account_active_idx
  ON hh_sessions (account_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS hh_auth_tokens (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES hh_accounts(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('EMAIL_VERIFY', 'PASSWORD_RESET')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(token_hash) >= 64)
);

CREATE INDEX IF NOT EXISTS hh_auth_tokens_account_idx
  ON hh_auth_tokens (account_id, purpose, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS hh_onboarding_submissions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  form_version text NOT NULL,
  payload_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id uuid REFERENCES hh_onboarding_submissions(id) ON DELETE SET NULL,
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE CASCADE,
  CHECK (octet_length(payload_ciphertext) > 0),
  CHECK (encryption_key_version > 0)
);

CREATE INDEX IF NOT EXISTS hh_onboarding_profile_time_idx
  ON hh_onboarding_submissions (profile_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS hh_plans (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'REVIEW_PENDING', 'APPROVED', 'ACTIVE', 'SUPERSEDED', 'BLOCKED')),
  audit_status text NOT NULL DEFAULT 'NOT_AUDITED'
    CHECK (audit_status IN ('NOT_AUDITED', 'PASS', 'REVIEW', 'BLOCK')),
  payload_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE CASCADE,
  UNIQUE (id, profile_id, account_id),
  UNIQUE (profile_id, cycle_number, version),
  CHECK (octet_length(payload_ciphertext) > 0),
  CHECK (encryption_key_version > 0),
  CHECK (status <> 'APPROVED' OR audit_status = 'PASS')
);

CREATE INDEX IF NOT EXISTS hh_plans_profile_cycle_idx
  ON hh_plans (profile_id, cycle_number DESC, version DESC);

CREATE TABLE IF NOT EXISTS hh_plan_meals (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  payload_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, profile_id, account_id)
    REFERENCES hh_plans(id, profile_id, account_id) ON DELETE CASCADE,
  CHECK (octet_length(payload_ciphertext) > 0),
  CHECK (encryption_key_version > 0)
);

CREATE INDEX IF NOT EXISTS hh_plan_meals_plan_idx
  ON hh_plan_meals (plan_id);

CREATE TABLE IF NOT EXISTS hh_plan_exercises (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  payload_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (plan_id, profile_id, account_id)
    REFERENCES hh_plans(id, profile_id, account_id) ON DELETE CASCADE,
  CHECK (octet_length(payload_ciphertext) > 0),
  CHECK (encryption_key_version > 0)
);

CREATE INDEX IF NOT EXISTS hh_plan_exercises_plan_idx
  ON hh_plan_exercises (plan_id);

CREATE TABLE IF NOT EXISTS hh_progress_entries (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  source_version bigint NOT NULL CHECK (source_version > 0),
  payload_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE CASCADE,
  CHECK (octet_length(payload_ciphertext) > 0),
  CHECK (encryption_key_version > 0),
  UNIQUE (profile_id, source_version)
);

CREATE INDEX IF NOT EXISTS hh_progress_profile_time_idx
  ON hh_progress_entries (profile_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS hh_review_cases (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'CONTACTED', 'RESOLVED', 'BLOCKED')),
  priority text NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  decision_ciphertext bytea,
  encryption_key_version smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE CASCADE,
  CHECK ((decision_ciphertext IS NULL AND encryption_key_version IS NULL)
      OR (decision_ciphertext IS NOT NULL AND encryption_key_version > 0))
);

CREATE INDEX IF NOT EXISTS hh_review_cases_queue_idx
  ON hh_review_cases (status, priority, created_at)
  WHERE status IN ('PENDING', 'CONTACTED');

CREATE TABLE IF NOT EXISTS hh_profile_blocks (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  reason_code text NOT NULL,
  reason_ciphertext bytea,
  encryption_key_version smallint,
  blocked_by text NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  released_by text,
  released_at timestamptz,
  release_reason_ciphertext bytea,
  release_key_version smallint,
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE CASCADE,
  CHECK ((reason_ciphertext IS NULL AND encryption_key_version IS NULL)
      OR (reason_ciphertext IS NOT NULL AND encryption_key_version > 0)),
  CHECK ((release_reason_ciphertext IS NULL AND release_key_version IS NULL)
      OR (release_reason_ciphertext IS NOT NULL AND release_key_version > 0)),
  CHECK ((released_at IS NULL AND released_by IS NULL)
      OR (released_at IS NOT NULL AND released_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS hh_profile_blocks_active_idx
  ON hh_profile_blocks (profile_id, blocked_at DESC)
  WHERE released_at IS NULL;

CREATE TABLE IF NOT EXISTS hh_monthly_history (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  plan_id uuid,
  payload_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id, profile_id, account_id)
    REFERENCES hh_plans(id, profile_id, account_id) ON DELETE RESTRICT,
  CHECK (octet_length(payload_ciphertext) > 0),
  CHECK (encryption_key_version > 0),
  UNIQUE (profile_id, cycle_number)
);

CREATE TABLE IF NOT EXISTS hh_audit_events (
  id uuid PRIMARY KEY,
  account_id uuid REFERENCES hh_accounts(id) ON DELETE SET NULL,
  profile_id uuid,
  actor_type text NOT NULL CHECK (actor_type IN ('USER', 'ADMIN', 'SYSTEM')),
  actor_id text,
  action text NOT NULL,
  reason_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS hh_audit_profile_time_idx
  ON hh_audit_events (profile_id, created_at DESC);

COMMENT ON TABLE hh_accounts IS
  'Account identity and authentication metadata. Secrets are stored only as hashes.';
COMMENT ON TABLE hh_profiles IS
  'Permanent participant profiles. Application queries must always scope by account_id.';
COMMENT ON TABLE hh_onboarding_submissions IS
  'Immutable onboarding versions; sensitive payloads must be encrypted by the application before insert.';
COMMENT ON TABLE hh_plans IS
  'Versioned plans. Approval is blocked unless deterministic and human audit status is PASS.';
COMMENT ON TABLE hh_progress_entries IS
  'Append-only progress snapshots with monotonic source_version for stale-write protection.';
COMMENT ON TABLE hh_audit_events IS
  'Administrative and system audit trail; metadata must not contain clinical details or secrets.';
