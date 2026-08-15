import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { pool } from "./db.js";
import { migrate, seed } from "./migrate.js";
import { registerIngest } from "./ingest.js";
import { registerDashboard } from "./dashboard.js";
import { registerFindings } from "./findings.js";
import { registerAuth } from "./auth.js";
import { registerDatabases } from "./databases.js";
import { isProd, requireProdSecrets, sessionSecret } from "./config.js";

requireProdSecrets();

const port = Number(process.env.PORT ?? 3001);
const app = Fastify({ logger: true });

await app.register(cookie, { secret: sessionSecret });
await app.register(cors, {
  origin: process.env.FRONTEND_ORIGIN ?? true,
  credentials: true,
});

app.get("/health", async () => {
  let db = "down";
  try {
    await pool.query("SELECT 1");
    db = "up";
  } catch {
    db = "down";
  }
  return { status: db === "up" ? "ok" : "degraded", service: "rediskey-api", version: "0.1.0", db };
});

registerAuth(app);
registerDatabases(app);
registerIngest(app);
registerDashboard(app);
registerFindings(app);

try {
  await migrate();
  await seed();
  app.log.info({ prod: isProd }, "schema ready");
} catch (err) {
  app.log.error(err, "database migrate/seed failed — is Postgres running?");
  process.exit(1);
}

await app.listen({ port, host: "0.0.0.0" });
