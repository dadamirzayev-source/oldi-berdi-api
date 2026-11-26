-- One-shot: clear login lockouts so operators can sign in after publish.
-- Safe: rate_limits are ephemeral counters only.
DELETE FROM rate_limits WHERE bucket_key LIKE '%login%';
