CREATE TABLE IF NOT EXISTS email_otps (
  id TEXT PRIMARY KEY,
  pair_code TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS email_otps_lookup_idx
  ON email_otps (pair_code, role, email);

CREATE TABLE IF NOT EXISTS otp_tickets (
  token TEXT PRIMARY KEY,
  pair_code TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);
