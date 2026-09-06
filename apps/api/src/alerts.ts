import type { FastifyInstance } from "fastify";
import { scoreHealth, type DiagnosisInput, type Finding } from "@rediskey/diagnosis";
import { userFromSession } from "./auth.js";
import { pool } from "./db.js";

const HIGH_DEBOUNCE_MS = 15 * 60 * 1000;
const HEALTH_DEBOUNCE_MS = 30 * 60 * 1000;
const DIGEST_POLL_MS = 5 * 60 * 1000;

export type OrgAlertSettings = {
  slackWebhookUrl: string | null;
  alertOnHigh: boolean;
  alertHealthEnabled: boolean;
  alertHealthThreshold: number;
  alertDigestEnabled: boolean;
};

type OrgAlertRow = {
  id: string;
  name: string;
  slack_webhook_url: string | null;
  alert_on_high: boolean;
  alert_health_enabled: boolean;
  alert_health_threshold: number;
  alert_health_last_sent_at: Date | null;
  alert_high_last_sent_at: Date | null;
  alert_digest_enabled: boolean;
  alert_digest_last_sent_at: Date | null;
};

function isSlackWebhook(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "hooks.slack.com" || u.hostname.endsWith(".slack.com"))
    );
  } catch {
    return false;
  }
}

async function postSlack(webhookUrl: string, text: string, blocks?: unknown[]): Promise<void> {
  const body: Record<string, unknown> = { text };
  if (blocks) body.blocks = blocks;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`slack webhook ${res.status}: ${detail.slice(0, 200)}`);
  }
}

async function loadOrgForDatabase(databaseId: string): Promise<OrgAlertRow | null> {
  const row = await pool.query<OrgAlertRow>(
    `SELECT o.id, o.name, o.slack_webhook_url, o.alert_on_high, o.alert_health_enabled,
            o.alert_health_threshold, o.alert_health_last_sent_at, o.alert_high_last_sent_at,
            o.alert_digest_enabled, o.alert_digest_last_sent_at
     FROM organizations o
     JOIN databases d ON d.organization_id = o.id
     WHERE d.id = $1`,
    [databaseId],
  );
  return row.rows[0] ?? null;
}

async function databaseLabel(databaseId: string): Promise<string> {
  const row = await pool.query<{ name: string; engine: string }>(
    `SELECT name, engine FROM databases WHERE id = $1`,
    [databaseId],
  );
  const d = row.rows[0];
  return d ? `${d.name} (${d.engine})` : databaseId;
}

function recentlySent(at: Date | null, debounceMs: number): boolean {
  if (!at) return false;
  return Date.now() - at.getTime() < debounceMs;
}

function fmtBytes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

function metricMap(rows: { metric_name: string; value: number }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.metric_name] = r.value;
  return m;
}

async function loadDiagnosisInput(databaseId: string): Promise<{
  input: DiagnosisInput;
  collectedAt: Date | null;
} | null> {
  const latest = await pool.query<{ time: Date }>(
    `SELECT max(time) AS time FROM metrics WHERE database_id = $1`,
    [databaseId],
  );
  const collectedAt = latest.rows[0]?.time ?? null;
  if (!collectedAt) return null;

  const metrics = await pool.query<{ metric_name: string; value: number }>(
    `SELECT metric_name, value FROM metrics WHERE database_id = $1 AND time = $2`,
    [databaseId, collectedAt],
  );
  const map = metricMap(metrics.rows);

  const ks = await pool.query<{
    sampled: number;
    missing_ttl_pct: number;
    big_keys: unknown;
    namespaces: unknown;
  }>(
    `SELECT sampled, missing_ttl_pct, big_keys, namespaces
     FROM keyspace_samples WHERE database_id = $1 ORDER BY time DESC LIMIT 1`,
    [databaseId],
  );

  const slow = await pool.query<{ command: string; duration_us: number }>(
    `SELECT command, duration_us FROM slowlog_events
     WHERE database_id = $1 ORDER BY time DESC LIMIT 16`,
    [databaseId],
  );

  const input: DiagnosisInput = {
    metrics: {
      used_memory: map.used_memory,
      maxmemory: map.maxmemory,
      mem_fragmentation_ratio: map.mem_fragmentation_ratio,
      evicted_keys: map.evicted_keys,
      keyspace_hits: map.keyspace_hits,
      keyspace_misses: map.keyspace_misses,
      connected_clients: map.connected_clients,
      rejected_connections: map.rejected_connections,
      command_latency_p99_ms: map.command_latency_p99_ms,
      instantaneous_ops_per_sec: map.instantaneous_ops_per_sec,
    },
    keyspace: ks.rows[0]
      ? {
          sampled: ks.rows[0].sampled,
          missingTtlPct: ks.rows[0].missing_ttl_pct,
          bigKeys: Array.isArray(ks.rows[0].big_keys)
            ? (ks.rows[0].big_keys as { key: string; bytes: number }[])
            : [],
          namespaces: Array.isArray(ks.rows[0].namespaces)
            ? (ks.rows[0].namespaces as { prefix: string; count: number }[])
            : [],
        }
      : null,
    slowlog: slow.rows.map((r) => ({
      command: r.command,
      durationUs: Number(r.duration_us),
    })),
  };

  return { input, collectedAt };
}

