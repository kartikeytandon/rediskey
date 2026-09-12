# Pilot / production (not a full SaaS launch)

Signup creates an org. Connecting a database returns an **agent token once**. The agent POSTs telemetry with that token. The dashboard uses a **session cookie**, not the agent token.

Agent install, SCAN limits, and read-only ACL: [docs/AGENT.md](docs/AGENT.md).

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
FRONTEND_ORIGIN=https://baltan.xyz
```

For the web build, set the canonical site URL (SEO / Open Graph):

```
VITE_SITE_URL=https://baltan.xyz
```

After deploy: submit `https://baltan.xyz/sitemap.xml` in Google Search Console and Bing Webmaster Tools. Marketing routes are indexable; `/app` is `noindex` via meta + `robots.txt` + nginx `X-Robots-Tag`.

Production web builds **prerender** marketing HTML (`/` + guides + legal) so crawlers see real `<title>` / `<h1>` / body without executing JavaScript.

## SEO Day 1 — Search Console (manual, ~20 min)

Do this on the **live** domain after deploy (or once DNS points at the host).

### Google Search Console
1. Open [Google Search Console](https://search.google.com/search-console) → **Add property** → URL prefix `https://baltan.xyz`
2. Verify with either:
   - **HTML tag:** set `VITE_GOOGLE_SITE_VERIFICATION=...` in the web build env, rebuild/redeploy, then Verify  
   - **DNS TXT** (often easier if you control DNS)
3. **Sitemaps** → submit `https://baltan.xyz/sitemap.xml`
4. **URL Inspection** → request indexing for:
   - `https://baltan.xyz/`
   - `https://baltan.xyz/why-is-redis-slow`
   - `https://baltan.xyz/redis-high-memory`
   - `https://baltan.xyz/redis-big-keys`
   - `https://baltan.xyz/redis-vs-redisinsight`

### Bing Webmaster Tools
1. [Bing Webmaster](https://www.bing.com/webmasters) → Add site `https://baltan.xyz`
2. Import from GSC if offered, or verify similarly
3. Submit the same sitemap URL

### Sanity checks
```powershell
curl.exe -sL https://baltan.xyz/robots.txt
curl.exe -sL https://baltan.xyz/sitemap.xml
curl.exe -sL https://baltan.xyz/why-is-redis-slow | findstr /i "<h1> title"
```

You want `robots.txt` to allow `/` and disallow `/app`, and the guide HTML to contain an `<h1>` in the first response (prerender).

```powershell
docker compose -f compose.prod.yaml up -d --build
```

Put TLS in front (Caddy, nginx, or your cloud load balancer). Do not expose Postgres to the internet.

## What this is not

SSO, SOC2, multi-region, or a public marketing site. Invite people you know to a **staging Redis**, not their only production box, until SCAN limits and support are proven.
