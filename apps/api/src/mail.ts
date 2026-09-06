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

  const base = frontendOrigin.replace(/\/$/, "");
  const appUrl = `${base}/app`;
  const installUrl = `${base}/app/install`;
  const org = escapeHtml(opts.orgName);
  const appHref = escapeHtml(appUrl);
  const installHref = escapeHtml(installUrl);
  const siteHref = escapeHtml(base);

  const subject = "Welcome to Baltan — Redis & Valkey health, without opening the port";
  const preheader =
    "Your org is ready. Add a Redis instance, run the read-only agent, and see explainable health and findings in minutes.";

  const text = [
    `Welcome to Baltan`,
    ``,
    `Hi — your organization "${opts.orgName}" is set up.`,
    ``,
    `Baltan is explainable Redis / Valkey health and findings — without opening port 6379 to the internet. A small read-only Docker agent sits beside your Redis, samples safely, and sends structured telemetry to your dashboard.`,
    ``,
    `Get started (about 5 minutes):`,
    `1. Open the dashboard and sign in: ${appUrl}`,
    `2. Create or select a Redis / Valkey instance`,
    `3. Open Install, copy your one-shot agent token, and run the agent beside Redis`,
    `4. Wait for the first samples — health score, findings, and trends will fill in`,
    ``,
    `Install / agent token: ${installUrl}`,
    ``,
    `What you get:`,
    `- Health score with plain-language explanations`,
    `- Prioritized findings (what it means + what to do)`,
    `- Trends, slow commands, and workload signals over time`,
    `- Optional Slack alerts and digests for your team`,
    ``,
    `Privacy: Redis stays closed. Baltan never needs inbound access to your cache.`,
    ``,
    `Questions? Reply to this email or open ${base}`,
    ``,
    `— The Baltan team`,
    `You received this because you signed up for Baltan with this address.`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="description" content="Welcome to Baltan — explainable Redis and Valkey health monitoring with a read-only agent. No open Redis port required." />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;color:#14201c;">
  <!-- Preheader (inbox snippet) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
    ${escapeHtml(preheader)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8e5;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 4px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#0d9488;font-weight:700;">Baltan</p>
              <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#0f1a16;">
                Welcome — your Redis health workspace is ready
              </h1>
              <p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#33403b;">
                <strong>${org}</strong> is set up on Baltan. You can monitor Redis and Valkey health, surface explainable findings, and keep port <strong>6379 closed</strong> to the public internet.
              </p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.55;color:#33403b;">
                A small read-only Docker agent runs beside your instance, samples safely, and ships structured telemetry to your dashboard — diagnosis, not a key browser.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:8px;background:#0d9488;">
                    <a href="${appHref}" style="display:inline-block;padding:12px 20px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;font-weight:650;color:#ffffff;text-decoration:none;">
                      Open your dashboard →
                    </a>
                  </td>
                </tr>
              </table>
              <h2 style="margin:0 0 10px;font-size:16px;line-height:1.35;font-weight:700;color:#0f1a16;">
                Get started in a few minutes
              </h2>
              <ol style="margin:0 0 22px;padding-left:1.25rem;font-size:14px;line-height:1.65;color:#33403b;">
                <li style="margin-bottom:6px;">Sign in and open the app</li>
                <li style="margin-bottom:6px;">Create or select a Redis / Valkey instance</li>
                <li style="margin-bottom:6px;">
                  Go to <a href="${installHref}" style="color:#0d9488;font-weight:600;text-decoration:underline;">Install</a>,
                  copy the one-shot agent token, and run the agent next to Redis
                </li>
                <li>Wait for the first samples — health, findings, and trends will appear</li>
              </ol>
              <h2 style="margin:0 0 10px;font-size:16px;line-height:1.35;font-weight:700;color:#0f1a16;">
                What Baltan helps you see
              </h2>
              <ul style="margin:0 0 22px;padding-left:1.25rem;font-size:14px;line-height:1.65;color:#33403b;">
                <li style="margin-bottom:4px;"><strong>Health score</strong> with plain-language meaning and next steps</li>
                <li style="margin-bottom:4px;"><strong>Prioritized findings</strong> so you know what matters first</li>
                <li style="margin-bottom:4px;"><strong>Trends &amp; workload signals</strong> — slow commands, hot keys, patterns over time</li>
                <li><strong>Optional Slack alerts</strong> and digests for high findings and health drops</li>
              </ul>
              <p style="margin:0 0 8px;padding:14px 16px;background:#f0faf7;border-radius:8px;font-size:13px;line-height:1.55;color:#1f3d36;">
                <strong>Privacy by design.</strong> Redis stays on your network. Baltan does not need inbound access to your cache — only the agent outbound to your Baltan API.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;border-top:1px solid #eef2f0;">
              <p style="margin:16px 0 8px;font-size:13px;line-height:1.5;color:#5c6b65;">
                Need the agent install link again?
                <a href="${installHref}" style="color:#0d9488;font-weight:600;">Open Install</a>
                ·
                <a href="${siteHref}" style="color:#0d9488;font-weight:600;">baltan.xyz</a>
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a9691;">
                — The Baltan team<br />
                You received this because you signed up for Baltan (${org}) with this address.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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
      tags: [
        { name: "category", value: "welcome" },
        { name: "product", value: "baltan" },
      ],
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