async function buildInstanceDigest(databaseId: string, name: string, engine: string): Promise<string> {
  const packed = await loadDiagnosisInput(databaseId);
  if (!packed) {
    return `*${name}* (${engine})\n_No samples yet — start the agent._`;
  }

  const { input, collectedAt } = packed;
  const health = scoreHealth(input);
  const m = input.metrics;
  const hits = m.keyspace_hits ?? 0;
  const misses = m.keyspace_misses ?? 0;
  const denom = hits + misses;
  const hitRate = denom > 0 ? `${((hits / denom) * 100).toFixed(0)}%` : "—";
  const weak = health.parts
    .filter((p) => p.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((p) => `• ${p.label}: ${p.score} — ${p.why}`)
    .join("\n");

  const findings = await pool.query<{
    severity: string;
    title: string;
    evidence: { action?: string; meaning?: string };
  }>(
    `SELECT severity, title, evidence
     FROM findings
     WHERE database_id = $1 AND resolved_at IS NULL
     ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC
     LIMIT 5`,
    [databaseId],
  );

  const allCounts = await pool.query<{ severity: string; n: string }>(
    `SELECT severity, count(*)::text AS n FROM findings
     WHERE database_id = $1 AND resolved_at IS NULL GROUP BY severity`,
    [databaseId],
  );
  const c = { high: 0, warning: 0, info: 0 };
  for (const row of allCounts.rows) {
    const n = Number(row.n) || 0;
    if (row.severity === "high") c.high = n;
    else if (row.severity === "warning") c.warning = n;
    else c.info = n;
  }

  const findingLines =
    findings.rows.length === 0
      ? "_No open findings._"
      : findings.rows
          .map((f) => {
            const action =
              typeof f.evidence?.action === "string" ? `\n    → ${f.evidence.action}` : "";
            return `• *[${f.severity}]* ${f.title}${action}`;
          })
          .join("\n");

  const when = collectedAt ? collectedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC" : "—";

  return [
    `*${name}* (${engine}) — health *${health.total}/100*`,
    `Last sample: ${when}`,
    `Memory ${fmtBytes(m.used_memory)}${m.maxmemory ? ` / ${fmtBytes(m.maxmemory)}` : ""} · Ops/s ${m.instantaneous_ops_per_sec ?? "—"} · Clients ${m.connected_clients ?? "—"} · P99 ${m.command_latency_p99_ms != null ? `${m.command_latency_p99_ms.toFixed(2)} ms` : "—"} · Hit rate ${hitRate}`,
    `Findings: ${c.high} high · ${c.warning} warning · ${c.info} info`,
    weak ? `*Watch:*\n${weak}` : null,
    `*Top findings / what to check:*\n${findingLines}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendOrgDigest(orgId: string, orgName: string, webhook: string): Promise<void> {
  const dbs = await pool.query<{ id: string; name: string; engine: string }>(
    `SELECT id, name, engine FROM databases WHERE organization_id = $1 ORDER BY created_at`,
    [orgId],
  );

  if (dbs.rows.length === 0) {
    await postSlack(webhook, `Baltan digest — ${orgName}`, [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Baltan 3-hour report* — \`${orgName}\`\n_No Redis instances registered._`,
        },
      },
    ]);
    return;
  }

  const sections: string[] = [];
  for (const db of dbs.rows) {
    sections.push(await buildInstanceDigest(db.id, db.name, db.engine));
  }

  const body = `*Baltan 3-hour report* — \`${orgName}\`\n\n${sections.join("\n\n———\n\n")}`;
  // Slack section text soft limit ~3000; truncate politely
  const text = body.length > 2900 ? `${body.slice(0, 2850)}\n_…truncated_` : body;

  await postSlack(webhook, `Baltan digest — ${orgName}`, [
    {
      type: "section",
      text: { type: "mrkdwn", text },
    },
  ]);
}

