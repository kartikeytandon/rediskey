import { useEffect, useState } from "react";
import { api } from "./api";

type AlertSettings = {
  slackWebhookUrl: string | null;
  alertOnHigh: boolean;
  alertHealthEnabled: boolean;
  alertHealthThreshold: number;
  alertDigestEnabled: boolean;
};

function maskWebhook(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] ?? "";
    const tail = last.length > 4 ? last.slice(-4) : last;
    return `${u.origin}/services/••••/••••/••••${tail}`;
  } catch {
    if (url.length < 12) return "••••••••";
    return `${url.slice(0, 12)}…••••${url.slice(-4)}`;
  }
}

export function AlertsPage() {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [webhook, setWebhook] = useState("");
  const [alertOnHigh, setAlertOnHigh] = useState(true);
  const [alertHealthEnabled, setAlertHealthEnabled] = useState(true);
  const [alertDigestEnabled, setAlertDigestEnabled] = useState(true);
  const [threshold, setThreshold] = useState(60);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applySettings = (s: AlertSettings, startEditing: boolean) => {
    setSettings(s);
    setWebhook(s.slackWebhookUrl ?? "");
    setAlertOnHigh(s.alertOnHigh);
    setAlertHealthEnabled(s.alertHealthEnabled);
    setAlertDigestEnabled(s.alertDigestEnabled ?? true);
    setThreshold(s.alertHealthThreshold);
    setEditing(startEditing);
  };

  const load = async () => {
    try {
      const s = await api<AlertSettings>("/v1/org/alerts");
      applySettings(s, !s.slackWebhookUrl);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load alert settings.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const cancelEdit = () => {
    if (!settings) {
      setEditing(false);
      return;
    }
    applySettings(settings, !settings.slackWebhookUrl);
    setError(null);
    setInfo(null);
  };

  const save = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const s = await api<AlertSettings>("/v1/org/alerts", {
        method: "PUT",
        body: JSON.stringify({
          slackWebhookUrl: webhook.trim() || null,
          alertOnHigh,
          alertHealthEnabled,
          alertHealthThreshold: threshold,
          alertDigestEnabled,
        }),
      });
      applySettings(s, false);
      setInfo("Alert settings saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (editing && webhook.trim() !== (settings?.slackWebhookUrl ?? "")) {
        await api("/v1/org/alerts", {
          method: "PUT",
          body: JSON.stringify({
            slackWebhookUrl: webhook.trim() || null,
            alertOnHigh,
            alertHealthEnabled,
            alertHealthThreshold: threshold,
            alertDigestEnabled,
          }),
        });
      }
      await api("/v1/org/alerts/test", { method: "POST" });
      setInfo("Test message sent to Slack.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  };

  const sendDigest = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await api("/v1/org/alerts/digest", { method: "POST" });
      setInfo("Status report sent to Slack.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Digest failed.");
    } finally {
      setBusy(false);
    }
  };

  const savedUrl = settings?.slackWebhookUrl?.trim() ?? "";
  const locked = Boolean(savedUrl) && !editing;

  return (
    <div className="install-page alerts-page">
      <div className="install-page-hero">
        <h1>Alerts</h1>
        <p className="lede">
          Get a Slack message when Baltan opens a <strong>high</strong> finding, or when instance
          health drops below your threshold. Debounced so you are not spammed on every sample.
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {info ? <p className="info">{info}</p> : null}

      <section className="install-panel install-page-panel">
        <div className="alerts-panel-head">
          <p className="token-title">Slack webhook</p>
          {savedUrl ? (
            <button
              type="button"
              className="alerts-edit-btn"
              aria-label={editing ? "Cancel editing" : "Edit Slack settings"}
              title={editing ? "Cancel" : "Edit"}
              onClick={() => (editing ? cancelEdit() : setEditing(true))}
            >
              {editing ? (
                <span aria-hidden>×</span>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ) : null}
        </div>
        <p className="hint">
          Create an Incoming Webhook in Slack (Apps → Incoming Webhooks), then paste the URL here.
          Org-wide — covers every Redis instance in this account.
        </p>

        <label className="field">
          <span className="field-label">Webhook URL</span>
          {locked ? (
            <div className="webhook-locked" title="Click the pen to edit">
              <code>{maskWebhook(savedUrl)}</code>
            </div>
          ) : (
            <input
              type="url"
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://hooks.slack.com/services/…"
              autoComplete="off"
              autoFocus={editing}
            />
          )}
        </label>

        <label className={`check-row ${locked ? "is-locked" : ""}`}>
          <input
            type="checkbox"
            checked={alertOnHigh}
            disabled={locked}
            onChange={(e) => setAlertOnHigh(e.target.checked)}
          />
          <span>
            Notify on new <strong>high</strong> findings
          </span>
        </label>

        <label className={`check-row ${locked ? "is-locked" : ""}`}>
          <input
            type="checkbox"
            checked={alertHealthEnabled}
            disabled={locked}
            onChange={(e) => setAlertHealthEnabled(e.target.checked)}
          />
          <span>Notify when health score falls below threshold</span>
        </label>

        <label className={`check-row ${locked ? "is-locked" : ""}`}>
          <input
            type="checkbox"
            checked={alertDigestEnabled}
            disabled={locked}
            onChange={(e) => setAlertDigestEnabled(e.target.checked)}
          />
          <span>
            Send a <strong>status report every 3 hours</strong> (health, metrics, findings / what to
            check)
          </span>
        </label>

        <label className="field">
          <span className="field-label">Health threshold (1–100)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={threshold}
            disabled={locked || !alertHealthEnabled}
            onChange={(e) => setThreshold(Number(e.target.value) || 60)}
          />
          <span className="field-hint">Default 60. Health alerts at most once every 30 minutes.</span>
        </label>

        <div className="install-actions">
          {editing || !savedUrl ? (
            <>
              <button type="button" className="on" disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </button>
              {savedUrl ? (
                <button type="button" className="ghost" disabled={busy} onClick={cancelEdit}>
                  Cancel
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="ghost"
            disabled={busy || !(editing ? webhook.trim() : savedUrl)}
            onClick={() => void test()}
          >
            Send test
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy || !(editing ? webhook.trim() : savedUrl)}
            onClick={() => void sendDigest()}
          >
            Send report now
          </button>
        </div>
      </section>
    </div>
  );
}
