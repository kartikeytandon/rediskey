import type { FastifyInstance } from "fastify";
import { pool } from "./db.js";
import { hashToken } from "./migrate.js";
import { isTelemetryPayload } from "./types.js";
import { persistFindings } from "./findings.js";

export function registerIngest(app: FastifyInstance): void {
  app.post("/v1/ingest", async (req, reply) => {
    const token = req.headers["x-agent-token"];
    if (typeof token !== "string" || token.length === 0) {
      return reply.code(401).send({ error: "missing X-Agent-Token" });
    }
    if (!isTelemetryPayload(req.body)) {
      return reply.code(400).send({ error: "invalid telemetry payload" });
    }

    const body = req.body;
    const agent = await pool.query<{
      id: string;
      database_id: string;
      token_hash: string;
    }>(
      `SELECT id, database_id, token_hash FROM agents WHERE agent_key = $1`,
      [body.agentId],
    );
    if (agent.rowCount === 0) {
      return reply.code(404).send({ error: "unknown agent" });
    }
    if (agent.rows[0].token_hash !== hashToken(token)) {
      return reply.code(401).send({ error: "invalid token" });
    }

    const databaseId = agent.rows[0].database_id;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (body.metrics.length > 0) {
        const times: Date[] = [];
        const names: string[] = [];
        const values: number[] = [];
        const dbIds: string[] = [];
        for (const m of body.metrics) {
          dbIds.push(databaseId);
          names.push(m.name);
          values.push(m.value);
          times.push(new Date(m.timestamp || body.collectedAt));
        }
        await client.query(
          `INSERT INTO metrics (database_id, metric_name, time, value)
           SELECT * FROM unnest($1::uuid[], $2::text[], $3::timestamptz[], $4::float8[])`,
          [dbIds, names, times, values],
        );
      }
      if (body.keyspace) {
        await client.query(
          `INSERT INTO keyspace_samples (
             database_id, time, sampled, with_ttl, without_ttl, missing_ttl_pct, namespaces, big_keys
           ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
          [
            databaseId,
            new Date(body.collectedAt),
            body.keyspace.sampled,
            body.keyspace.withTtl,
            body.keyspace.withoutTtl,
            body.keyspace.missingTtlPct,
            JSON.stringify(body.keyspace.namespaces ?? []),
            JSON.stringify(body.keyspace.bigKeys ?? []),
          ],
        );
      }
      if (body.slowlog?.length) {
        const collectedAt = new Date(body.collectedAt);
        for (const s of body.slowlog) {
          await client.query(
            `INSERT INTO slowlog_events (database_id, time, slowlog_id, duration_us, command)
             VALUES ($1, $2, $3, $4, $5)`,
            [databaseId, collectedAt, s.id, s.durationUs, s.command],
          );
        }
      }
      await client.query(
        `UPDATE agents
         SET last_seen = now(), status = 'online', version = $2
         WHERE id = $1`,
        [agent.rows[0].id, body.version ?? null],
      );
      await client.query(
        `UPDATE databases SET engine = $2, version = $3 WHERE id = $1`,
        [databaseId, body.engine, body.server?.redis_version ?? body.server?.valkey_version ?? null],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const metrics: Record<string, number> = {};
    for (const m of body.metrics) metrics[m.name] = m.value;
    const findingCount = await persistFindings(databaseId, {
      metrics,
      keyspace: body.keyspace
        ? {
            sampled: body.keyspace.sampled,
            missingTtlPct: body.keyspace.missingTtlPct,
            namespaces: body.keyspace.namespaces,
            bigKeys: body.keyspace.bigKeys ?? [],
          }
        : null,
      slowlog: body.slowlog ?? [],
    });

    return {
      ok: true,
      metrics: body.metrics.length,
      slowlog: body.slowlog?.length ?? 0,
      sampled: body.keyspace?.sampled ?? 0,
      findings: findingCount,
    };
  });

  app.get("/v1/metrics/latest", async (req, reply) => {
    const token = req.headers["x-agent-token"];
    if (typeof token !== "string") {
      return reply.code(401).send({ error: "missing X-Agent-Token" });
    }
    const q = req.query as { agentId?: string };
    const agentKey = q.agentId ?? "local-dev";
    const agent = await pool.query<{ database_id: string; token_hash: string }>(
      `SELECT database_id, token_hash FROM agents WHERE agent_key = $1`,
      [agentKey],
    );
    if (agent.rowCount === 0 || agent.rows[0].token_hash !== hashToken(token)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const count = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM metrics WHERE database_id = $1`,
      [agent.rows[0].database_id],
    );
    const latest = await pool.query(
      `SELECT metric_name, value, time
       FROM metrics
       WHERE database_id = $1
       ORDER BY time DESC
       LIMIT 20`,
      [agent.rows[0].database_id],
    );
    return { count: Number(count.rows[0].n), latest: latest.rows };
  });
}
