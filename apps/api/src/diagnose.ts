import type { FastifyInstance } from "fastify";
import {
  buildDiagnosisContext,
  scoreHealth,
  type DiagnosisInput,
} from "@rediskey/diagnosis";
import { databaseIdForRequest } from "./auth.js";
import { pool } from "./db.js";
import {
  DEFAULT_QUESTION,
  explainFromRules,
  explainWithGemini,
  explainWithLlm,
} from "./explain.js";
import {
  geminiApiKey,
  geminiModel,
  openaiApiKey,
  openaiBaseUrl,
  openaiModel,
} from "./config.js";

type MetricRow = { metric_name: string; value: number; time: Date };

function num(map: Map<string, number>, name: string): number | null {
  const v = map.get(name);
  return typeof v === "number" ? v : null;
}

type ChangeMetric = {
  id: string;
  label: string;
  current: number;
  baseline: number;
  deltaPct: number | null;
  unit: "bytes" | "ops" | "count" | "pct";
};

async function avgMetrics(
  databaseId: string,
  names: string[],
  fromHoursAgo: number,
  toHoursAgo: number,
): Promise<Map<string, number>> {
  const rows = await pool.query<{ metric_name: string; avg: number }>(
    `SELECT metric_name, avg(value)::float8 AS avg
     FROM metrics
     WHERE database_id = $1
       AND metric_name = ANY($2::text[])
       AND time > now() - ($3::text || ' hours')::interval
       AND time <= now() - ($4::text || ' hours')::interval
     GROUP BY metric_name
     HAVING count(*) >= 1`,
    [databaseId, names, String(fromHoursAgo), String(toHoursAgo)],
  );
  return new Map(rows.rows.map((r) => [r.metric_name, Number(r.avg)]));
}

function hitRateFrom(map: Map<string, number>): number | null {
  const hits = map.get("keyspace_hits");
  const misses = map.get("keyspace_misses");
  if (hits == null || misses == null) return null;
  const denom = hits + misses;
  if (denom <= 0) return null;
  return (hits / denom) * 100;
}

