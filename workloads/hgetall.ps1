# Fill a hash and HGETALL it with a very low slowlog threshold.
docker exec rediskey-redis-1 redis-cli EVAL "for i=1,400 do redis.call('HSET', KEYS[1], 'f'..i, 'v'..i) end return 400" 1 workload:hash
docker exec rediskey-redis-1 redis-cli CONFIG SET slowlog-log-slower-than 0
docker exec rediskey-redis-1 redis-cli HGETALL workload:hash | Out-Null
docker exec rediskey-redis-1 redis-cli CONFIG SET slowlog-log-slower-than 10000
Write-Host "Triggered HGETALL into slowlog. Ingest again for expensive_commands."
