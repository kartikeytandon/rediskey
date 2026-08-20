import { useEffect, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BrandMark } from "./BrandMark";

const prefix = "/api";

type Me = { id: string; email: string; organizationId: string; orgName: string };
type DbRow = { id: string; name: string; engine: string; agentKey: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(prefix + path, { credentials: "include", ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [dbId, setDbId] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<{ agentKey: string; token: string } | null>(null);

  const refresh = async () => {
    try {
      const user = await api<Me>("/v1/auth/me");
      setMe(user);
      const list = await api<{ databases: DbRow[] }>("/v1/databases");
      setDbId((id) => id ?? list.databases[0]?.id ?? null);
    } catch {
      setMe(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (me === undefined) return <main className="page">Loading…</main>;
  if (!me) return <AuthForm onOk={() => void refresh()} />;
  if (!dbId) {
    return (
      <Onboard
        orgName={me.orgName}
        onCreated={async (created) => {
          setFreshToken({ agentKey: created.agentKey, token: created.token });
          await refresh();
          setDbId(created.databaseId);
        }}
      />
    );
  }

  return (
    <>
      {freshToken ? (
        <AgentInstallBanner
          token={freshToken.token}
          agentKey={freshToken.agentKey}
          onDismiss={() => setFreshToken(null)}
        />
      ) : null}
      <Dashboard
        databaseId={dbId}
        email={me.email}
        onLogout={async () => {
          await api("/v1/auth/logout", { method: "POST" });
          setMe(null);
          setDbId(null);
        }}
      />
    </>
  );
}

const AGENT_IMAGE =
  import.meta.env.VITE_AGENT_IMAGE ?? "ghcr.io/kartikeytandon/baltan:v0.0.1";

function agentInstallCommands(token: string, agentKey: string) {
  const ingest = `${window.location.origin}/api`;
  const run = `docker pull ${AGENT_IMAGE}

docker run -d --name baltan-agent --restart unless-stopped \\
  -e AGENT_TOKEN='${token}' \\
  --add-host=host.docker.internal:host-gateway \\
  ${AGENT_IMAGE} \\
  --addr host.docker.internal:6379 \\
  --engine redis \\
  --agent-id ${agentKey} \\
  --ingest-url ${ingest} \\
  --interval 10s`;
  const build = `# Fallback if GHCR pull is private — build from apps/agent:
docker build -t baltan:v0.0.1 .
# then replace ${AGENT_IMAGE} with baltan:v0.0.1 in the run command`;
  return { ingest, run, build };
}

function AgentInstallBanner({
  token,
  agentKey,
  onDismiss,
}: {
  token: string;
  agentKey: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { ingest, run, build } = agentInstallCommands(token, agentKey);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(run);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="token-banner">
      <div className="token-banner-head">
        <div>
          <p className="token-title">Install Baltan agent (shown once)</p>
          <p className="hint">
            Token <code>{token}</code> · agent-id <code>{agentKey}</code> · ingest{" "}
            <code>{ingest}</code>
          </p>
        </div>
        <button type="button" className="ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <ol className="install-steps">
        <li>On a host that can reach Redis, install Docker.</li>
        <li>
          Pull <code>{AGENT_IMAGE}</code>, then run the command below. Change{" "}
          <code>host.docker.internal:6379</code> to your Redis host:port. Add{" "}
          <code>-e REDIS_PASSWORD=&apos;…&apos;</code> if Redis has AUTH.
        </li>
        <li>
          Check <code>docker logs -f baltan-agent</code> for <code>ingested ok</code>, then refresh this
          dashboard.
        </li>
      </ol>
      <pre className="install-cmd">{run}</pre>
      <div className="token-banner-actions">
        <button type="button" className="on" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy Docker command"}
        </button>
      </div>
      <p className="hint install-alt">{build}</p>
    </div>
  );
}

function AuthForm({ onOk }: { onOk: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      const path = mode === "login" ? "/v1/auth/login" : "/v1/auth/signup";
      await api(path, {
        method: "POST",
        body: JSON.stringify({ email, password, orgName }),
      });
      onOk();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
      <div className="brand auth-brand">
        <BrandMark size="lg" />
      </div>
      <p className="lede">Sign in to monitor Redis / Valkey.</p>
      <p className="hint">
        <a href="/" style={{ color: "inherit" }}>
          ← Product overview
        </a>
      </p>
      {error ? <p className="error">{error}</p> : null}
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      {mode === "signup" ? (
        <label>
          Organization
          <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme" />
        </label>
      ) : null}
      <button type="button" className="on" onClick={() => void submit()}>
        {mode === "login" ? "Log in" : "Create account"}
      </button>
      <button type="button" className="ghost" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "Need an account?" : "Have an account?"}
      </button>
      </div>
    </main>
  );
}

function Onboard({
  orgName,
  onCreated,
}: {
  orgName: string;
  onCreated: (c: { databaseId: string; agentKey: string; token: string }) => void;
}) {
  const [name, setName] = useState("production-redis");
  const [engine, setEngine] = useState("redis");
  const [error, setError] = useState<string | null>(null);
  return (
    <main className="auth-wrap">
      <div className="auth-card">
      <h1>Connect a database</h1>
      <p className="lede">{orgName} — create a monitored Redis/Valkey instance.</p>
      {error ? <p className="error">{error}</p> : null}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Engine
        <select value={engine} onChange={(e) => setEngine(e.target.value)}>
          <option value="redis">Redis</option>
          <option value="valkey">Valkey</option>
        </select>
      </label>
      <button
        type="button"
        className="on"
        onClick={async () => {
          setError(null);
          try {
            const created = await api<{ databaseId: string; agentKey: string; token: string }>(
              "/v1/databases",
              { method: "POST", body: JSON.stringify({ name, engine, environment: "production" }) },
            );
            onCreated(created);
          } catch (e) {
            setError(e instanceof Error ? e.message : "failed");
          }
        }}
      >
        Create + generate agent token
      </button>
      </div>
    </main>
  );
}

type Snapshot = {
  collectedAt: string | null;
  health: {
    total: number;
    parts: { id: string; label: string; score: number; weight: number; why: string }[];
  } | null;
  kpis: {
    usedMemory: number | null;
    maxMemory: number | null;
    memoryPct: number | null;
    opsPerSec: number | null;
    clients: number | null;
    evictions: number | null;
    hitRate: number | null;
    p99Ms: number | null;
    sampledKeys: number | null;
    missingTtlPct: number | null;
    biggestKeyBytes: number | null;
  };
  keyspace: {
    sampled: number;
    withTtl: number;
    withoutTtl: number;
    missingTtlPct: number;
    namespaces: { prefix: string; count: number }[];
    bigKeys: { key: string; bytes: number }[];
  } | null;
};

type FindingRow = {
  id: string;
  severity: string;
  category: string;
  title: string;
  created_at: string;
};

type Point = { time: string; value: number };

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtNum(n: number | null, digits = 0, suffix = ""): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function Dashboard({
  databaseId,
  email,
  onLogout,
}: {
  databaseId: string;
  email: string;
  onLogout: () => void;
}) {
  const [hours, setHours] = useState<1 | 24>(1);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [memorySeries, setMemorySeries] = useState<Point[]>([]);
  const [opsSeries, setOpsSeries] = useState<Point[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const q = `databaseId=${encodeURIComponent(databaseId)}`;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, mem, ops, f] = await Promise.all([
          api<Snapshot>(`/v1/snapshot?${q}`),
          api<{ points: Point[] }>(`/v1/series?metric=used_memory&hours=${hours}&${q}`),
          api<{ points: Point[] }>(`/v1/series?metric=instantaneous_ops_per_sec&hours=${hours}&${q}`),
          api<{ findings: FindingRow[] }>(`/v1/findings?${q}`),
        ]);
        if (cancelled) return;
        setSnap(s);
        setMemorySeries(mem.points);
        setOpsSeries(ops.points);
        setFindings(f.findings);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed");
      }
    };
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hours, q]);

  const k = snap?.kpis;
  const high = findings.filter((x) => x.severity === "high").length;
  const healthTotal = snap?.health?.total ?? null;
  const healthTone = healthTotal == null ? "" : healthTotal >= 80 ? "ok" : healthTotal >= 60 ? "mid" : "bad";

  return (
    <div className="shell">
      <header className="nav">
        <div className="brand brand-nav">
          <BrandMark />
          <span className="brand-sub">Observability</span>
        </div>
        <p className="nav-meta">
          {snap?.collectedAt
            ? `Last sample ${new Date(snap.collectedAt).toLocaleString()}`
            : "Waiting for agent"}
        </p>
        <div className="nav-user">
          <span>{email}</span>
          <button type="button" className="ghost" onClick={() => onLogout()}>
            Log out
          </button>
        </div>
      </header>

      {error ? <p className="error banner-err">{error}</p> : null}

      <div className="priority">
        <section className={`health-hero ${healthTone}`}>
          <p className="kicker">Instance health</p>
          <p className="score">
            {healthTotal ?? "—"}
            <span>/100</span>
          </p>
          <p className="hero-copy">
            {healthTotal == null
              ? "Connect the agent to score this Redis."
              : healthTotal >= 80
                ? "Most subsystems look healthy. Check remaining findings."
                : "Action needed — hygiene or findings are pulling the score down."}
          </p>
        </section>

        <section className="findings-panel">
          <div className="section-head">
            <h2>Findings</h2>
            <span className={high ? "pill danger" : "pill"}>
              {high} high · {findings.length} open
            </span>
          </div>
          {findings.length === 0 ? (
            <p className="empty">No open findings.</p>
          ) : (
            <ul className="finding-list">
              {findings.map((f) => (
                <li key={f.id} className={`finding ${f.severity}`}>
                  <span className="sev">{f.severity}</span>
                  <div>
                    <p className="ftitle">{f.title}</p>
                    <p className="hint">{f.category.replaceAll("_", " ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {snap?.health ? (
        <section>
          <div className="section-head">
            <h2>Score breakdown</h2>
            <p className="hint">Weighted parts that make the 100</p>
          </div>
          <div className="parts">
            {snap.health.parts
              .filter((p) => p.id !== "latency")
              .map((p) => (
              <article key={p.id} className={`part ${p.score < 60 ? "bad" : p.score < 80 ? "mid" : "ok"}`}>
                <div className="part-top">
                  <span>{p.label}</span>
                  <strong>{p.score}</strong>
                </div>
                <div className="bar">
                  <i style={{ width: `${p.score}%` }} />
                </div>
                <p className="hint">{p.why}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="section-head">
          <h2>Live signals</h2>
        </div>
        <div className="cards primary">
          <Kpi label="Memory" value={k?.memoryPct != null ? fmtNum(k.memoryPct, 1, "%") : fmtBytes(k?.usedMemory ?? null)} hint={k?.maxMemory ? `limit ${fmtBytes(k.maxMemory)}` : "maxmemory unset"} />
          <Kpi label="Ops / sec" value={fmtNum(k?.opsPerSec ?? null, 0)} />
          <Kpi label="Clients" value={fmtNum(k?.clients ?? null, 0)} />
          <Kpi label="Hit rate" value={fmtNum(k?.hitRate ?? null, 1, "%")} />
          <Kpi label="Evictions" value={fmtNum(k?.evictions ?? null, 0)} tone={(k?.evictions ?? 0) > 0 ? "warn" : undefined} />
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Data hygiene</h2>
          <p className="hint">From rate-limited SCAN — names and sizes only</p>
        </div>
        <div className="cards hygiene">
          <Kpi label="Sampled keys" value={fmtNum(k?.sampledKeys ?? null, 0)} />
          <Kpi
            label="Keys without TTL"
            value={fmtNum(k?.missingTtlPct ?? null, 1, "%")}
            hint="of sampled keys"
            tone={(k?.missingTtlPct ?? 0) >= 50 ? "warn" : undefined}
          />
          <Kpi
            label="Largest key"
            value={fmtBytes(k?.biggestKeyBytes ?? null)}
            tone={(k?.biggestKeyBytes ?? 0) >= 2048 ? "warn" : undefined}
          />
        </div>
      </section>

      {snap?.keyspace ? (
        <section className="split">
          <article className="panel">
            <h2>Namespaces</h2>
            {snap.keyspace.namespaces.length === 0 ? (
              <p className="empty">No prefixes in this sample.</p>
            ) : (
              <ul className="list">
                {snap.keyspace.namespaces.map((n) => (
                  <li key={n.prefix}>
                    <code>{n.prefix}</code>
                    <span>{n.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
          <article className="panel">
            <h2>Largest keys</h2>
            {snap.keyspace.bigKeys.length === 0 ? (
              <p className="empty">No MEMORY USAGE samples.</p>
            ) : (
              <ul className="list">
                {snap.keyspace.bigKeys.map((b) => (
                  <li key={b.key}>
                    <code>{b.key}</code>
                    <span>{fmtBytes(b.bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </section>
      ) : null}

      <section>
        <div className="section-head">
          <h2>Trends</h2>
          <div className="range">
            <button type="button" className={hours === 1 ? "on" : ""} onClick={() => setHours(1)}>
              1h
            </button>
            <button type="button" className={hours === 24 ? "on" : ""} onClick={() => setHours(24)}>
              24h
            </button>
          </div>
        </div>
        <div className="split">
          <ChartCard title="Memory" data={memorySeries} />
          <ChartCard title="Operations / sec" data={opsSeries} />
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <article className={`card ${tone ?? ""}`}>
      <p className="label">{label}</p>
      <p className="value">{value}</p>
      {hint ? <p className="hint">{hint}</p> : null}
    </article>
  );
}

function ChartCard({ title, data }: { title: string; data: Point[] }) {
  const chartData = data.map((p) => ({
    t: new Date(p.time).toLocaleTimeString(),
    value: p.value,
  }));
  return (
    <article className="panel">
      <h2>{title}</h2>
      {chartData.length === 0 ? (
        <p className="hint">No points in this window.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <XAxis dataKey="t" tick={{ fill: "#8aa0c2", fontSize: 11 }} />
            <YAxis tick={{ fill: "#8aa0c2", fontSize: 11 }} width={72} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#1de9b6" dot={chartData.length < 8} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </article>
  );
}
