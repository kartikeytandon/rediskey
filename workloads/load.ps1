# Sustained or burst load against local Docker Redis. Run from repo root.
# Requires: docker container running (default rediskey-redis-1 on port 6379).
param(
  [string]$Container = "rediskey-redis-1",
  [int]$Clients = 50,
  [int]$Requests = 100000,
  [int]$DurationSec = 0,
  [switch]$SlowCommands
)

function Invoke-Benchmark {
  param([string[]]$Tests)
  $t = ($Tests -join ",")
  docker exec $Container redis-benchmark -t $t -n $Requests -c $Clients -q
}

Write-Host "Load: $Requests requests, $Clients clients" -ForegroundColor Cyan
if ($DurationSec -gt 0) {
  Write-Host "Running for $DurationSec seconds (Ctrl+C to stop early)..." -ForegroundColor Cyan
  $end = (Get-Date).AddSeconds($DurationSec)
  $round = 0
  while ((Get-Date) -lt $end) {
    $round++
    Write-Host "  round $round"
    Invoke-Benchmark @("set", "get", "incr", "lpush", "hset")
    if ($SlowCommands) {
      docker exec $Container redis-cli EVAL "for i=1,200 do redis.call('HSET', KEYS[1], 'f'..i, string.rep('x', 500)) end return 200" 1 workload:stress:hash | Out-Null
      docker exec $Container redis-cli CONFIG SET slowlog-log-slower-than 0 | Out-Null
      docker exec $Container redis-cli HGETALL workload:stress:hash | Out-Null
      docker exec $Container redis-cli CONFIG SET slowlog-log-slower-than 10000 | Out-Null
    }
  }
} else {
  Invoke-Benchmark @("set", "get", "incr", "lpush", "hset")
  if ($SlowCommands) {
    Write-Host "Adding slow HGETALL samples..." -ForegroundColor Cyan
    docker exec $Container redis-cli EVAL "for i=1,400 do redis.call('HSET', KEYS[1], 'f'..i, 'v'..i) end return 400" 1 workload:stress:hash | Out-Null
    docker exec $Container redis-cli CONFIG SET slowlog-log-slower-than 0 | Out-Null
    docker exec $Container redis-cli HGETALL workload:stress:hash | Out-Null
    docker exec $Container redis-cli CONFIG SET slowlog-log-slower-than 10000 | Out-Null
  }
}

Write-Host ""
Write-Host "Done. Keep the agent running and watch the dashboard:" -ForegroundColor Green
Write-Host "  - Ops/sec should spike"
Write-Host "  - P99 may rise (especially after -SlowCommands or -DurationSec)"
Write-Host "  - Run workloads\missing-ttl.ps1 or big-key.ps1 for hygiene/findings"
