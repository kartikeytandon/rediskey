# Test V2 findings (with explanations) + optional Slack.
# Run from repo root. Prerequisites: Docker Redis, API (`npm run dev:api`), agent or -Ingest once.
#
# Examples:
#   .\workloads\test-v2.ps1
#   .\workloads\test-v2.ps1 -Ingest -AgentToken "rk_..." -AgentId "agt_..."
#   .\workloads\test-v2.ps1 -SlackTest -Email you@ex.com -Password secret
#   .\workloads\test-v2.ps1 -ForceNewHigh -Ingest -AgentToken "rk_..." -AgentId "agt_..."
#
param(
  [string]$Container = "rediskey-redis-1",
  [string]$Api = "http://127.0.0.1:3001",
  [string]$RedisAddr = "127.0.0.1:6379",
  [switch]$Ingest,
  [string]$AgentToken = $env:AGENT_TOKEN,
  [string]$AgentId = $env:AGENT_ID,
  [switch]$SlackTest,
  [string]$Email = $env:BALTAN_EMAIL,
  [string]$Password = $env:BALTAN_PASSWORD,
  [string]$SlackWebhook = $env:SLACK_WEBHOOK_URL,
  # Resolve open findings first so the next high can fire a real Slack alert (not just Send test)
  [switch]$ForceNewHigh
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`n=== 1) Seed Redis (findings triggers) ===" -ForegroundColor Cyan

if ($ForceNewHigh) {
  Write-Host "Clearing prior flood:* / workload keys so findings can resolve, then reseeding..." -ForegroundColor Yellow
  docker exec $Container redis-cli EVAL @"
local n=0
local cursor='0'
repeat
  local r=redis.call('SCAN', cursor, 'MATCH', 'flood:*', 'COUNT', 500)
  cursor=r[1]
  for _,k in ipairs(r[2]) do redis.call('DEL', k); n=n+1 end
until cursor=='0'
redis.call('DEL', 'workload:huge', 'workload:hash', 'workload:stress:hash')
return n
"@ 0 | Out-Null
  Write-Host "Deleted flood keys. Wait ~1 agent cycle if you want them resolved, then re-run without clearing — continuing reseed now."
}

& "$here\missing-ttl.ps1" -Count 400
& "$here\big-key.ps1"
& "$here\hgetall.ps1"

Write-Host "`n=== 2) Agent ingest ===" -ForegroundColor Cyan
if ($Ingest) {
  if (-not $AgentId) { throw "Pass -AgentId (or set AGENT_ID) for -Ingest" }
  if ($AgentToken) { $env:AGENT_TOKEN = $AgentToken }
  Push-Location (Join-Path (Split-Path $here -Parent) "apps\agent")
  try {
    Write-Host "One-shot ingest → $Api (agent $AgentId)"
    & go run . --addr $RedisAddr --engine redis --agent-id $AgentId --ingest-url $Api
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skipped. Keep your agent running, or re-run with:"
  Write-Host '  .\workloads\test-v2.ps1 -Ingest -AgentId "agt_..." -AgentToken "rk_..."'
}

Write-Host "`n=== 3) Check findings have explanations ===" -ForegroundColor Cyan
Write-Host "After ingest (~10s), expand a finding in the UI — you should see What it means / What to check."
Write-Host "Or re-run with -SlackTest to print meaning/action from the API."

if ($SlackTest) {
  if (-not $Email -or -not $Password) {
    throw "SlackTest needs -Email and -Password (or BALTAN_EMAIL / BALTAN_PASSWORD)"
  }

  Write-Host "`n=== 4) Slack API test + findings dump ===" -ForegroundColor Cyan
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-RestMethod -Uri "$Api/v1/auth/login" -Method POST -ContentType "application/json" `
    -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) -WebSession $session | Out-Null
  $me = Invoke-RestMethod -Uri "$Api/v1/auth/me" -WebSession $session
  Write-Host "Logged in as $($me.email)"

  if ($SlackWebhook) {
    $settings = Invoke-RestMethod -Uri "$Api/v1/org/alerts" -Method PUT -ContentType "application/json" `
      -Body (@{
        slackWebhookUrl = $SlackWebhook
        alertOnHigh = $true
        alertHealthEnabled = $true
        alertHealthThreshold = 60
      } | ConvertTo-Json) -WebSession $session
    Write-Host "Saved webhook: $($settings.slackWebhookUrl)"
  }

  Invoke-RestMethod -Uri "$Api/v1/org/alerts/test" -Method POST -WebSession $session | Out-Null
  Write-Host "Sent Slack test message — check your channel." -ForegroundColor Green

  $dbs = Invoke-RestMethod -Uri "$Api/v1/databases" -WebSession $session
  $dbId = $dbs.databases[0].id
  if ($dbId) {
    $res = Invoke-RestMethod -Uri "$Api/v1/findings?databaseId=$dbId" -WebSession $session
    $list = @($res.findings)
    Write-Host "`nOpen findings ($($list.Count)) — meaning/action sample:"
    foreach ($f in $list | Select-Object -First 3) {
      $m = $f.evidence.meaning
      $a = $f.evidence.action
      Write-Host ("- [{0}] {1}" -f $f.severity, $f.title)
      Write-Host ("    meaning: {0}" -f $(if ($m) { $m } else { "(MISSING — re-ingest with current API)" }))
      Write-Host ("    action:  {0}" -f $(if ($a) { $a } else { "(MISSING)" }))
    }
  }

  Write-Host "`nReal Slack (not just test): needs a *new* high finding after webhook is saved."
  Write-Host "Use -ForceNewHigh -Ingest after clearing debounce, or resolve highs then reseed."
}

Write-Host "`nDone." -ForegroundColor Green