/** Claim due orgs and send digests. Safe to call from a timer. */
export async function runDueDigests(log?: { info: Function; warn: Function }): Promise<number> {
  const due = await pool.query<{
    id: string;
    name: string;
    slack_webhook_url: string;
  }>(
    `UPDATE organizations
     SET alert_digest_last_sent_at = now()
     WHERE alert_digest_enabled = true
       AND slack_webhook_url IS NOT NULL
       AND length(trim(slack_webhook_url)) > 0
       AND (
         alert_digest_last_sent_at IS NULL
         OR alert_digest_last_sent_at < now() - interval '3 hours'
       )
     RETURNING id, name, slack_webhook_url`,
  );

  let sent = 0;
  for (const org of due.rows) {
    try {
      await sendOrgDigest(org.id, org.name, org.slack_webhook_url.trim());
      sent++;
      log?.info?.({ orgId: org.id }, "slack digest sent");
    } catch (e) {
      log?.warn?.(e, "slack digest failed");
      // allow retry next poll
      await pool.query(`UPDATE organizations SET alert_digest_last_sent_at = NULL WHERE id = $1`, [
        org.id,
      ]);
    }
  }
  return sent;
}

export function startDigestScheduler(log: { info: Function; warn: Function }): NodeJS.Timeout {
  const tick = () => {
    void runDueDigests(log).catch((e) => log.warn(e, "digest poll failed"));
  };
  // slight delay so migrate finishes / API is ready
  setTimeout(tick, 15_000);
  return setInterval(tick, DIGEST_POLL_MS);
}

/** Fire Slack alerts after ingest. Errors are logged by the caller — never throw into ingest. */
export async function maybeSendAlerts(
  databaseId: string,
  input: DiagnosisInput,
  newHighFindings: Finding[],
): Promise<void> {
  const org = await loadOrgForDatabase(databaseId);
  if (!org?.slack_webhook_url) return;

  const webhook = org.slack_webhook_url.trim();
  if (!webhook) return;

  const label = await databaseLabel(databaseId);

  if (org.alert_on_high && newHighFindings.length > 0) {
    if (!recentlySent(org.alert_high_last_sent_at, HIGH_DEBOUNCE_MS)) {
      const titles = newHighFindings.map((f) => `• ${f.title}`).join("\n");
      await postSlack(
        webhook,
        `Baltan: new high finding on ${label}`,
        [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*New high finding${newHighFindings.length > 1 ? "s" : ""}* on \`${label}\`\n${titles}`,
            },
          },
        ],
      );
      await pool.query(`UPDATE organizations SET alert_high_last_sent_at = now() WHERE id = $1`, [
        org.id,
      ]);
    }
  }

  if (org.alert_health_enabled) {
    const health = scoreHealth(input);
    const threshold = org.alert_health_threshold ?? 60;
    if (health.total < threshold && !recentlySent(org.alert_health_last_sent_at, HEALTH_DEBOUNCE_MS)) {
      await postSlack(
        webhook,
        `Baltan: health ${health.total}/100 on ${label} (threshold ${threshold})`,
        [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Health dropped* on \`${label}\`\nScore *${health.total}/100* (threshold ${threshold})`,
            },
          },
        ],
      );
      await pool.query(`UPDATE organizations SET alert_health_last_sent_at = now() WHERE id = $1`, [
        org.id,
      ]);
    }
  }
}

