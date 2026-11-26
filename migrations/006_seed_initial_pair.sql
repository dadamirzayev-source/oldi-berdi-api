-- Idempotent seed of the production bootstrap pair.
-- Plaintext PINs are NOT stored here (only scrypt salt+hash). must_change forces rotation.
INSERT INTO pairs (pair_code)
VALUES ('MNEQ9TZK')
ON CONFLICT (pair_code) DO NOTHING;

INSERT INTO role_pins (pair_code, role, salt, pin_hash, updated_at, must_change)
VALUES
  (
    'MNEQ9TZK',
    'A',
    '8fc5c36e6e21f9bc3d846ac3710d48e4',
    'c9c866940f822727a529dcb2f6249684fffae9aba13f49fb7f8fa33f6420f1bf',
    0,
    true
  ),
  (
    'MNEQ9TZK',
    'B',
    'b74c9a01b536060dc538ce55e992023a',
    'a940ec70c0579521c43d2a075710132a5e1b4c84dfccc4c2b58f459d3e24911e',
    0,
    true
  )
ON CONFLICT (pair_code, role) DO NOTHING;
