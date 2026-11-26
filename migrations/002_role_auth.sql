CREATE TABLE IF NOT EXISTS role_pins (
  pair_code TEXT NOT NULL REFERENCES pairs(pair_code),
  role TEXT NOT NULL,
  salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (pair_code, role)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  pair_code TEXT NOT NULL,
  role TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_pair_role_idx ON sessions (pair_code, role);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);
