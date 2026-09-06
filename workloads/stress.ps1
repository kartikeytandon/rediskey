# Full local stress pass: load + hygiene + slow commands. Run from repo root.
param(
  [string]$Container = "rediskey-redis-1",
  [int]$DurationSec = 30
)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== 1/4 Burst load ===" -ForegroundColor Yellow
& "$here\load.ps1" -Container $Container -Clients 40 -Requests 80000

Write-Host "`n=== 2/4 Keys without TTL ===" -ForegroundColor Yellow
& "$here\missing-ttl.ps1" -Count 200

Write-Host "`n=== 3/4 Big key ===" -ForegroundColor Yellow
& "$here\big-key.ps1"

Write-Host "`n=== 4/4 Slow HGETALL ===" -ForegroundColor Yellow
& "$here\hgetall.ps1"

if ($DurationSec -gt 0) {
  Write-Host "`n=== Extra sustained load ($DurationSec s) ===" -ForegroundColor Yellow
  & "$here\load.ps1" -Container $Container -DurationSec $DurationSec -Clients 30 -Requests 20000 -SlowCommands
}

Write-Host "`nStress complete. Refresh http://localhost:5173/app in ~10-20s." -ForegroundColor Green
