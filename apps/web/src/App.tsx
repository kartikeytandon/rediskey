import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, dbStorageKey, type DbRow, type Me } from "./api";
import { AppLayout, type AppPage } from "./AppLayout";
import { InstallPage } from "./InstallPage";
import { AlertsPage } from "./AlertsPage";
import { BrandMark } from "./BrandMark";

function currentPage(): AppPage {
  const path = window.location.pathname.replace(/\/$/, "");
  if (path.endsWith("/install")) return "install";
  if (path.endsWith("/alerts")) return "alerts";
  return "dashboard";
}

function navigateTo(page: AppPage) {
  const path =
    page === "install" ? "/app/install" : page === "alerts" ? "/app/alerts" : "/app";
  window.history.pushState({}, "", path);
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [databases, setDatabases] = useState<DbRow[]>([]);
  const [dbId, setDbId] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<{ agentKey: string; token: string } | null>(null);
  const [showAddDb, setShowAddDb] = useState(false);
  const [page, setPage] = useState<AppPage>(currentPage);

  const goTo = (next: AppPage) => {
    navigateTo(next);
    setPage(next);
  };

  useEffect(() => {
    const onPop = () => setPage(currentPage());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectDb = (orgId: string, id: string) => {
    localStorage.setItem(dbStorageKey(orgId), id);
    setDbId(id);
  };

  const refresh = async () => {
    try {
      const user = await api<Me>("/v1/auth/me");
      setMe(user);
      const list = await api<{ databases: DbRow[] }>("/v1/databases");
      setDatabases(list.databases);
      const stored = localStorage.getItem(dbStorageKey(user.organizationId));
      const pick =
        list.databases.find((d) => d.id === stored) ?? list.databases[0] ?? null;
      setDbId(pick?.id ?? null);
    } catch {
      setMe(null);
      setDatabases([]);
      setDbId(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (me === undefined) return <main className="page">Loading…</main>;
  if (!me) return <AuthForm onOk={() => void refresh()} />;
  if (!dbId && databases.length === 0) {
    return (
      <Onboard
        orgName={me.orgName}
        onCreated={async (created) => {
          setFreshToken({ agentKey: created.agentKey, token: created.token });
          await refresh();
          selectDb(me.organizationId, created.databaseId);
          goTo("install");
        }}
      />
    );
  }

  const activeDbId = dbId ?? databases[0]?.id ?? "";
  const activeDb = databases.find((d) => d.id === activeDbId);
  const installToken =
    freshToken && activeDb?.agentKey === freshToken.agentKey ? freshToken.token : undefined;

  return (
    <>
      {showAddDb ? (
        <AddDatabaseModal
          onClose={() => setShowAddDb(false)}
          onCreated={async (created) => {
            setFreshToken({ agentKey: created.agentKey, token: created.token });
            setShowAddDb(false);
            await refresh();
            selectDb(me.organizationId, created.databaseId);
            goTo("install");
          }}
        />
      ) : null}
      <AppLayout
        page={page}
        databases={databases}
        databaseId={activeDbId}
        email={me.email}
        onSelectDatabase={(id) => selectDb(me.organizationId, id)}
        onAddDatabase={() => setShowAddDb(true)}
        onNavigate={goTo}
        onLogout={async () => {
          await api("/v1/auth/logout", { method: "POST" });
          setMe(null);
          setDatabases([]);
          setDbId(null);
        }}
      >
        {page === "install" ? (
          <InstallPage
            databaseId={activeDbId}
            agentKey={activeDb?.agentKey ?? ""}
            engine={activeDb?.engine ?? "redis"}
            initialToken={installToken}
          />
        ) : page === "alerts" ? (
          <AlertsPage />
        ) : (
          <Dashboard databaseId={activeDbId} />
        )}
      </AppLayout>
    </>
  );
}

function AuthForm({ onOk }: { onOk: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [signupDisabled, setSignupDisabled] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ signupDisabled: boolean }>("/v1/auth/config")
      .then((c) => setSignupDisabled(c.signupDisabled))
      .catch(() => setSignupDisabled(false));
  }, []);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const path = mode === "login" ? "/v1/auth/login" : "/v1/auth/signup";
      await api(path, {
        method: "POST",
        body: JSON.stringify({ email, password, orgName }),
      });
      onOk();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="brand auth-brand">
          <BrandMark size="lg" />
        </div>
        <p className="lede">{mode === "signup" ? "Create your account" : "Sign in"}</p>
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
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>
        {mode === "signup" ? (
          <label>
            Organization
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme" />
          </label>
        ) : null}
        <button type="button" className="on" disabled={busy} onClick={() => void submit()}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
        {mode === "login" && !signupDisabled ? (
          <button type="button" className="ghost" onClick={() => setMode("signup")}>
            Need an account?
          </button>
        ) : null}
        {mode === "signup" ? (
          <button type="button" className="ghost" onClick={() => setMode("login")}>
            Have an account?
          </button>
        ) : null}
        {signupDisabled && mode === "login" ? (
          <p className="hint">New signups are invite-only for this pilot.</p>
        ) : null}
      </div>
    </main>
  );
}

function AddDatabaseModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: { databaseId: string; agentKey: string; token: string }) => void;
}) {
  const [name, setName] = useState("staging-redis");
  const [engine, setEngine] = useState("redis");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-labelledby="add-db-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <p className="modal-kicker">New instance</p>
            <h2 id="add-db-title">Add Redis</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <p className="modal-lede">
          Creates a read-only agent token for another Redis or Valkey host.
        </p>

        {error ? <p className="error modal-error">{error}</p> : null}

        <div className="modal-form">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="staging-redis"
              autoFocus
            />
            <span className="field-hint">Shown in the dashboard switcher</span>
          </label>

          <div className="field">
            <span className="field-label">Engine</span>
            <div className="engine-picks" role="group" aria-label="Engine">
              <button
                type="button"
                className={`engine-pick ${engine === "redis" ? "on" : ""}`}
                onClick={() => setEngine("redis")}
              >
                Redis
              </button>
              <button
                type="button"
                className={`engine-pick ${engine === "valkey" ? "on" : ""}`}
                onClick={() => setEngine("valkey")}
              >
                Valkey
              </button>
            </div>
          </div>
        </div>

        <footer className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="on"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setError(null);
              setBusy(true);
              try {
                const created = await api<{ databaseId: string; agentKey: string; token: string }>(
                  "/v1/databases",
                  {
                    method: "POST",
                    body: JSON.stringify({ name: name.trim(), engine, environment: "production" }),
                  },
                );
                onCreated(created);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not create database.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Creating…" : "Create instance"}
          </button>
        </footer>
      </div>
    </div>
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
  changes?: {
    id: string;
    label: string;
    current: number;
    baseline: number;
    deltaPct: number | null;
    unit: "bytes" | "ops" | "count" | "pct";
  }[];
  changesWindow?: "prior_24h" | "prior_5h" | null;
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
    scanTruncated?: boolean;
    scanComplete?: boolean;
    scanReason?: string;
  } | null;
  commandPicture: {
    topCommands: { command: string; calls: number; usec: number; usecPerCall: number }[];
    slowlogShares: { command: string; count: number; sharePct: number; totalDurationUs: number }[];
    hotKeys: { key: string; bytes: number; idleSeconds?: number; freq?: number }[];
  } | null;
};

