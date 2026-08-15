import { useEffect, useState } from "react";
import { CalendlyEmbed } from "./CalendlyEmbed";

const prefix = "/api";

/** Event link from Calendly (Share → Open in new tab). Override with VITE_CALENDLY_URL. */
const CALENDLY_URL =
  import.meta.env.VITE_CALENDLY_URL ?? "https://calendly.com/tandonkartikey11/30min";
const DEMO_NAME = "Kartikey";

export function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void fetch(`${prefix}/v1/auth/me`, { credentials: "include" }).then((r) => {
      setSignedIn(r.ok);
    });
  }, []);

  const cta = "/app";
  const ctaLabel = signedIn ? "Open dashboard" : "Start a pilot";

  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <span className="logo">R</span>
          Rediskey
        </a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#setup">Setup</a>
          <a href="#hosting">Hosting</a>
          <a href="#demo">Book a demo</a>
          <a className="lp-cta" href={cta}>
            {ctaLabel}
          </a>
        </nav>
      </header>

      <section className="lp-hero">
        <p className="lp-kicker">Redis / Valkey observability</p>
        <h1>See why Redis is slow, fat, or risky — without opening it to the internet.</h1>
        <p className="lp-lead">
          Rediskey is not a key browser. A small read-only agent sits next to your Redis, sends
          metrics and key names (not values) to a dashboard, and turns that into a health score
          and explainable findings.
        </p>
        <div className="lp-actions">
          <a className="lp-cta" href={cta}>
            {ctaLabel}
          </a>
          <a className="lp-ghost" href="#demo">
            Book a demo
          </a>
        </div>
        <p className="lp-note">Closed V1 pilot. Start with staging Redis, not your only production box.</p>
      </section>

      <section className="lp-grid3" id="product">
        <article>
          <h2>Health you can explain</h2>
          <p>A 0–100 score from memory, hygiene, cache hits, expensive commands — with a sentence for each part.</p>
        </article>
        <article>
          <h2>Findings, not a CLI</h2>
          <p>Missing TTLs, large keys, memory near maxmemory, slowlog of KEYS / HGETALL. Names and sizes only.</p>
        </article>
        <article>
          <h2>Redis stays private</h2>
          <p>You never expose 6379 to us. The agent talks out over HTTPS. We do not store key values or command arguments.</p>
        </article>
      </section>

      <section id="how">
        <h2 className="lp-h">How it works</h2>
        <ol className="lp-steps">
          <li>
            <strong>Create an org</strong>
            Sign up on this site. That is your company account. The dashboard lives here (cloud).
          </li>
          <li>
            <strong>Register a database</strong>
            Name the Redis or Valkey instance. You get an agent token once, plus an agent id.
          </li>
          <li>
            <strong>Run the agent next to Redis</strong>
            Same VPC or machine as Redis. It collects INFO, SLOWLOG, and a rate-limited SCAN, then POSTs to this API.
          </li>
          <li>
            <strong>Watch the dashboard</strong>
            Health, findings, live signals, namespaces. Closing the browser does not stop the agent; sleeping the machine that runs the agent does.
          </li>
        </ol>
      </section>

      <section id="setup">
        <h2 className="lp-h">Setup guide</h2>
        <div className="lp-split">
          <article className="lp-card">
            <h3>1. Account</h3>
            <p>
              Open <a href="/app">the app</a>, create an account (password 8+ characters), then connect a database.
              Copy <code>AGENT_TOKEN</code> and <code>--agent-id</code> immediately — the token is shown once.
            </p>
          </article>
          <article className="lp-card">
            <h3>2. Agent</h3>
            <pre>{`AGENT_TOKEN=rk_….
agent --addr REDIS_HOST:6379 \\
      --engine redis \\
      --agent-id agt_…. \\
      --ingest-url https://YOUR_HOST \\
      --interval 10s`}</pre>
            <p className="lp-muted">
              Local ingest to 127.0.0.1 may omit the token in dev. Any public ingest URL requires{" "}
              <code>AGENT_TOKEN</code>. Redis AUTH: set <code>REDIS_PASSWORD</code> on the agent host only.
            </p>
          </article>
          <article className="lp-card">
            <h3>3. Keep it running</h3>
            <p>
              Use <code>--interval</code> so the agent loops. Run it as Docker or systemd on a box that stays on. A
              laptop lid-close stops collection if the agent is on that laptop.
            </p>
          </article>
        </div>
      </section>

      <section id="hosting">
        <h2 className="lp-h">Hosting</h2>
        <div className="lp-split two">
          <article className="lp-card featured">
            <div className="lp-card-head">
              <span className="lp-badge">Default</span>
              <h3>Cloud</h3>
            </div>
            <div className="lp-card-body">
              <p>
                We run the dashboard, API, and Postgres. You run only the agent beside Redis. Same model as other
                metrics vendors: telemetry leaves your network; Redis does not.
              </p>
              <p>This site is that product. Pilot accounts by invite / signup on this host.</p>
            </div>
          </article>
          <article className="lp-card">
            <div className="lp-card-head">
              <span className="lp-badge soon">Coming soon</span>
              <h3>Self-host</h3>
            </div>
            <div className="lp-card-body">
              <p>
                Same app in your VPC when data cannot leave. Compose already exists for us internally. Packaged
                Helm, upgrades, and support are not a self-serve SKU yet.
              </p>
              <p>
                Need air-gap now?{" "}
                <a href="#demo">Book a demo</a> — we will not pretend a production self-host button is ready.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section id="demo" className="lp-demo">
        <div className="lp-demo-copy">
          <p className="lp-kicker">Live walkthrough</p>
          <h2 className="lp-h">Book a demo with {DEMO_NAME}</h2>
          <p>
            Pick a time on the calendar. 30 minutes on staging Redis: agent, health score, findings, and what
            data leaves your network.
          </p>
        </div>
        <CalendlyEmbed url={CALENDLY_URL} />
      </section>

      <section id="privacy">
        <h2 className="lp-h">What we collect</h2>
        <ul className="lp-list">
          <li>
            <strong>Yes:</strong> memory, ops/sec, clients, hit rate, evictions, version, slowlog command names and
            durations, sampled key names and sizes, TTL %.
          </li>
          <li>
            <strong>No:</strong> key values, command arguments, your Redis password (stays on the agent host).
          </li>
          <li>
            <strong>Not in V1:</strong> command latency P99 (hidden until we collect it for real).
          </li>
        </ul>
      </section>

      <section className="lp-not">
        <h2 className="lp-h">Not this product</h2>
        <p>Not RedisInsight. Not a query UI. Not a way to dump production. V1 is a closed pilot on staging Redis.</p>
      </section>

      <footer className="lp-foot">
        <span>Rediskey · V1 pilot</span>
        <a href="/app">{ctaLabel}</a>
      </footer>
    </div>
  );
}
