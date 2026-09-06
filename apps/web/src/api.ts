export type Me = { id: string; email: string; organizationId: string; orgName: string };
export type DbRow = { id: string; name: string; engine: string; agentKey: string };

const prefix = "/api";

function friendlyApiError(raw: string, status: number): string {
  const map: Record<string, string> = {
    "invalid credentials": "Wrong email or password.",
    "email already registered": "That email is already in use. Try logging in instead.",
    "email and password (8+ chars) required":
      "Enter a valid email and a password with at least 8 characters.",
    unauthorized: "Please sign in again.",
    "signup disabled": "New signups are closed. Contact your admin for access.",
    "name required": "Give this Redis instance a name.",
    "database not found": "That Redis instance was not found.",
    "no agent for database": "No agent is registered for this instance yet.",
    "invalid slack webhook url": "Paste a valid Slack Incoming Webhook URL (hooks.slack.com).",
    "slack webhook not configured": "Save a Slack webhook URL first, then send a test.",
    "slack webhook failed": "Slack rejected the webhook. Check the URL and try again.",
  };
  if (map[raw]) return map[raw];
  if (raw.startsWith("{")) return `Something went wrong (${status}). Try again.`;
  return raw;
}

export function dbStorageKey(orgId: string): string {
  return `baltan:db:${orgId}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(prefix + path, { credentials: "include", ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = `Something went wrong (${res.status}).`;
    try {
      const data = JSON.parse(text) as { error?: string; message?: string };
      message = friendlyApiError(data.error ?? data.message ?? text, res.status);
    } catch {
      if (text && !text.startsWith("{")) message = text;
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