function deltaPct(current: number, baseline: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null;
  if (baseline === 0) return current === 0 ? 0 : null;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

async function buildChanges(databaseId: string): Promise<{
  metrics: ChangeMetric[];
  window: "prior_24h" | "prior_5h";
} | null> {
  const names = [
    "used_memory",
    "instantaneous_ops_per_sec",
    "connected_clients",
    "keyspace_hits",
    "keyspace_misses",
  ];

  const pack = async (
    fromHoursAgo: number,
    toHoursAgo: number,
    window: "prior_24h" | "prior_5h",
  ) => {
    const [current, baseline] = await Promise.all([
      avgMetrics(databaseId, names, 1, 0),
      avgMetrics(databaseId, names, fromHoursAgo, toHoursAgo),
    ]);

    const out: ChangeMetric[] = [];
    const push = (
      id: string,
      label: string,
      cur: number | null | undefined,
      base: number | null | undefined,
      unit: ChangeMetric["unit"],
    ) => {
      if (cur == null || base == null || !Number.isFinite(cur) || !Number.isFinite(base)) return;
      out.push({
        id,
        label,
        current: cur,
        baseline: base,
        deltaPct: deltaPct(cur, base),
        unit,
      });
    };

    push("memory", "Memory", current.get("used_memory"), baseline.get("used_memory"), "bytes");
    push(
      "ops",
      "Ops / sec",
      current.get("instantaneous_ops_per_sec"),
      baseline.get("instantaneous_ops_per_sec"),
      "ops",
    );
    push(
      "clients",
      "Clients",
      current.get("connected_clients"),
      baseline.get("connected_clients"),
      "count",
    );
    push("hitRate", "Hit rate", hitRateFrom(current), hitRateFrom(baseline), "pct");
    return out.length > 0 ? { metrics: out, window } : null;
  };

  return (await pack(25, 1, "prior_24h")) ?? (await pack(6, 1, "prior_5h"));
}

async function loadSeriesSummary(
  databaseId: string,
  metric: string,
  hours: number,
): Promise<{ metric: string; hours: number; points: { time: Date; value: number }[] }> {
  const points = await pool.query<{ time: Date; value: number }>(
    `SELECT time, value
     FROM metrics
     WHERE database_id = $1 AND metric_name = $2 AND time > now() - ($3::text || ' hours')::interval
     ORDER BY time ASC`,
    [databaseId, metric, String(hours)],
  );
  return { metric, hours, points: points.rows };
}

export async function loadDiagnosisContext(databaseId: string) {
  const rows = await pool.query<MetricRow>(
    `SELECT DISTINCT ON (metric_name) metric_name, value, time
     FROM metrics
     WHERE database_id = $1
     ORDER BY metric_name, time DESC`,
    [databaseId],
  );
  const map = new Map(rows.rows.map((r) => [r.metric_name, r.value]));
  const collectedAt = rows.rows[0]?.time ?? null;

  const used = num(map, "used_memory");
  const max = num(map, "maxmemory");
  const hits = num(map, "keyspace_hits") ?? 0;
  const misses = num(map, "keyspace_misses") ?? 0;
  const hitDenom = hits + misses;
  const memoryPct = used != null && max != null && max > 0 ? (used / max) * 100 : null;
  const hitRate = hitDenom > 0 ? (hits / hitDenom) * 100 : null;

  const ks = await pool.query<{
    sampled: number;
    with_ttl: number;
    without_ttl: number;
    missing_ttl_pct: number;
    namespaces: unknown;
    big_keys: unknown;
    scan_truncated: boolean;
    scan_complete: boolean;
  }>(
    `SELECT sampled, with_ttl, without_ttl, missing_ttl_pct, namespaces, big_keys,
            scan_truncated, scan_complete
     FROM keyspace_samples
     WHERE database_id = $1
     ORDER BY time DESC
     LIMIT 1`,
    [databaseId],
  );

  const metricsObj = Object.fromEntries(map);
  const keyspace = ks.rows[0]
    ? {
        sampled: ks.rows[0].sampled,
        withTtl: ks.rows[0].with_ttl,
        withoutTtl: ks.rows[0].without_ttl,
        missingTtlPct: ks.rows[0].missing_ttl_pct,
        namespaces: ks.rows[0].namespaces,
        bigKeys: ks.rows[0].big_keys,
        scanTruncated: Boolean(ks.rows[0].scan_truncated),
        scanComplete: Boolean(ks.rows[0].scan_complete),
      }
    : null;

  const diagnosisInput: DiagnosisInput = {
    metrics: metricsObj,
    keyspace: keyspace
      ? {
          sampled: keyspace.sampled,
          missingTtlPct: keyspace.missingTtlPct,
          namespaces: Array.isArray(keyspace.namespaces)
            ? (keyspace.namespaces as { prefix: string; count: number }[])
            : [],
          bigKeys: Array.isArray(keyspace.bigKeys)
            ? (keyspace.bigKeys as { key: string; bytes: number }[])
            : [],
        }
      : null,
    slowlog: [],
  };

  const slow = await pool.query<{ command: string; duration_us: string }>(
    `SELECT command, duration_us::text
     FROM slowlog_events
     WHERE database_id = $1
     ORDER BY time DESC
     LIMIT 16`,
    [databaseId],
  );
  diagnosisInput.slowlog = slow.rows.map((r) => ({
    command: r.command,
    durationUs: Number(r.duration_us),
  }));

  const cp = await pool.query<{
    top_commands: unknown;
    slowlog_shares: unknown;
    hot_keys: unknown;
  }>(
    `SELECT top_commands, slowlog_shares, hot_keys
     FROM command_picture_samples
     WHERE database_id = $1
     ORDER BY time DESC
     LIMIT 1`,
    [databaseId],
  );
  if (cp.rows[0]) {
    diagnosisInput.commandPicture = {
      topCommands: Array.isArray(cp.rows[0].top_commands)
        ? (cp.rows[0].top_commands as {
            command: string;
            calls: number;
            usec: number;
            usecPerCall: number;
          }[])
        : [],
      slowlogShares: Array.isArray(cp.rows[0].slowlog_shares)
        ? (cp.rows[0].slowlog_shares as {
            command: string;
            count: number;
            sharePct: number;
            totalDurationUs: number;
          }[])
        : [],
      hotKeys: Array.isArray(cp.rows[0].hot_keys)
        ? (cp.rows[0].hot_keys as {
            key: string;
            bytes: number;
            idleSeconds?: number;
            freq?: number;
          }[])
        : [],
    };
  }

  const health = scoreHealth(diagnosisInput);
  const changePack = await buildChanges(databaseId);

  const findings = await pool.query<{
    id: string;
    severity: string;
    category: string;
    title: string;
    evidence: Record<string, unknown>;
    created_at: Date;
  }>(
    `SELECT id, severity, category, title, evidence, created_at
     FROM findings
     WHERE database_id = $1 AND resolved_at IS NULL
     ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC`,
    [databaseId],
  );

  const seriesMetrics = [
    "used_memory",
    "instantaneous_ops_per_sec",
    "connected_clients",
    "command_latency_p99_ms",
  ];
  const series = await Promise.all(seriesMetrics.map((m) => loadSeriesSummary(databaseId, m, 1)));

  return buildDiagnosisContext({
    snapshot: {
      collectedAt,
      health,
      kpis: {
        usedMemory: used,
        maxMemory: max,
        memoryPct,
        opsPerSec: num(map, "instantaneous_ops_per_sec"),
        clients: num(map, "connected_clients"),
        evictions: num(map, "evicted_keys"),
        hitRate,
        p99Ms: num(map, "command_latency_p99_ms"),
        sampledKeys: ks.rows[0]?.sampled ?? num(map, "keyspace_sampled"),
        missingTtlPct: ks.rows[0]?.missing_ttl_pct ?? num(map, "ttl_missing_pct"),
        biggestKeyBytes: num(map, "biggest_key_bytes"),
      },
      changes: changePack?.metrics ?? [],
      changesWindow: changePack?.window ?? null,
      keyspace,
      commandPicture: diagnosisInput.commandPicture ?? null,
      slowlog: diagnosisInput.slowlog,
    },
    findings: findings.rows.map((f) => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      title: f.title,
      evidence: f.evidence ?? {},
      created_at: f.created_at,
    })),
    series,
  });
}

