import pg from "pg";

const url =
  process.env.DATABASE_URL ??
  "postgres://rediskey:rediskey@127.0.0.1:5432/rediskey";

export const pool = new pg.Pool({ connectionString: url, max: 8 });