export function registerAlerts(app: FastifyInstance): void {
  app.get("/v1/org/alerts", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const row = await pool.query<{
      slack_webhook_url: string | null;
      alert_on_high: boolean;
      alert_health_enabled: boolean;
      alert_health_threshold: number;
      alert_digest_enabled: boolean;
    }>(
      `SELECT slack_webhook_url, alert_on_high, alert_health_enabled, alert_health_threshold,
              alert_digest_enabled
       FROM organizations WHERE id = $1`,
      [user.organizationId],
    );
    const o = row.rows[0];
    if (!o) return reply.code(404).send({ error: "organization not found" });

    return {
      slackWebhookUrl: o.slack_webhook_url,
      alertOnHigh: o.alert_on_high,
      alertHealthEnabled: o.alert_health_enabled,
      alertHealthThreshold: o.alert_health_threshold,
      alertDigestEnabled: o.alert_digest_enabled,
    } satisfies OrgAlertSettings;
  });

  app.put("/v1/org/alerts", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const body = req.body as {
      slackWebhookUrl?: string | null;
      alertOnHigh?: boolean;
      alertHealthEnabled?: boolean;
      alertHealthThreshold?: number;
      alertDigestEnabled?: boolean;
    };

    let webhook: string | null =
      typeof body.slackWebhookUrl === "string" ? body.slackWebhookUrl.trim() : null;
    if (webhook === "") webhook = null;
    if (webhook && !isSlackWebhook(webhook)) {
      return reply.code(400).send({ error: "invalid slack webhook url" });
    }

    const threshold = Math.min(
      100,
      Math.max(1, Number(body.alertHealthThreshold ?? 60) || 60),
    );

    await pool.query(
      `UPDATE organizations
       SET slack_webhook_url = $2,
           alert_on_high = COALESCE($3, alert_on_high),
           alert_health_enabled = COALESCE($4, alert_health_enabled),
           alert_health_threshold = $5,
           alert_digest_enabled = COALESCE($6, alert_digest_enabled)
       WHERE id = $1`,
      [
        user.organizationId,
        webhook,
        body.alertOnHigh ?? null,
        body.alertHealthEnabled ?? null,
        threshold,
        body.alertDigestEnabled ?? null,
      ],
    );

    return {
      slackWebhookUrl: webhook,
      alertOnHigh: body.alertOnHigh ?? true,
      alertHealthEnabled: body.alertHealthEnabled ?? true,
      alertHealthThreshold: threshold,
      alertDigestEnabled: body.alertDigestEnabled ?? true,
    };
  });

  app.post("/v1/org/alerts/test", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const row = await pool.query<{ slack_webhook_url: string | null; name: string }>(
      `SELECT slack_webhook_url, name FROM organizations WHERE id = $1`,
      [user.organizationId],
    );
    const webhook = row.rows[0]?.slack_webhook_url?.trim();
    if (!webhook) {
      return reply.code(400).send({ error: "slack webhook not configured" });
    }

    try {
      await postSlack(
        webhook,
        `Baltan test alert from ${row.rows[0].name}`,
        [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Test alert*\nOrg \`${row.rows[0].name}\` can reach Slack.`,
            },
          },
        ],
      );
      return { ok: true };
    } catch (e) {
      req.log.warn(e, "slack test failed");
      return reply.code(502).send({ error: "slack webhook failed" });
    }
  });

  app.post("/v1/org/alerts/digest", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });

    const row = await pool.query<{
      id: string;
      name: string;
      slack_webhook_url: string | null;
    }>(`SELECT id, name, slack_webhook_url FROM organizations WHERE id = $1`, [user.organizationId]);
    const org = row.rows[0];
    const webhook = org?.slack_webhook_url?.trim();
    if (!webhook) {
      return reply.code(400).send({ error: "slack webhook not configured" });
    }

    try {
      await sendOrgDigest(org.id, org.name, webhook);
      await pool.query(`UPDATE organizations SET alert_digest_last_sent_at = now() WHERE id = $1`, [
        org.id,
      ]);
      return { ok: true };
    } catch (e) {
      req.log.warn(e, "slack digest failed");
      return reply.code(502).send({ error: "slack digest failed" });
    }
  });
}
