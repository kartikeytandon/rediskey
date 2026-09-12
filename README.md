# Rediskey

Redis / Valkey observability platform (V1). Build one day at a time.

**Stack:** Go agent, Fastify + TypeScript API, Vite + React (TS), PostgreSQL/TimescaleDB.

Pilot deploy (signup, per-agent tokens, Docker): [DEPLOY.md](DEPLOY.md).

## Day 1

Skeleton only: empty dashboard, `/health` API, agent hello, local Redis/Valkey/Timescale.

### Prerequisites

- Node.js 20+
- Docker Desktop
- Go 1.22+ (optional on Day 1; required for Day 2 collector unless you install it later)

### Start databases

```bash
docker compose up -d
```

- Redis: `localhost:6379`
- Valkey: `localhost:6380`
- Timescale: `localhost:5432` (user/password/db: `rediskey`)

### Install JS workspaces

```bash
npm install
```

If you run commands in **WSL** but previously ran `npm install` in **Windows** (or the other way around), Vite will fail looking for `@rollup/rollup-linux-x64-gnu`. Reinstall from the same environment you use to run the app:

```bash
rm -rf node_modules
npm install
```

Do not mix PowerShell `npm` and WSL `npm` on this folder.

### API

```bash
npm run dev:api
```

`GET http://localhost:3001/health` → `{ "status": "ok" }`

### Web

