export const isProd = process.env.NODE_ENV === "production";

export const sessionSecret = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me";

export function requireProdSecrets(): void {
  if (!isProd) return;
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in production");
  }
}
