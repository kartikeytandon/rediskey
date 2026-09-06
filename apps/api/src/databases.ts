import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { pool } from "./db.js";
import { hashToken } from "./migrate.js";
import { newAgentCredentials, userFromSession, type SessionUser } from "./auth.js";

async function ownedDatabase(user: SessionUser, databaseId: string): Promise<boolean> {
  const row = await pool.query<{ id: string }>(
    `SELECT id FROM databases WHERE id = $1 AND organization_id = $2`,
    [databaseId, user.organizationId],
  );
  return (row.rowCount ?? 0) > 0;
}

export function registerDatabases(app: FastifyInstance): void {
  app.get("/v1/databases", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const rows = await pool.query(
      `SELECT d.id, d.name, d.engine, d.environment, d.version,
              a.agent_key AS "agentKey", a.status, a.last_seen AS "lastSeen"
       FROM databases d
       LEFT JOIN agents a ON a.database_id = d.id
       WHERE d.organization_id = $1
       ORDER BY d.created_at`,
      [user.organizationId],
    );
    return { databases: rows.rows };
  });

  app.post("/v1/databases", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const body = req.body as { name?: string; engine?: string; environment?: string };
    const name = body.name?.trim();
    const engine = body.engine === "valkey" ? "valkey" : "redis";
    const environment = body.environment?.trim() || "production";
    if (!name) return reply.code(400).send({ error: "name required" });

    const db = await pool.query<{ id: string }>(
      `INSERT INTO databases (organization_id, engine, environment, name)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [user.organizationId, engine, environment, name],
    );
    const creds = newAgentCredentials();
    await pool.query(
      `INSERT INTO agents (database_id, agent_key, token_hash, status)
       VALUES ($1, $2, $3, 'idle')`,
      [db.rows[0].id, creds.agentKey, hashToken(creds.token)],
    );
    return {
      databaseId: db.rows[0].id,
      agentKey: creds.agentKey,
      token: creds.token,
      warning: "Store this token now. It cannot be retrieved again.",
    };
  });

  app.get("/v1/databases/:databaseId/agent", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { databaseId } = req.params as { databaseId: string };
    if (!(await ownedDatabase(user, databaseId))) {
      return reply.code(404).send({ error: "database not found" });
    }
    const row = await pool.query<{
      agent_key: string;
      status: string;
      last_seen: Date | null;
      version: string | null;
    }>(
      `SELECT agent_key, status, last_seen, version
       FROM agents WHERE database_id = $1 LIMIT 1`,
      [databaseId],
    );
    if (!row.rowCount || !row.rows[0]) {
      return reply.code(404).send({ error: "no agent for database" });
    }
    const a = row.rows[0];
    return {
      agentKey: a.agent_key,
      status: a.status,
      lastSeen: a.last_seen,
      version: a.version,
      revoked: a.status === "revoked",
    };
  });

  app.post("/v1/databases/:databaseId/agent/rotate", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { databaseId } = req.params as { databaseId: string };
    if (!(await ownedDatabase(user, databaseId))) {
      return reply.code(404).send({ error: "database not found" });
    }

    const token = `rk_${randomBytes(24).toString("hex")}`;
    const updated = await pool.query<{ agent_key: string }>(
      `UPDATE agents
       SET token_hash = $2, status = 'idle', version = NULL
       WHERE database_id = $1
       RETURNING agent_key`,
      [databaseId, hashToken(token)],
    );
    if (!updated.rowCount || !updated.rows[0]) {
      return reply.code(404).send({ error: "no agent for database" });
    }

    return {
      agentKey: updated.rows[0].agent_key,
      token,
      warning: "Store this token now. It cannot be retrieved again.",
    };
  });

  app.post("/v1/databases/:databaseId/agent/revoke", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    const { databaseId } = req.params as { databaseId: string };
    if (!(await ownedDatabase(user, databaseId))) {
      return reply.code(404).send({ error: "database not found" });
    }

    const dead = randomBytes(32).toString("hex");
    const updated = await pool.query(
      `UPDATE agents SET token_hash = $2, status = 'revoked' WHERE database_id = $1`,
      [databaseId, hashToken(dead)],
    );
    if (!updated.rowCount) {
      return reply.code(404).send({ error: "no agent for database" });
    }
    return { ok: true };
  });
}
