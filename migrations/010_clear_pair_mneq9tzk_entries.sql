-- One-shot: wipe ledger rows for the baked live pair without touching
-- pairs / role_pins / sessions / bootstrap_state.
DELETE FROM entries WHERE pair_code = 'MNEQ9TZK';
