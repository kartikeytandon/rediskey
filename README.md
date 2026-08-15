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

Open [http://localhost:5173](http://localhost:5173). Cards: memory, hit rate, ops/sec, clients, evictions. Charts: memory and ops/sec (1h / 24h). P99 is blank until we collect latency.

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

V1 of the observability MVP is complete. V2 is AI on structured diagnosis context.
