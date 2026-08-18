import { createHash } from "node:crypto";
import { pool } from "./db.js";

export const DEV_AGENT_KEY = "local-dev";
export const DEV_AGENT_TOKEN = process.env.AGENT_TOKEN ?? "dev-agent-token";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'admin',
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS databases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id),
      engine TEXT NOT NULL,
      version TEXT,
      environment TEXT NOT NULL DEFAULT 'dev',
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      database_id UUID NOT NULL REFERENCES databases(id),
      agent_key TEXT NOT NULL UNIQUE,
      token_hash TEXT NOT NULL,
      version TEXT,
      last_seen TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS findings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      database_id UUID NOT NULL REFERENCES databases(id),
      severity TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS metrics (
      database_id UUID NOT NULL REFERENCES databases(id),
      metric_name TEXT NOT NULL,
      time TIMESTAMPTZ NOT NULL,
      value DOUBLE PRECISION NOT NULL
    );

    CREATE INDEX IF NOT EXISTS metrics_db_time_idx
      ON metrics (database_id, time DESC);
    CREATE INDEX IF NOT EXISTS metrics_db_name_time_idx
      ON metrics (database_id, metric_name, time DESC);

    CREATE TABLE IF NOT EXISTS keyspace_samples (
      database_id UUID NOT NULL REFERENCES databases(id),
      time TIMESTAMPTZ NOT NULL,
      sampled INT NOT NULL,
      with_ttl INT NOT NULL,
      without_ttl INT NOT NULL,
      missing_ttl_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
      namespaces JSONB NOT NULL DEFAULT '[]'::jsonb,
      big_keys JSONB NOT NULL DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS slowlog_events (
      database_id UUID NOT NULL REFERENCES databases(id),
      time TIMESTAMPTZ NOT NULL,
      slowlog_id BIGINT NOT NULL,
      duration_us BIGINT NOT NULL,
      command TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS slowlog_events_db_time_idx
      ON slowlog_events (database_id, time DESC);
  `);

  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
    await pool.query(
      "SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE)",
    );
  } catch {
    // Vanilla Postgres is fine for Day 3.
  }
}

export async function seed(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  await pool.query(
    `INSERT INTO organizations (name, plan)
     SELECT 'Local', 'free'
     WHERE NOT EXISTS (SELECT 1 FROM organizations LIMIT 1)`,
  );

  const org = await pool.query<{ id: string }>(
    `SELECT id FROM organizations ORDER BY created_at LIMIT 1`,
  );
  const orgId = org.rows[0].id;

  await pool.query(
    `INSERT INTO databases (organization_id, engine, environment, name)
     SELECT $1, 'redis', 'dev', 'local-redis'
     WHERE NOT EXISTS (SELECT 1 FROM databases WHERE name = 'local-redis')`,
    [orgId],
  );

  const db = await pool.query<{ id: string }>(
    `SELECT id FROM databases WHERE name = 'local-redis' LIMIT 1`,
  );

  await pool.query(
    `INSERT INTO agents (database_id, agent_key, token_hash, status)
     VALUES ($1, $2, $3, 'idle')
     ON CONFLICT (agent_key) DO UPDATE SET token_hash = EXCLUDED.token_hash`,
    [db.rows[0].id, DEV_AGENT_KEY, hashToken(DEV_AGENT_TOKEN)],
  );
}
