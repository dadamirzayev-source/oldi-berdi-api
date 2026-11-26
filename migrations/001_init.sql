CREATE TABLE IF NOT EXISTS pairs (
  pair_code TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  pair_code TEXT NOT NULL REFERENCES pairs(pair_code),
  type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  goods_name TEXT,
  price DOUBLE PRECISION,
  quantity DOUBLE PRECISION,
  amount DOUBLE PRECISION,
  currency TEXT NOT NULL,
  note TEXT,
  created_at BIGINT NOT NULL,
  confirmed_at BIGINT,
  confirmed_by TEXT,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS entries_pair_updated_idx ON entries (pair_code, updated_at);
CREATE INDEX IF NOT EXISTS entries_pair_status_idx ON entries (pair_code, status);