type FindingRow = {
  id: string;
  severity: string;
  category: string;
  title: string;
  created_at: string;
  evidence: Record<string, unknown>;
};

function evidenceData(evidence: Record<string, unknown>): Record<string, unknown> {
  const out = { ...evidence };
  delete out.meaning;
  delete out.action;
  delete out.workload;
  delete out.workloadLabel;
  return out;
}

function humanEvidenceLabel(key: string): string {
  return key.replaceAll("_", " ");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function EvidenceBlock({ label, value }: { label: string; value: unknown }) {
  if (value == null || value === "") return null;

  if (Array.isArray(value) && value.length > 0 && isRecord(value[0])) {
    const first = value[0];
    if ("key" in first && "bytes" in first) {
      return (
        <div className="evidence-block">
          <p className="evidence-label">{humanEvidenceLabel(label)}</p>
          <ul className="list evidence-list">
            {(value as { key: string; bytes: number }[]).map((k) => (
              <li key={k.key}>
                <code>{k.key}</code>
                <span>{fmtBytes(k.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if ("prefix" in first && "count" in first) {
      return (
        <div className="evidence-block">
          <p className="evidence-label">{humanEvidenceLabel(label)}</p>
          <ul className="list evidence-list">
            {(value as { prefix: string; count: number }[]).map((n) => (
              <li key={n.prefix}>
                <code>{n.prefix}</code>
                <span>{n.count}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if ("command" in first && "sharePct" in first) {
      return (
        <div className="evidence-block">
          <p className="evidence-label">{humanEvidenceLabel(label)}</p>
          <ul className="list evidence-list">
            {(value as { command: string; sharePct: number; count?: number }[]).map((c) => (
              <li key={c.command}>
                <code>{c.command}</code>
                <span>
                  {c.sharePct.toFixed(0)}%
                  {c.count != null ? ` · ${c.count} entries` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    if ("command" in first && "calls" in first) {
      return (
        <div className="evidence-block">
          <p className="evidence-label">{humanEvidenceLabel(label)}</p>
          <ul className="list evidence-list">
            {(value as { command: string; calls: number; usecPerCall?: number }[]).map((c) => (
              <li key={c.command}>
                <code>{c.command}</code>
                <span>
                  {c.calls.toLocaleString()} calls
                  {c.usecPerCall != null ? ` · ${c.usecPerCall.toFixed(1)} µs/call` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
  }

  if (typeof value === "number") {
    let display = String(value);
    if (label.includes("Pct") || label === "hitRate" || label === "ratio") {
      display = `${(value * (value <= 1 ? 100 : 1)).toFixed(1)}%`;
    } else if (label.includes("memory") || label.includes("bytes") || label === "rss") {
      display = fmtBytes(value);
    } else {
      display = Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
    }
    return (
      <div className="evidence-scalar">
        <span>{humanEvidenceLabel(label)}</span>
        <strong>{display}</strong>
      </div>
    );
  }

  if (typeof value === "string") {
    return (
      <div className="evidence-scalar">
        <span>{humanEvidenceLabel(label)}</span>
        <strong>{value}</strong>
      </div>
    );
  }

  return (
    <div className="evidence-block">
      <p className="evidence-label">{humanEvidenceLabel(label)}</p>
      <pre className="evidence-raw">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function FindingItem({ finding: f }: { finding: FindingRow }) {
  const [open, setOpen] = useState(false);
  const meaning = typeof f.evidence?.meaning === "string" ? f.evidence.meaning : null;
  const action = typeof f.evidence?.action === "string" ? f.evidence.action : null;
  const workloadLabel =
    typeof f.evidence?.workloadLabel === "string" ? f.evidence.workloadLabel : null;
  const data = evidenceData(f.evidence ?? {});
  const dataEntries = Object.entries(data).filter(([, v]) => v != null && v !== "");

  return (
    <li className={`finding ${f.severity}`}>
      <button type="button" className="finding-toggle" onClick={() => setOpen((o) => !o)}>
        <div className="finding-body">
          <p className="ftitle">
            <span className={`sev-badge ${f.severity}`}>{f.severity}</span>
            {f.title}
          </p>
          <p className="hint">
            {f.category.replaceAll("_", " ")}
            {workloadLabel && workloadLabel !== "unknown" ? ` · ${workloadLabel}` : ""}
          </p>
        </div>
        <span className="finding-chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="finding-detail">
          {meaning ? (
            <div className="finding-callout">
              <p className="finding-callout-label">What it means</p>
              <p>{meaning}</p>
            </div>
          ) : null}
          {action ? (
            <div className="finding-callout action">
              <p className="finding-callout-label">What to check</p>
              <p>{action}</p>
            </div>
          ) : null}
          {dataEntries.length > 0 ? (
            <div className="finding-evidence">
              {dataEntries.map(([key, value]) => (
                <EvidenceBlock key={key} label={key} value={value} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

type SeverityFilter = "all" | "high" | "warning" | "info";

const FINDINGS_PREVIEW = 2;
const LIST_PREVIEW = 8;
const BIG_KEYS_PREVIEW = 8;

function ShowMoreControls({
  total,
  preview,
  expanded,
  onExpand,
  onCollapse,
  className = "inv-more",
}: {
  total: number;
  preview: number;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  className?: string;
}) {
  if (total <= preview) return null;
  if (!expanded) {
    return (
      <button type="button" className={className} onClick={onExpand}>
        See more ({total - preview})
      </button>
    );
  }
  return (
    <button type="button" className={`${className} ghost`} onClick={onCollapse}>
      Show less
    </button>
  );
}

function CollapsibleInvRows<T>({
  items,
  preview = LIST_PREVIEW,
  empty,
  columns,
  renderRow,
}: {
  items: T[];
  preview?: number;
  empty: string;
  columns: [string, string];
  renderRow: (item: T) => { key: string; left: ReactNode; right: ReactNode };
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, preview);

  return (
    <>
      <div className="inv-cols">
        <span>{columns[0]}</span>
        <span>{columns[1]}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="inv-rows">
          {visible.map((item) => {
            const row = renderRow(item);
            return (
              <li key={row.key}>
                {row.left}
                {row.right}
              </li>
            );
          })}
        </ul>
      )}
      <ShowMoreControls
        total={items.length}
        preview={preview}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onCollapse={() => setExpanded(false)}
      />
    </>
  );
}

type ExplainCitation = { kind: string; id: string; label: string };
type ExplainResult = {
  answer: string;
  citations: ExplainCitation[];
  mode: "llm" | "rules";
  model: string | null;
};

function renderExplainInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function ExplainAnswerBody({ answer }: { answer: string }) {
  const blocks = answer
    .trim()
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className="explain-body">
      {blocks.map((block, i) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const isList = lines.length > 0 && lines.every((l) => /^([-*•]|\d+\.)\s/.test(l));
        if (isList) {
          return (
            <ul key={i} className="explain-list">
              {lines.map((line, j) => (
                <li key={j}>{renderExplainInline(line.replace(/^([-*•]|\d+\.)\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        const plain = lines.join(" ").replace(/\*\*/g, "");
        if (lines.length === 1 && /:$/.test(plain)) {
          return (
            <p key={i} className="explain-subhead">
              {renderExplainInline(lines[0])}
            </p>
          );
        }
        return (
          <p key={i} className={i === 0 ? "explain-lead" : "explain-para"}>
            {lines.map((line, j) => (
              <span key={j}>
                {renderExplainInline(line)}
                {j < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

const EXPLAIN_STEPS = ["Reading latest sample", "Weighing findings & KPIs", "Ranking the primary cause"];

function ExplainDiagnosisPanel({
  busy,
  error,
  result,
  onRetry,
  onDismiss,
}: {
  busy: boolean;
  error: string | null;
  result: ExplainResult | null;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!busy) {
      setStep(0);
      return;
    }
    setStep(0);
    const t1 = window.setTimeout(() => setStep(1), 700);
    const t2 = window.setTimeout(() => setStep(2), 1500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [busy]);

  useEffect(() => {
    if (!result && !busy && !error) return;
    panelRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }, [result, busy, error, reduceMotion]);

  if (!busy && !result && !error) return null;

  const modeLabel =
    result?.mode === "llm"
      ? result.model
        ? `Model · ${result.model.replace(/^models\//, "")}`
        : "Model diagnosis"
      : result
        ? "Evidence rules"
        : null;

  return (
    <motion.section
      ref={panelRef}
      className={`explain-panel ${busy ? "is-busy" : ""} ${error && !result ? "is-error" : ""}`}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      aria-live="polite"
    >
      <div className="explain-panel-top">
        <div>
          <p className="explain-kicker">Diagnosis</p>
          <h2>Why is Redis slow?</h2>
        </div>
        <div className="explain-panel-actions">
          {modeLabel ? <span className="pill explain-mode">{modeLabel}</span> : null}
          {!busy ? (
            <button type="button" className="explain-ghost" onClick={onDismiss}>
              Dismiss
            </button>
          ) : null}
        </div>
      </div>

      {busy ? (
        <div className="explain-loading" aria-busy="true">
          <div className="explain-loading-bar" />
          <p className="explain-loading-title">Tracing latency from Baltan evidence…</p>
          <ol className="explain-steps">
            {EXPLAIN_STEPS.map((label, i) => (
              <li key={label} className={i <= step ? "on" : ""}>
                <span className="explain-step-dot" />
                {label}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {error && !busy ? <p className="error explain-inline-err">{error}</p> : null}

      {result && !busy ? (
        <>
          <ExplainAnswerBody answer={result.answer} />
          {result.citations.length > 0 ? (
            <div className="explain-citations">
              <p className="field-label">Cited evidence</p>
              <ul className="explain-cite-chips">
                {result.citations.map((c) => (
                  <li key={`${c.kind}:${c.id}`} className={`cite-${c.kind}`}>
                    <span className="explain-cite-kind">{c.kind}</span>
                    <span className="explain-cite-label">{c.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="explain-footer">
            <p className="explain-footnote">
              Answer uses only this instance’s sample — missing signals are never invented.
            </p>
            <button type="button" className="explain-ghost" onClick={onRetry}>
              Run again
            </button>
          </div>
        </>
      ) : null}
    </motion.section>
  );
}

function clampPct(n: number | null | undefined): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function SignalRing({
  label,
  display,
  pct,
  tone,
}: {
  label: string;
  display: string;
  pct: number | null;
  tone: "ok" | "mid" | "bad" | "muted";
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const filled = pct == null ? 0 : (pct / 100) * c;
  return (
    <div className={`signal-ring tone-${tone}`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle className="signal-ring-track" cx="36" cy="36" r={r} />
        <circle
          className="signal-ring-value"
          cx="36"
          cy="36"
          r={r}
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <div className="signal-ring-readout">
        <strong>{display}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function composePressureLine(k: Snapshot["kpis"] | undefined): string {
  if (!k) return "Waiting for the next agent sample.";
  const bits: string[] = [];
  if (k.memoryPct != null) bits.push(`${k.memoryPct.toFixed(0)}% of maxmemory`);
  if (k.p99Ms != null) bits.push(`P99 ${k.p99Ms.toFixed(1)} ms`);
  if (k.missingTtlPct != null) bits.push(`${k.missingTtlPct.toFixed(0)}% keys without TTL`);
  if (k.evictions != null && k.evictions > 0) bits.push(`${k.evictions} evictions`);
  if (bits.length === 0) return "Sample landed — pressure signals still filling in.";
  return bits.join(" · ");
}

function FindingsPanel({
  findings,
  kpis,
}: {
  findings: FindingRow[];
  kpis: Snapshot["kpis"] | undefined;
}) {
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [expanded, setExpanded] = useState(false);

  const counts = {
    all: findings.length,
    high: findings.filter((f) => f.severity === "high").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  const filtered =
    filter === "all" ? findings : findings.filter((f) => f.severity === filter);
  const visible = expanded ? filtered : filtered.slice(0, FINDINGS_PREVIEW);

  const memPct = clampPct(kpis?.memoryPct);
  const ttlPct = clampPct(kpis?.missingTtlPct);
  const latPct =
    kpis?.p99Ms == null ? null : clampPct(Math.min(100, (kpis.p99Ms / 50) * 100));

  const memTone: "ok" | "mid" | "bad" | "muted" =
    memPct == null ? "muted" : memPct >= 90 ? "bad" : memPct >= 75 ? "mid" : "ok";
  const latTone: "ok" | "mid" | "bad" | "muted" =
    kpis?.p99Ms == null ? "muted" : kpis.p99Ms >= 20 ? "bad" : kpis.p99Ms >= 8 ? "mid" : "ok";
  const ttlTone: "ok" | "mid" | "bad" | "muted" =
    ttlPct == null ? "muted" : ttlPct >= 50 ? "bad" : ttlPct >= 25 ? "mid" : "ok";

  const setFilterAndReset = (next: SeverityFilter) => {
    setFilter(next);
    setExpanded(false);
  };

  const filters: { id: SeverityFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "high", label: "High", count: counts.high },
    { id: "warning", label: "Warning", count: counts.warning },
    { id: "info", label: "Info", count: counts.info },
  ];

  return (
    <section className="findings-panel">
      <div className="section-head">
        <h2>Findings</h2>
        <span className={counts.high ? "pill danger" : "pill"}>
          {counts.high} high · {counts.all} open
        </span>
      </div>

      {findings.length > 0 ? (
        <div className="finding-filters" role="tablist" aria-label="Filter findings by severity">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`finding-filter sev-${f.id} ${filter === f.id ? "on" : ""}`}
              onClick={() => setFilterAndReset(f.id)}
            >
              {f.label}
              <span className="finding-filter-count">{f.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="findings-body">
        {findings.length === 0 ? (
          <p className="empty">No open findings.</p>
        ) : filtered.length === 0 ? (
          <p className="empty">No {filter} findings.</p>
        ) : (
          <>
            <ul className="finding-list">
              {visible.map((f) => (
                <FindingItem key={f.id} finding={f} />
              ))}
            </ul>
            <ShowMoreControls
              className="finding-more"
              total={filtered.length}
              preview={FINDINGS_PREVIEW}
              expanded={expanded}
              onExpand={() => setExpanded(true)}
              onCollapse={() => setExpanded(false)}
            />
          </>
        )}
      </div>

      <aside className="signal-map" aria-label="Live pressure from this sample">
        <div className="signal-map-head">
          <p className="signal-map-kicker">Live pressure</p>
        </div>
        <div className="signal-rings">
          <SignalRing
            label="Memory"
            display={memPct == null ? "—" : `${memPct.toFixed(0)}%`}
            pct={memPct}
            tone={memTone}
          />
          <SignalRing
            label="Latency"
            display={kpis?.p99Ms == null ? "—" : `${kpis.p99Ms.toFixed(0)}ms`}
            pct={latPct}
            tone={latTone}
          />
          <SignalRing
            label="No TTL"
            display={ttlPct == null ? "—" : `${ttlPct.toFixed(0)}%`}
            pct={ttlPct}
            tone={ttlTone}
          />
        </div>
        <p className="signal-map-line">{composePressureLine(kpis)}</p>
      </aside>
    </section>
  );
}

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

function fmtChangeValue(value: number, unit: "bytes" | "ops" | "count" | "pct"): string {
  if (unit === "bytes") return fmtBytes(value);
  if (unit === "pct") return fmtNum(value, 1, "%");
  if (unit === "ops") return fmtNum(value, 0);
  return fmtNum(value, 0);
}

function fmtDelta(deltaPct: number | null): string {
  if (deltaPct == null) return "n/a";
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct.toFixed(0)}%`;
}

type ChangeRow = NonNullable<Snapshot["changes"]>[number];

function changeById(changes: ChangeRow[] | undefined, id: string): ChangeRow | undefined {
  return changes?.find((c) => c.id === id);
}

function PulseDelta({ change }: { change: ChangeRow | undefined }) {
  if (!change || change.deltaPct == null) return null;
  const up = change.deltaPct > 3;
  const down = change.deltaPct < -3;
  const tone = up ? "up" : down ? "down" : "flat";
  return (
    <span className={`pulse-delta ${tone}`} title={`was ${fmtChangeValue(change.baseline, change.unit)}`}>
      {fmtDelta(change.deltaPct)}
    </span>
  );
}

function PulseStrip({
  k,
  changes,
  changesWindow,
  scanTruncated,
  scanComplete,
  scanReason,
  sampledKeys,
}: {
  k: Snapshot["kpis"] | undefined;
  changes: ChangeRow[] | undefined;
  changesWindow: Snapshot["changesWindow"];
  scanTruncated: boolean;
  scanComplete: boolean;
  scanReason?: string | null;
  sampledKeys?: number | null;
}) {
  const deltaHint =
    changes && changes.length > 0
      ? changesWindow === "prior_5h"
        ? "Δ last 1h vs prior 5h"
        : "Δ last 1h vs prior 24h"
      : null;

  const truncatedTitle = (() => {
    const base =
      "Keyspace SCAN stopped early so hygiene / largest-key stats are a partial sample — not every key.";
    if (scanReason) return `${base}\n\nWhy: ${scanReason}`;
    if (sampledKeys != null) {
      return `${base}\n\nSampled ${sampledKeys.toLocaleString()} keys before stopping (key limit or timeout). Raise --scan-limit / --scan-timeout for a fuller sample.`;
    }
    return `${base}\n\nUsually the agent hit --scan-limit or --scan-timeout.`;
  })();

  return (
    <section className="pulse">
      <div className="section-head">
        <h2>Pulse</h2>
        <div className="section-head-meta">
          {deltaHint ? <p className="hint">{deltaHint}</p> : null}
          {scanTruncated ? (
            <span className="pill warn" title={truncatedTitle}>
              SCAN truncated
            </span>
          ) : scanComplete ? (
            <span
              className="pill"
              title="Keyspace SCAN finished within the agent limit and timeout — sample covered the full pass."
            >
              Full SCAN
            </span>
          ) : null}
        </div>
      </div>

      <div className="pulse-block">
        <div className="pulse-col">
          <p className="pulse-group-label">Live</p>
          <div className="pulse-grid">
            <div className="pulse-item">
              <p className="label">Memory</p>
              <p className="value">
                {k?.memoryPct != null ? fmtNum(k.memoryPct, 1, "%") : fmtBytes(k?.usedMemory ?? null)}
                <PulseDelta change={changeById(changes, "memory")} />
              </p>
              <p className="hint">{k?.maxMemory ? `limit ${fmtBytes(k.maxMemory)}` : "maxmemory unset"}</p>
            </div>
            <div className="pulse-item">
              <p className="label">Ops / sec</p>
              <p className="value">
                {fmtNum(k?.opsPerSec ?? null, 0)}
                <PulseDelta change={changeById(changes, "ops")} />
              </p>
            </div>
            <div className="pulse-item">
              <p className="label">Clients</p>
              <p className="value">
                {fmtNum(k?.clients ?? null, 0)}
                <PulseDelta change={changeById(changes, "clients")} />
              </p>
            </div>
            <div className="pulse-item">
              <p className="label">Hit rate</p>
              <p className="value">
                {fmtNum(k?.hitRate ?? null, 1, "%")}
                <PulseDelta change={changeById(changes, "hitRate")} />
              </p>
            </div>
            {k?.p99Ms != null ? (
              <div className={`pulse-item ${k.p99Ms > 5 ? "warn" : ""}`}>
                <p className="label">P99</p>
                <p className="value">{fmtNum(k.p99Ms, 2, " ms")}</p>
              </div>
            ) : null}
            <div className={`pulse-item ${(k?.evictions ?? 0) > 0 ? "warn" : ""}`}>
              <p className="label">Evictions</p>
              <p className="value">{fmtNum(k?.evictions ?? null, 0)}</p>
            </div>
          </div>
        </div>

        <div className="pulse-col">
          <p className="pulse-group-label">Hygiene</p>
          <div className="pulse-grid">
            <div className="pulse-item">
              <p className="label">Sampled keys</p>
              <p className="value">{fmtNum(k?.sampledKeys ?? null, 0)}</p>
            </div>
            <div className={`pulse-item ${(k?.missingTtlPct ?? 0) >= 50 ? "warn" : ""}`}>
              <p className="label">Without TTL</p>
              <p className="value">{fmtNum(k?.missingTtlPct ?? null, 1, "%")}</p>
            </div>
            <div className={`pulse-item ${(k?.biggestKeyBytes ?? 0) >= 2048 ? "warn" : ""}`}>
              <p className="label">Largest key</p>
              <p className="value">{fmtBytes(k?.biggestKeyBytes ?? null)}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

type InvestigateTab = "commands" | "keyspace" | "hotkeys";

function InvestigatePanel({
  commandPicture,
  keyspace,
}: {
  commandPicture: Snapshot["commandPicture"];
  keyspace: Snapshot["keyspace"];
}) {
  const hasCommands = Boolean(commandPicture);
  const hasKeyspace = Boolean(keyspace);
  const hasHot = Boolean(commandPicture?.hotKeys && commandPicture.hotKeys.length > 0);

  const [tab, setTab] = useState<InvestigateTab>("commands");

  useEffect(() => {
    const ok =
      (tab === "commands" && hasCommands) ||
      (tab === "keyspace" && hasKeyspace) ||
      (tab === "hotkeys" && hasHot);
    if (ok) return;
    if (hasCommands) setTab("commands");
    else if (hasKeyspace) setTab("keyspace");
    else if (hasHot) setTab("hotkeys");
  }, [tab, hasCommands, hasKeyspace, hasHot]);

  if (!hasCommands && !hasKeyspace && !hasHot) return null;

  return (
    <section className="investigate">
      <div className="investigate-panel">
        <div className="investigate-head">
          <div>
            <h2>Investigate</h2>
            <p className="hint">Names and sizes only — no values or args</p>
          </div>
          <div className="investigate-tabs" role="tablist" aria-label="Investigate">
            {hasCommands ? (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "commands"}
                className={tab === "commands" ? "on" : undefined}
                onClick={() => setTab("commands")}
              >
                Commands
              </button>
            ) : null}
            {hasKeyspace ? (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "keyspace"}
                className={tab === "keyspace" ? "on" : undefined}
                onClick={() => setTab("keyspace")}
              >
                Keyspace
              </button>
            ) : null}
            {hasHot ? (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "hotkeys"}
                className={tab === "hotkeys" ? "on" : undefined}
                onClick={() => setTab("hotkeys")}
              >
                Hot keys
              </button>
            ) : null}
          </div>
        </div>

        {tab === "commands" && commandPicture ? (
          <div className="inv-stack">
            <div className="inv-block">
              <CollapsibleInvRows
                items={commandPicture.topCommands}
                empty="No commandstats on this sample."
                columns={["Command", "Calls · µs/call"]}
                renderRow={(c) => ({
                  key: c.command,
                  left: <code>{c.command}</code>,
                  right: (
                    <span>
                      {c.calls.toLocaleString()} · {c.usecPerCall.toFixed(1)}
                    </span>
                  ),
                })}
              />
            </div>
            <div className="inv-block">
              <CollapsibleInvRows
                items={commandPicture.slowlogShares}
                empty="No slowlog entries in sample."
                columns={["Slowlog command", "Share · entries"]}
                renderRow={(s) => ({
                  key: s.command,
                  left: <code>{s.command}</code>,
                  right: (
                    <span>
                      {s.sharePct.toFixed(0)}% · {s.count}
                    </span>
                  ),
                })}
              />
            </div>
          </div>
        ) : null}

        {tab === "keyspace" && keyspace ? (
          <div className="inv-stack">
            <div className="inv-block">
              <CollapsibleInvRows
                items={keyspace.namespaces}
                empty="No prefixes in this sample."
                columns={["Namespace", "Keys"]}
                renderRow={(n) => ({
                  key: n.prefix,
                  left: <code>{n.prefix}</code>,
                  right: <span>{n.count.toLocaleString()}</span>,
                })}
              />
            </div>
            <div className="inv-block">
              <CollapsibleInvRows
                items={keyspace.bigKeys}
                preview={BIG_KEYS_PREVIEW}
                empty="No MEMORY USAGE samples."
                columns={["Largest key", "Size"]}
                renderRow={(b) => ({
                  key: b.key,
                  left: <code>{b.key}</code>,
                  right: <span>{fmtBytes(b.bytes)}</span>,
                })}
              />
            </div>
          </div>
        ) : null}

        {tab === "hotkeys" && commandPicture ? (
          <div className="inv-block">
            <CollapsibleInvRows
              items={commandPicture.hotKeys}
              empty="No hot-key candidates in this sample."
              columns={["Hot key", "Size · activity"]}
              renderRow={(h) => ({
                key: h.key,
                left: <code>{h.key}</code>,
                right: (
                  <span>
                    {fmtBytes(h.bytes)}
                    {h.idleSeconds != null && h.idleSeconds >= 0 ? ` · idle ${h.idleSeconds}s` : ""}
                    {h.freq ? ` · freq ${h.freq}` : ""}
                  </span>
                ),
              })}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Dashboard({ databaseId }: { databaseId: string }) {
  const [hours, setHours] = useState<1 | 24>(1);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [memorySeries, setMemorySeries] = useState<Point[]>([]);
  const [opsSeries, setOpsSeries] = useState<Point[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [explain, setExplain] = useState<ExplainResult | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const q = `databaseId=${encodeURIComponent(databaseId)}`;

  useEffect(() => {
    setExplain(null);
    setExplainError(null);
    setExplainOpen(false);
  }, [databaseId]);

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

  const runExplain = () => {
    setExplainOpen(true);
    setExplainBusy(true);
    setExplainError(null);
    void api<ExplainResult>(`/v1/diagnose/explain?${q}`, {
      method: "POST",
      body: JSON.stringify({ question: "Why is Redis slow?" }),
    })
      .then((res) => setExplain(res))
      .catch((e) => {
        setExplain(null);
        setExplainError(e instanceof Error ? e.message : "Explain failed.");
      })
      .finally(() => setExplainBusy(false));
  };

  const k = snap?.kpis;
  const scanTruncated =
    snap?.keyspace?.scanTruncated === true ||
    (snap as Snapshot & { metrics?: Record<string, number> })?.metrics?.keyspace_scan_truncated === 1;
  const scanComplete = snap?.keyspace?.scanComplete === true;
  const healthTotal = snap?.health?.total ?? null;
  const healthTone = healthTotal == null ? "" : healthTotal >= 80 ? "ok" : healthTotal >= 60 ? "mid" : "bad";
  const healthParts =
    snap?.health?.parts.filter((p) => p.id !== "latency" || k?.p99Ms != null) ?? [];

  return (
    <>
      <p className="dash-status">
        {snap?.collectedAt
          ? `Last sample ${new Date(snap.collectedAt).toLocaleString()}`
          : "Waiting for agent — run the Baltan agent against this instance"}
      </p>

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
          <div className="explain-cta">
            <button
              type="button"
              className={`explain-btn ${healthTone === "bad" || healthTone === "mid" ? "explain-btn-emphasis" : ""}`}
              disabled={explainBusy || healthTotal == null}
              onClick={runExplain}
            >
              {explainBusy ? "Diagnosing…" : explain ? "Re-run diagnosis" : "Why is Redis slow?"}
            </button>
            <p className="explain-cta-hint">Ranked cause from this sample — not a metric dump.</p>
          </div>
          {healthParts.length > 0 ? (
            <ul className="health-parts">
              {healthParts.map((p) => (
                <li key={p.id} className={p.score < 60 ? "bad" : p.score < 80 ? "mid" : "ok"} title={p.why}>
                  <div className="health-part-top">
                    <span>{p.label}</span>
                    <strong>{p.score}</strong>
                  </div>
                  <div className="health-part-bar">
                    <i style={{ width: `${p.score}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <FindingsPanel findings={findings} kpis={k} />
      </div>

      <AnimatePresence mode="popLayout">
        {explainOpen ? (
          <ExplainDiagnosisPanel
            key="explain-panel"
            busy={explainBusy}
            error={explainError}
            result={explain}
            onRetry={runExplain}
            onDismiss={() => {
              setExplainOpen(false);
              setExplainError(null);
            }}
          />
        ) : null}
      </AnimatePresence>

      <PulseStrip
        k={k}
        changes={snap?.changes}
        changesWindow={snap?.changesWindow}
        scanTruncated={scanTruncated}
        scanComplete={scanComplete}
        scanReason={snap?.keyspace?.scanReason}
        sampledKeys={snap?.keyspace?.sampled ?? k?.sampledKeys}
      />

      <InvestigatePanel commandPicture={snap?.commandPicture ?? null} keyspace={snap?.keyspace ?? null} />

      <section className="trends">
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
        <div className="trends-split">
          <ChartCard title="Memory" data={memorySeries} kind="memory" />
          <ChartCard title="Operations / sec" data={opsSeries} kind="ops" />
        </div>
      </section>
    </>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  valueLabel,
  formatValue,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  valueLabel: string;
  formatValue: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  if (v == null) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-time">{label}</p>
      <p className="chart-tooltip-value">
        {valueLabel}: <strong>{formatValue(v)}</strong>
      </p>
    </div>
  );
}

function ChartCard({
  title,
  data,
  kind,
}: {
  title: string;
  data: Point[];
  kind: "memory" | "ops";
}) {
  const chartData = data.map((p) => ({
    t: new Date(p.time).toLocaleTimeString(),
    value: p.value,
  }));
  const formatValue = kind === "memory" ? (v: number) => fmtBytes(v) : (v: number) => fmtNum(v, 0);
  const yFormat =
    kind === "memory"
      ? (v: number) => fmtBytes(v)
      : (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
  const latest = data.length > 0 ? data[data.length - 1] : null;
  const sparse = chartData.length > 0 && chartData.length < 2;

  return (
    <article className="panel chart-card">
      <div className="chart-card-head">
        <h2>{title}</h2>
        {latest ? (
          <p className="chart-latest">
            <strong>{formatValue(latest.value)}</strong>
            <span>{new Date(latest.time).toLocaleTimeString()}</span>
          </p>
        ) : null}
      </div>
      {chartData.length === 0 ? (
        <div className="chart-empty">
          <p className="hint">No samples in this window yet.</p>
        </div>
      ) : sparse ? (
        <div className="chart-sparse">
          <p className="chart-sparse-value">{formatValue(latest!.value)}</p>
          <p className="hint">One sample so far — leave the agent on `--interval 10s` to build a curve.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={248}>
          <LineChart data={chartData} margin={{ top: 16, right: 16, left: 8, bottom: 12 }}>
            <XAxis
              dataKey="t"
              tick={{ fill: "#8aa0c2", fontSize: 11 }}
              minTickGap={40}
              interval="preserveStartEnd"
              tickMargin={10}
              height={36}
            />
            <YAxis
              tick={{ fill: "#8aa0c2", fontSize: 11 }}
              width={72}
              tickFormatter={yFormat}
              tickMargin={8}
            />
            <Tooltip
              content={
                <ChartTooltip
                  valueLabel={kind === "memory" ? "Memory" : "Ops / sec"}
                  formatValue={formatValue}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#1de9b6"
              dot={chartData.length < 8}
              activeDot={{ r: 4, fill: "#1de9b6", stroke: "#0d1117", strokeWidth: 2 }}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </article>
  );
}
