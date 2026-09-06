# Drive instance health under the Slack threshold (default 60).
# Requires: Docker Redis, agent ingesting with --interval 10s.
# Run from repo root.
param(
  [string]$Container = "rediskey-redis-1",
  [int]$NoTtl = 500,
  [int]$SlowRounds = 8
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Flood keys with no TTL ===" -ForegroundColor Cyan
& "$here\missing-ttl.ps1" -Count $NoTtl

Write-Host "`n=== Big key ===" -ForegroundColor Cyan
& "$here\big-key.ps1"

Write-Host "`n=== Expensive commands into slowlog ($SlowRounds rounds) ===" -ForegroundColor Cyan
docker exec $Container redis-cli CONFIG SET slowlog-log-slower-than 0 | Out-Null
for ($i = 1; $i -le $SlowRounds; $i++) {
  docker exec $Container redis-cli EVAL "for i=1,500 do redis.call('HSET', KEYS[1], 'f'..i, string.rep('x', 200)) end return 500" 1 "workload:tank:hash:$i" | Out-Null
  docker exec $Container redis-cli HGETALL "workload:tank:hash:$i" | Out-Null
  docker exec $Container redis-cli MEMORY USAGE "workload:tank:hash:$i" | Out-Null
  Write-Host "  round $i/$SlowRounds"
}
docker exec $Container redis-cli CONFIG SET slowlog-log-slower-than 10000 | Out-Null

Write-Host "`n=== Burst load (hurts cache hit rate / ops) ===" -ForegroundColor Cyan
& "$here\load.ps1" -Container $Container -Clients 40 -Requests 40000

Write-Host "`nDone. Keep the agent running with --interval 10s." -ForegroundColor Green
Write-Host "When health drops below your threshold (60), Slack should get a health alert (once per 30m)."
Write-Host "Watch the dashboard Instance Health number."
