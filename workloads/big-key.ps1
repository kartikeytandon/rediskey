# One large string key. Run from repo root.
docker exec rediskey-redis-1 redis-cli EVAL "return redis.call('SET', KEYS[1], string.rep('x', 2000000))" 1 workload:huge
Write-Host "Set workload:huge (~2MB). Ingest again for a big_keys finding."
