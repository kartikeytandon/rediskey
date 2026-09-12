import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load root/workspace `.env` into process.env when unset (dev convenience). */
function loadLocalEnv(): void {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
    break;
  }
}

loadLocalEnv();

export const isProd = process.env.NODE_ENV === "production";

export const sessionSecret = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me";

export const signupDisabled =
  process.env.SIGNUP_DISABLED === "1" || process.env.SIGNUP_DISABLED === "true";

export const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

/** Resend API key — leave unset to skip sending mail (signup still works). */
export const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";

/** Verified sender, e.g. "Baltan <hello@yourdomain.com>" or Resend test "Baltan <onboarding@resend.dev>" */
export const mailFrom = process.env.MAIL_FROM?.trim() || "";

/** Gemini for Day 17 explain (preferred free path — falls back to OpenAI, then rules). */
export const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";
export const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";

/** OpenAI-compatible API for Day 17 explain (optional — used if Gemini key unset). */
export const openaiApiKey = process.env.OPENAI_API_KEY?.trim() || "";
export const openaiModel = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
export const openaiBaseUrl =
  process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";

export function requireProdSecrets(): void {
  if (!isProd) return;
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in production");
  }
}
