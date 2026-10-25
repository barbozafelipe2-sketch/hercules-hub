-- Encrypted account-scoped snapshot used while the app migrates from device state.
-- source_version is monotonic and checked with compare-and-swap by the server.
CREATE TABLE IF NOT EXISTS hh_profile_state (
  account_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  source_version bigint NOT NULL CHECK (source_version > 0),
  payload_ciphertext bytea NOT NULL,
  encryption_key_version smallint NOT NULL CHECK (encryption_key_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id),
  FOREIGN KEY (profile_id, account_id)
    REFERENCES hh_profiles(id, account_id) ON DELETE CASCADE,
  CHECK (octet_length(payload_ciphertext) > 0)
);

COMMENT ON TABLE hh_profile_state IS
  'Temporary encrypted full-state snapshot for signed-in profiles; writes use a monotonic compare-and-swap version.';
