# Flood Redis with keys that have no TTL. Run from repo root.
# Requires: docker container rediskey-redis-1
param([int]$Count = 300)

docker exec rediskey-redis-1 redis-cli EVAL "for i=1,$Count do redis.call('SET', 'flood:' .. i, 'nottl') end return $Count" 0
Write-Host "Wrote $Count flood:* keys without TTL. Ingest again to drop data-hygiene score."
