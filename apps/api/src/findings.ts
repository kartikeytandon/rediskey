import type { FastifyInstance } from "fastify";
import { evaluate, type DiagnosisInput, type Finding } from "@rediskey/diagnosis";
import { databaseIdForRequest } from "./auth.js";
import { pool } from "./db.js";

export async function persistFindings(databaseId: string, input: DiagnosisInput): Promise<number> {
  const found = evaluate(input);
  for (const f of found) {
    const open = await pool.query<{ id: string }>(
      `SELECT id FROM findings
       WHERE database_id = $1 AND category = $2 AND resolved_at IS NULL
       LIMIT 1`,
      [databaseId, f.category],
    );
    if (open.rowCount && open.rows[0]) {
      await pool.query(
        `UPDATE findings SET severity = $2, title = $3, evidence = $4::jsonb WHERE id = $1`,
        [open.rows[0].id, f.severity, f.title, JSON.stringify(f.evidence)],
      );
    } else {
      await pool.query(
        `INSERT INTO findings (database_id, severity, category, title, evidence)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [databaseId, f.severity, f.category, f.title, JSON.stringify(f.evidence)],
      );
    }
  }
  return found.length;
}

export function registerFindings(app: FastifyInstance): void {
  app.get("/v1/findings", async (req, reply) => {
    const databaseId = await databaseIdForRequest(req);
    if (!databaseId) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const rows = await pool.query(
      `SELECT id, severity, category, title, evidence, created_at, resolved_at
       FROM findings
       WHERE database_id = $1 AND resolved_at IS NULL
       ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC`,
      [databaseId],
    );
    return { findings: rows.rows };
  });
}

export type { Finding };