export function registerDiagnose(app: FastifyInstance): void {
  app.get("/v1/diagnose/context", async (req, reply) => {
    const databaseId = await databaseIdForRequest(req);
    if (!databaseId) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return loadDiagnosisContext(databaseId);
  });

  app.post("/v1/diagnose/explain", async (req, reply) => {
    const databaseId = await databaseIdForRequest(req);
    if (!databaseId) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const body = (req.body ?? {}) as { question?: string };
    const question =
      typeof body.question === "string" && body.question.trim().length > 0
        ? body.question.trim().slice(0, 240)
        : DEFAULT_QUESTION;

    const context = await loadDiagnosisContext(databaseId);

    if (geminiApiKey) {
      try {
        const result = await explainWithGemini(context, question, {
          apiKey: geminiApiKey,
          model: geminiModel,
        });
        return {
          ...result,
          collectedAt: context.collectedAt,
          healthTotal: context.health.total,
        };
      } catch (err) {
        req.log.warn(err, "gemini explain failed — falling back");
      }
    }

    if (openaiApiKey) {
      try {
        const result = await explainWithLlm(context, question, {
          apiKey: openaiApiKey,
          model: openaiModel,
          baseUrl: openaiBaseUrl,
        });
        return {
          ...result,
          collectedAt: context.collectedAt,
          healthTotal: context.health.total,
        };
      } catch (err) {
        req.log.warn(err, "llm explain failed — falling back to rules");
      }
    }

    const result = explainFromRules(context, question);
    return {
      ...result,
      collectedAt: context.collectedAt,
      healthTotal: context.health.total,
    };
  });
}
