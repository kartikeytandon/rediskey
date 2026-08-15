import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import "@fastify/cookie";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import { isProd } from "./config.js";
import { hashToken } from "./migrate.js";

const COOKIE = "rk_session";

export type SessionUser = {
  id: string;
  email: string;
  organizationId: string;
  orgName: string;
};

function cookieOpts() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProd,
    signed: true,
    maxAge: 60 * 60 * 24 * 14,
  };
}

export async function userFromSession(req: FastifyRequest): Promise<SessionUser | null> {
  const raw = req.cookies[COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const tokenHash = hashToken(unsigned.value);
  const row = await pool.query<SessionUser & { expires_at: Date }>(
    `SELECT u.id, u.email, u.organization_id AS "organizationId", o.name AS "orgName", s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = u.organization_id
     WHERE s.token_hash = $1`,
    [tokenHash],
  );
  if (row.rowCount === 0) return null;
  if (row.rows[0].expires_at < new Date()) {
    await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
    return null;
  }
  const { expires_at: _, ...user } = row.rows[0];
  return user;
}

async function setSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '14 days')`,
    [userId, hashToken(token)],
  );
  reply.setCookie(COOKIE, token, cookieOpts());
}

export async function databaseIdForRequest(req: FastifyRequest): Promise<string | null> {
  const q = req.query as { databaseId?: string; agentId?: string };
  const agentTok = req.headers["x-agent-token"];
  if (typeof agentTok === "string" && agentTok.length > 0) {
    const agentKey = q.agentId;
    if (!agentKey) {
      const byHash = await pool.query<{ database_id: string }>(
        `SELECT database_id FROM agents WHERE token_hash = $1`,
        [hashToken(agentTok)],
      );
      return byHash.rows[0]?.database_id ?? null;
    }
    const agent = await pool.query<{ database_id: string; token_hash: string }>(
      `SELECT database_id, token_hash FROM agents WHERE agent_key = $1`,
      [agentKey],
    );
    if (agent.rowCount === 0 || agent.rows[0].token_hash !== hashToken(agentTok)) {
      return null;
    }
    return agent.rows[0].database_id;
  }

  const user = await userFromSession(req);
  if (!user) return null;
  if (q.databaseId) {
    const owned = await pool.query<{ id: string }>(
      `SELECT id FROM databases WHERE id = $1 AND organization_id = $2`,
      [q.databaseId, user.organizationId],
    );
    return owned.rows[0]?.id ?? null;
  }
  const first = await pool.query<{ id: string }>(
    `SELECT id FROM databases WHERE organization_id = $1 ORDER BY created_at LIMIT 1`,
    [user.organizationId],
  );
  return first.rows[0]?.id ?? null;
}

export function registerAuth(app: import("fastify").FastifyInstance): void {
  app.post("/v1/auth/signup", async (req, reply) => {
    const body = req.body as { email?: string; password?: string; orgName?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const orgName = body.orgName?.trim() || "My team";
    if (!email || !email.includes("@") || password.length < 8) {
      return reply.code(400).send({ error: "email and password (8+ chars) required" });
    }
    const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (exists.rowCount) {
      return reply.code(409).send({ error: "email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const org = await pool.query<{ id: string }>(
      `INSERT INTO organizations (name, plan) VALUES ($1, 'free') RETURNING id`,
      [orgName],
    );
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (organization_id, email, role, password_hash)
       VALUES ($1, $2, 'admin', $3) RETURNING id`,
      [org.rows[0].id, email, passwordHash],
    );
    await setSession(reply, user.rows[0].id);
    return { ok: true };
  });

  app.post("/v1/auth/login", async (req, reply) => {
    const body = req.body as { email?: string; password?: string };
    const email = body.email?.trim().toLowerCase();
    const password = body.password ?? "";
    const row = await pool.query<{ id: string; password_hash: string | null }>(
      `SELECT id, password_hash FROM users WHERE email = $1`,
      [email],
    );
    if (!row.rowCount || !row.rows[0].password_hash) {
      return reply.code(401).send({ error: "invalid credentials" });
    }
    const ok = await bcrypt.compare(password, row.rows[0].password_hash);
    if (!ok) return reply.code(401).send({ error: "invalid credentials" });
    await setSession(reply, row.rows[0].id);
    return { ok: true };
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    const raw = req.cookies[COOKIE];
    if (raw) {
      const unsigned = req.unsignCookie(raw);
      if (unsigned.valid && unsigned.value) {
        await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [
          hashToken(unsigned.value),
        ]);
      }
    }
    reply.clearCookie(COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/v1/auth/me", async (req, reply) => {
    const user = await userFromSession(req);
    if (!user) return reply.code(401).send({ error: "unauthorized" });
    return user;
  });
}

export function newAgentCredentials(): { agentKey: string; token: string } {
  return {
    agentKey: `agt_${randomBytes(8).toString("hex")}`,
    token: `rk_${randomBytes(24).toString("hex")}`,
  };
}
