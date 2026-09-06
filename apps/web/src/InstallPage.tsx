import { useEffect, useState } from "react";
import { api } from "./api";

const AGENT_IMAGE =
  import.meta.env.VITE_AGENT_IMAGE ?? "ghcr.io/kartikeytandon/baltan:v0.0.5";

function ingestUrlForDocker(): string {
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://host.docker.internal:3001";
  }
  return `${window.location.origin}/api`;
}

function agentInstallCommands(opts: {
  token: string | null;
  agentKey: string;
  engine: string;
}) {
  const { token, agentKey, engine } = opts;
  const tokenVal = token ?? "<paste-token-after-rotate>";
  const ingest = ingestUrlForDocker();
  const run = `docker pull ${AGENT_IMAGE}

docker run -d --name baltan-agent --restart unless-stopped \\
  -e AGENT_TOKEN='${tokenVal}' \\
  --add-host=host.docker.internal:host-gateway \\
  ${AGENT_IMAGE} \\
  --addr host.docker.internal:6379 \\
  --engine ${engine} \\
  --agent-id ${agentKey} \\
  --ingest-url ${ingest} \\
  --interval 10s`;
  const compose = `export AGENT_TOKEN='${tokenVal}'
export AGENT_ID='${agentKey}'
export INGEST_URL='${ingest}'
export REDIS_ADDR=host.docker.internal:6379
export REDIS_ENGINE=${engine}
docker compose -f docker-compose.agent.yaml up -d`;
  const build = `# Fallback if GHCR pull is private — build from apps/agent:
docker build -t baltan:v0.0.5 .
# then replace ${AGENT_IMAGE} with baltan:v0.0.5 in the run command`;
  return { ingest, run, compose, build };
}

type AgentInfo = {
  agentKey: string;
  status: string;
  lastSeen: string | null;
  version: string | null;
  revoked: boolean;
};

function AgentInstallPanel({
  databaseId,
  agentKey,
  engine,
  revealedToken,
  onRevealedToken,
}: {
  databaseId: string;
  agentKey: string;
  engine: string;
  revealedToken: string | null;
  onRevealedToken: (token: string | null) => void;
}) {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"run" | "compose" | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await api<AgentInfo>(`/v1/databases/${databaseId}/agent`);
        if (!cancelled) {
          setAgentInfo(info);
          setError(null);
        }
      } catch {
        if (!cancelled) setAgentInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [databaseId]);

  const refreshAgent = async () => {
    try {
      const info = await api<AgentInfo>(`/v1/databases/${databaseId}/agent`);
      setAgentInfo(info);
      setError(null);
    } catch {
      setAgentInfo(null);
    }
  };

  const { ingest, run, compose, build } = agentInstallCommands({
    token: revealedToken,
    agentKey,
    engine,
  });

  const copy = async (text: string, kind: "run" | "compose") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const rotate = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string }>(
        `/v1/databases/${databaseId}/agent/rotate`,
        { method: "POST" },
      );
      onRevealedToken(res.token);
      await refreshAgent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rotate token.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (
      !window.confirm(
        "Revoke this agent token? Running agents will stop ingesting until you rotate a new token.",
      )
    ) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api(`/v1/databases/${databaseId}/agent/revoke`, { method: "POST" });
      onRevealedToken(null);
      await refreshAgent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke token.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="install-panel install-page-panel">
      <div className="token-banner-head">
        <div>
          <p className="token-title">Docker install</p>
          <p className="hint install-meta">
            <span>
              agent-id <code>{agentKey}</code>
            </span>
            <span>
              ingest <code>{ingest}</code>
            </span>
            <span>
              image <code>{AGENT_IMAGE}</code>
            </span>
            {agentInfo?.lastSeen ? (
              <span>last seen {new Date(agentInfo.lastSeen).toLocaleString()}</span>
            ) : (
              <span>not connected yet</span>
            )}
            {agentInfo?.revoked ? <span className="pill warn">token revoked</span> : null}
          </p>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {revealedToken ? (
        <div className="token-reveal">
          <p className="field-label">Agent token (copy now — not shown again)</p>
          <code>{revealedToken}</code>
        </div>
      ) : (
        <p className="hint">
          The token is only shown once. Generate or rotate to reveal the install command.
        </p>
      )}

      <ol className="install-steps">
        <li>On a host that can reach Redis, install Docker.</li>
        <li>
          Pull <code>{AGENT_IMAGE}</code>, then run the command below. Change{" "}
          <code>host.docker.internal:6379</code> to your Redis host:port (e.g.{" "}
          <code>16379</code> for local Docker Redis).
        </li>
        <li>
          Check <code>docker logs -f baltan-agent</code> for <code>ingested ok</code>, then open the
          dashboard.
        </li>
      </ol>

      <pre className="install-cmd">{showCompose ? compose : run}</pre>

      <div className="install-actions">
        <button
          type="button"
          className="on"
          disabled={!revealedToken}
          onClick={() => void copy(showCompose ? compose : run, showCompose ? "compose" : "run")}
        >
          {copied ? "Copied" : showCompose ? "Copy compose command" : "Copy Docker command"}
        </button>
        <button type="button" className="ghost" onClick={() => setShowCompose((v) => !v)}>
          {showCompose ? "Show docker run" : "Show compose"}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={() => void rotate()}>
          {busy ? "Working…" : revealedToken ? "Rotate token" : "Generate token"}
        </button>
        <button type="button" className="ghost danger-text" disabled={busy} onClick={() => void revoke()}>
          Revoke
        </button>
      </div>

      <p className="hint install-alt">{build}</p>
    </section>
  );
}

export function InstallPage({
  databaseId,
  agentKey,
  engine,
  initialToken,
}: {
  databaseId: string;
  agentKey: string;
  engine: string;
  initialToken?: string;
}) {
  const [revealedToken, setRevealedToken] = useState<string | null>(initialToken ?? null);

  useEffect(() => {
    setRevealedToken(initialToken ?? null);
  }, [databaseId, initialToken]);

  return (
    <div className="install-page">
      <div className="install-page-hero">
        <h1>Install agent</h1>
        <p className="lede">
          Run the Baltan collector on a host that can reach your Redis instance. Read-only — no key
          values are sent.
        </p>
      </div>

      {agentKey ? (
        <AgentInstallPanel
          databaseId={databaseId}
          agentKey={agentKey}
          engine={engine}
          revealedToken={revealedToken}
          onRevealedToken={setRevealedToken}
        />
      ) : (
        <p className="empty">Add a Redis instance from the dashboard first.</p>
      )}
    </div>
  );
}
