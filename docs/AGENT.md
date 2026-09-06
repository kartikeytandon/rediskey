# Baltan agent

Read-only collector that runs **next to** Redis/Valkey. It never writes keys, never reads values, and never opens Redis to the public internet.

## Start on staging first

1. Point the agent at a **staging** or **non-critical** Redis first.
2. Watch `docker logs` for `scan:` lines — truncated scans are normal on large keyspaces.
3. Use `--no-scan` on very large production keyspaces until you are comfortable with limits.
4. Only then roll out to production with conservative `--scan-limit` and `--scan-timeout`.

## Run (local)

```powershell
cd apps\agent
$env:AGENT_TOKEN="rk_...."
go run . --addr 127.0.0.1:16379 --engine redis --agent-id agt_.... --ingest-url http://127.0.0.1:3001 --interval 10s
```

On this repo’s Docker playground, Redis is often on **port 16379** (not 6379 — that may be a separate WSL Redis).

## SCAN flags

| Flag | Default | Description |
|------|---------|-------------|
| `--scan-limit` | `400` | Max keys to sample per collect (hard cap **2000**) |
| `--scan-timeout` | `2.5s` | Max wall time for SCAN per collect |
| `--no-scan` | off | Skip SCAN entirely; INFO + SLOWLOG + P99 still collected |

Between SCAN batches the agent pauses briefly (8–50 ms, scales with keys sampled) to avoid hammering Redis.

**Logs (stderr):**

- `scan: skipped (--no-scan)`
- `scan: complete N keys`
- `scan: truncated after N keys (key limit|timeout; limit=… timeout=…)`

## Environment variables (Docker)

| Variable | Example | Effect |
|----------|---------|--------|
| `AGENT_TOKEN` | `rk_...` | Required for cloud ingest |
| `REDIS_PASSWORD` | `secret` | AUTH if Redis requires it |
| `BALTAN_NO_SCAN` | `1` | Same as `--no-scan` |
| `BALTAN_SCAN_LIMIT` | `200` | Override default limit |
| `BALTAN_SCAN_TIMEOUT` | `5s` | Override default timeout |

Example Docker run with safer SCAN on production:

```bash
docker run -d --name baltan-agent --restart unless-stopped \
  -e AGENT_TOKEN='rk_...' \
  -e REDIS_PASSWORD='...' \
  ghcr.io/kartikeytandon/baltan:v0.0.5 \
  --addr redis.internal:6379 \
  --engine redis \
  --agent-id agt_... \
  --ingest-url https://your-domain/api \
  --interval 30s \
  --scan-limit 200 \
  --scan-timeout 2s
```

Metrics-only (no key names):

```bash
  ... --no-scan
```

## Read-only Redis ACL (Redis 6+)

Create a dedicated user for Baltan — **no write commands**:

```redis
ACL SETUSER baltan on >YOUR_AGENT_REDIS_PASSWORD ~* &* -@all +@read-only +info +slowlog +latency +memory +client +scan +ttl +ping
```

Then run the agent with `REDIS_PASSWORD` set to that ACL password.

Commands used: `PING`, `INFO`, `SLOWLOG GET`, `CLIENT LIST`, `MEMORY STATS`, `MEMORY USAGE`, `SCAN`, `TTL`, `LATENCY` / `INFO latencystats`.

## What the agent never does

- `GET` / `HGETALL` on your data keys (only `MEMORY USAGE` for size)
- `KEYS` (uses `SCAN` with limits)
- Writes of any kind
- Sends key values or slowlog arguments to the API
