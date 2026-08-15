# Pilot / production (not a full SaaS launch)

Signup creates an org. Connecting a database returns an **agent token once**. The agent POSTs telemetry with that token. The dashboard uses a **session cookie**, not the agent token.

## Local pilot (this machine)

1. Restart API after `npm install` in the repo root.
2. Open http://localhost:5173 — **Create account** (password 8+ chars).
3. Create a database. Copy `AGENT_TOKEN` and `agent-id`.
4. Run the agent against **your** Redis (Docker playground is `16379`):

```powershell
$env:AGENT_TOKEN="rk_...."
cd apps\agent
go run . --addr 127.0.0.1:16379 --engine redis --agent-id agt_.... --ingest-url http://127.0.0.1:3001 --interval 10s
```

Local ingest to 127.0.0.1 still allows the old `dev-agent-token` if `AGENT_TOKEN` is unset (dev only).

## Hosted API

Set:

```
NODE_ENV=production
DATABASE_URL=postgres://...
SESSION_SECRET=<at least 32 random characters>
FRONTEND_ORIGIN=https://your-app.example
```

```powershell
docker compose -f compose.prod.yaml up -d --build
```

Put TLS in front (Caddy, nginx, or your cloud load balancer). Do not expose Postgres to the internet.

## What this is not

SSO, SOC2, multi-region, or a public marketing site. Invite people you know to a **staging Redis**, not their only production box, until SCAN limits and support are proven.
