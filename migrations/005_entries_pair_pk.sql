-- Scope entry identity per pair so client ids cannot collide across tenants.
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_pkey;
ALTER TABLE entries ADD PRIMARY KEY (pair_code, id);
