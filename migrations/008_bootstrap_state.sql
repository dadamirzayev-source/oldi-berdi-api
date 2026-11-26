CREATE TABLE IF NOT EXISTS bootstrap_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  done BOOLEAN NOT NULL DEFAULT false,
  pair_code TEXT,
  completed_at BIGINT
);
