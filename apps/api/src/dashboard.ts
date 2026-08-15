import type { FastifyInstance } from "fastify";
import { scoreHealth, type DiagnosisInput } from "@rediskey/diagnosis";
import { databaseIdForRequest } from "./auth.js";
import { pool } from "./db.js";

type MetricRow = { metric_name: string; value: number; time: Date };

function num(map: Map<string, number>, name: string): number | null {
  const v = map.get(name);
  return typeof v === "number" ? v : null;
}

export function registerDashboard(app: FastifyInstance): void {
  app.get("/v1/snapshot", async (req, reply) => {
    const databaseId = await databaseIdForRequest(req);
    if (!databaseId) {
      return reply.code(401).send({ error: "unauthorized" });
    }

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
    }>(
      `SELECT sampled, with_ttl, without_ttl, missing_ttl_pct, namespaces, big_keys
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
    const health = scoreHealth(diagnosisInput);

    return {
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
        p99Ms: null,
        sampledKeys: ks.rows[0]?.sampled ?? num(map, "keyspace_sampled"),
        missingTtlPct: ks.rows[0]?.missing_ttl_pct ?? num(map, "ttl_missing_pct"),
        biggestKeyBytes: num(map, "biggest_key_bytes"),
      },
      keyspace,
      metrics: metricsObj,
    };
  });

  app.get("/v1/series", async (req, reply) => {
    const q = req.query as { metric?: string; hours?: string };
    const metric = q.metric ?? "used_memory";
    const hours = Math.min(24, Math.max(1, Number(q.hours ?? 1) || 1));
    const databaseId = await databaseIdForRequest(req);
    if (!databaseId) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const points = await pool.query<{ time: Date; value: number }>(
      `SELECT time, value
       FROM metrics
       WHERE database_id = $1 AND metric_name = $2 AND time > now() - ($3::text || ' hours')::interval
       ORDER BY time ASC`,
      [databaseId, metric, String(hours)],
    );
    return {
      metric,
      hours,
      points: points.rows.map((p) => ({ time: p.time, value: p.value })),
    };
  });
}