```bash
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173). `/api/*` proxies to the API.

### Agent

```bash
cd apps/agent
go run .
```

Prints `ok service=rediskey-agent version=0.0.1`. Compose only runs Redis, Valkey, and Timescale (`compose.yaml`).

## Day 2 — Collector (print JSON, no ingest yet)

Start Redis:

```powershell
docker compose up -d redis
```

From PowerShell (not WSL):

```powershell
cd apps\agent
go run . --print --addr 127.0.0.1:6379 --engine redis
```

Valkey (port 6380):

```powershell
docker compose up -d valkey
go run . --print --addr 127.0.0.1:6380 --engine valkey
```

Stdout is one sanitized JSON sample: INFO metrics, MEMORY STATS, client **count** (not the client list), SLOWLOG command names + duration only. **No key values.**

Optional: `REDIS_PASSWORD` env if the server requires AUTH.

## Day 3 — Ingest + Postgres

Postgres 16 (service `db`) stores metrics. The Timescale image is skipped for now so Compose does not hang on a huge pull; the API still calls `create_hypertable` if Timescale is installed later.

```powershell
cd C:\Users\kartikey.tandon\Desktop\practice_projects\rediskey
docker compose up -d redis db
npm install
npm run dev:api
```

`GET http://localhost:3001/health` should include `"db":"up"`.

In a second terminal, post one sample (Redis must be up):

```powershell
cd apps\agent
go run . --addr 127.0.0.1:6379 --engine redis --ingest-url http://127.0.0.1:3001
```

Repeat every 10s until Ctrl+C:

```powershell
go run . --addr 127.0.0.1:6379 --engine redis --ingest-url http://127.0.0.1:3001 --interval 10s
```

Check rows:

```powershell
curl.exe -s -H "X-Agent-Token: dev-agent-token" "http://127.0.0.1:3001/v1/metrics/latest"
```

Default token is `dev-agent-token` (or `AGENT_TOKEN`). Agent id is `local-dev`.

`--print` still dumps JSON to stdout (Day 2). Without `--print` or `--ingest-url` the agent does nothing.

## Day 4 — Dashboard KPIs

Keep API + Postgres + Redis running. Restart `npm run dev:api` so it loads the snapshot routes.

```powershell
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173). Cards: memory, hit rate, ops/sec, clients, P99 latency (when collected), evictions. Charts: memory and ops/sec (1h / 24h).

For a real chart line, leave the agent looping:

```powershell
cd apps\agent
go run . --addr 127.0.0.1:6379 --engine redis --ingest-url http://127.0.0.1:3001 --interval 10s
```

The UI polls every 10s via the Vite `/api` proxy.

## Day 5 — Keyspace SCAN

The agent rate-limits `SCAN`, checks `TTL`, groups prefixes, and runs `MEMORY USAGE`. It sends **key names and sizes**, never values.

```powershell
docker exec rediskey-redis-1 redis-cli SET session:1 user1
docker exec rediskey-redis-1 redis-cli SET session:3 user3 EX 120
docker exec rediskey-redis-1 redis-cli EVAL "return redis.call('SET', KEYS[1], string.rep('x', 50000))" 1 cache:blob
cd apps\agent
go run . --print --addr 127.0.0.1:6379 --engine redis --ingest-url http://127.0.0.1:3001
```

## Day 6 — Findings

Rules run on each ingest. Restart the API, ingest again, expect `"findings":1` or more. Dashboard lists open findings.

```powershell
cd apps\agent
go run . --addr 127.0.0.1:6379 --engine redis --ingest-url http://127.0.0.1:3001
```

## Day 7 — Health score and workloads

The dashboard shows an explainable **Health /100** (memory, commands, latency, cache, connections, replication, data hygiene).

Restart API + web. Ingest, then optionally break Redis:

```powershell
cd C:\Users\kartikey.tandon\Desktop\practice_projects\rediskey
.\workloads\missing-ttl.ps1
.\workloads\big-key.ps1
cd apps\agent
go run . --addr 127.0.0.1:6379 --engine redis --ingest-url http://127.0.0.1:3001
```

Data-hygiene score should drop; findings should stay or worsen.

V1 of the observability MVP is complete. V2 adds real P99, smarter diagnosis, alerts, and light AI.

## V2 Day 8 — Real P99

The agent reports `command_latency_p99_ms` on each sample. Redis 7+ uses `INFO latencystats` (max p99 across command types). Older servers fall back to a short PING probe sample.

```powershell
cd apps\agent
go run . --print --addr 127.0.0.1:6379 --engine redis
```

Look for `command_latency_p99_ms` in the metrics array. After ingest, the dashboard shows **P99 latency** and the **Latency** health breakdown when the metric is present.

## V2 Day 9 — Safer SCAN

Agent flags cap keyspace sampling so large Redis instances are not stalled:

```powershell
go run . --addr 127.0.0.1:16379 --engine redis --scan-limit 50 --scan-timeout 1s --print
```

Disable SCAN entirely (metrics + slowlog only):

```powershell
go run . --addr 127.0.0.1:16379 --engine redis --no-scan --print
```

Watch stderr for `scan: complete` or `scan: truncated`. Full guide: [docs/AGENT.md](docs/AGENT.md).

## V2 Day 10 — Hot keys + command picture

The agent adds `commandPicture` to each sample: top commands from `INFO commandstats`, slowlog share, and hot-key candidates (OBJECT IDLETIME / FREQ on large keys).

```powershell
go run . --print --addr 127.0.0.1:16379 --engine redis
```

Look for `commandPicture.topCommands`, `slowlogShares`, and `hotKeys`. New findings: slowlog dominance, command concentration, hot key candidates, memory fragmentation.

## V2 Day 11 — Actionable findings + workload-aware rules

Findings include **what it means** and **what to check**. Low hit-rate alerts skip **broker/queue** Redis (e.g. `_kombu`, Celery). Click a finding in the dashboard to expand evidence.

After ingest, open findings on staging — broker Redis should not get `cache_degradation` unless it looks like a cache workload.

## V2 Day 12 — Correlation + light baselines

Diagnosis can merge related signals into one finding:

- **`correlated_latency`** — elevated P99 plus expensive commands, big keys, and/or hot keys
- **`correlated_growth`** — sustained ops + missing TTLs + memory pressure

The snapshot API adds a **`changes`** array: last 1h average vs the prior 24h (1h–25h ago) for memory, ops/sec, clients, and hit rate. If history is short, it falls back to prior 5h. The dashboard shows a **What changed** strip when enough samples exist (hidden until baselines can be computed — no empty placeholders).

Restart the API after pulling so ingest picks up the new correlation rules.

## V2 Day 13 — Cloud polish (multi-DB + auth)

**Database switcher** — dashboard nav lists all Redis instances in your org. Selection is remembered in the browser (`localStorage`). Use **+ Add** to register another instance and get a new agent token.

**Friendly errors** — login/signup show plain English instead of raw JSON.

**Signup gate** — set `SIGNUP_DISABLED=1` on the API to hide signup and return 403 on `/v1/auth/signup`.

**Welcome email** — on signup, if `RESEND_API_KEY` and `MAIL_FROM` are set, Baltan sends a welcome message via [Resend](https://resend.com). Signup still succeeds if mail fails or is unset.

## V2 Day 14 — Agent token lifecycle + install product

**Install** tab in the app nav. After you create or add a Redis instance, Baltan opens Install and shows the agent token **once**. Copy `docker run` / `docker compose` (ingest URL + agent-id). Use **Generate token** / **Rotate token** if you lose it; **Revoke** invalidates the current token.

**API:**
- `POST /v1/databases/:id/agent/rotate` — new token, same agent-id
- `POST /v1/databases/:id/agent/revoke` — invalidate token (agent stops ingesting until rotated)

Agent image: `ghcr.io/kartikeytandon/baltan:v0.0.5` (CI builds on push to `master` when `apps/agent/**` changes; see `apps/agent/docker-compose.agent.yaml`).

```powershell
# After rotate in the UI:
$env:AGENT_TOKEN="rk_..."
$env:AGENT_ID="agt_..."
$env:INGEST_URL="http://127.0.0.1:3001"
cd apps\agent
docker compose -f docker-compose.agent.yaml up -d
```

## V2 Day 15 — Slack alerts + digest

Org-wide Slack Incoming Webhook. Fires on:

- **New high finding** (or severity rising to high) — debounced 15 minutes
- **Health score below threshold** (default 60) — debounced 30 minutes
- **3-hour status report** (optional toggle) — health, metrics, open findings / what to check

**UI:** nav **Alerts** → paste webhook URL, toggles, threshold, **Send test**, **Send report now**.

**API:**
- `GET/PUT /v1/org/alerts` — settings
- `POST /v1/org/alerts/test` — fire a test message
- `POST /v1/org/alerts/digest` — send status report immediately

Alerts run after each agent ingest (failures are logged, never fail the sample). Digests are polled by the API every few minutes when due.

```powershell
# Restart API so migrate adds org alert columns
npm run dev:api
```

In Slack: create an Incoming Webhook, paste it under **Alerts**, click **Send test**.

## V2 Day 16 — Structured diagnosis context

Packages everything Baltan already knows into one stable JSON blob for an LLM (no chat UI yet).

**Package:** `buildDiagnosisContext(...)` in `@rediskey/diagnosis` — schemaVersion `1`, explicit `not_collected` / `null` when data is missing, `notesForModel` telling the model not to invent values.

**API:** `GET /v1/diagnose/context?databaseId=…` (session auth) returns health, KPIs, findings (meaning + action), keyspace, command picture, slowlog, baseline changes, and 1h series summaries (no raw point dumps).

```powershell
# From a signed-in session cookie, or via browser Network tab:
# GET http://127.0.0.1:3001/v1/diagnose/context?databaseId=<uuid>
```

**Tests:**

```powershell
npm run test -w @rediskey/diagnosis
```

Restart the API after pull so the new route is registered.

## V2 Day 17 — AI “Why is Redis slow?” (evidence-only)

One dashboard button → a short diagnosis that **only cites Baltan context** (Day 16 JSON). No chat UI.

**API:** `POST /v1/diagnose/explain?databaseId=…` with optional `{ "question": "Why is Redis slow?" }`.

- If `GEMINI_API_KEY` is set → Google Gemini (`GEMINI_MODEL`, default `gemini-3.6-flash`)
- Else if `OPENAI_API_KEY` is set → OpenAI-compatible chat completions
- Else (or LLM fails) → deterministic **rules** answer from findings + KPIs

```powershell
# Optional LLM (Gemini free tier)
$env:GEMINI_API_KEY="your-key"
# $env:GEMINI_MODEL="gemini-3.6-flash"
npm run dev:api
```

**UI:** Instance health card → **Why is Redis slow?** → panel with answer + cited evidence (`finding` / `kpi` / `health`).

```powershell
# Rules-mode check (no API key needed)
Set-Content -Path login-body.json -Value '{"email":"test@carpl.ai","password":"YOUR_PASSWORD"}' -NoNewline
curl.exe -c cookies.txt -X POST http://127.0.0.1:3001/v1/auth/login -H "Content-Type: application/json" --data-binary "@login-body.json"
curl.exe -b cookies.txt -X POST "http://127.0.0.1:3001/v1/diagnose/explain?databaseId=YOUR_DB_UUID" -H "Content-Type: application/json" -d "{}"
Remove-Item login-body.json
```
