import type { FastifyInstance } from "fastify";
import { pool } from "./db.js";
import { hashToken } from "./migrate.js";
import { newAgentCredentials, userFromSession } from "./auth.js";

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
}
