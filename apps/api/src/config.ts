export const isProd = process.env.NODE_ENV === "production";

export const sessionSecret = process.env.SESSION_SECRET ?? "dev-only-session-secret-change-me";

export const signupDisabled =
  process.env.SIGNUP_DISABLED === "1" || process.env.SIGNUP_DISABLED === "true";

export const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

/** Resend API key — leave unset to skip sending mail (signup still works). */
export const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";

/** Verified sender, e.g. "Baltan <hello@yourdomain.com>" or Resend test "Baltan <onboarding@resend.dev>" */
export const mailFrom = process.env.MAIL_FROM?.trim() || "";

export function requireProdSecrets(): void {
  if (!isProd) return;
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in production");
  }
}
