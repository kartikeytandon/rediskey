import { frontendOrigin, mailFrom, resendApiKey } from "./config.js";

export function mailConfigured(): boolean {
  return Boolean(resendApiKey && mailFrom);
}

export async function sendWelcomeEmail(opts: {
  to: string;
  orgName: string;
}): Promise<void> {
  if (!mailConfigured()) {
    throw new Error("mail not configured (set RESEND_API_KEY and MAIL_FROM)");
  }

  const appUrl = `${frontendOrigin.replace(/\/$/, "")}/app`;
  const subject = "Welcome to Baltan";
  const text = [
    `Welcome to Baltan.`,
    ``,
    `Your org "${opts.orgName}" is ready.`,
    `Sign in and add a Redis instance, then run the agent so samples start flowing.`,
    ``,
    `Open the app: ${appUrl}`,
    ``,
    `— Baltan`,
  ].join("\n");

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.5;color:#111;max-width:32rem">
      <p style="font-size:1.15rem;font-weight:650;margin:0 0 0.75rem">Welcome to Baltan</p>
      <p style="margin:0 0 0.75rem">Your org <strong>${escapeHtml(opts.orgName)}</strong> is ready.</p>
      <p style="margin:0 0 0.75rem">Sign in, add a Redis instance, and run the agent so samples start flowing.</p>
      <p style="margin:0 0 1.25rem">
        <a href="${escapeHtml(appUrl)}" style="color:#0d9488;font-weight:600">Open the dashboard →</a>
      </p>
      <p style="margin:0;color:#666;font-size:0.85rem">— Baltan</p>
    </div>
  `.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [opts.to],
      subject,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`resend ${res.status}: ${detail.slice(0, 300)}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
