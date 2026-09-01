import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { BrandMark } from "./BrandMark";
import { CalendlyEmbed } from "./CalendlyEmbed";
import { HeroStage } from "./landing/HeroStage";

const prefix = "/api";

const CALENDLY_URL =
  import.meta.env.VITE_CALENDLY_URL ?? "https://calendly.com/tandonkartikey11/30min";
const DEMO_NAME = "Kartikey";

const KEYWORDS = ["big keys", "missing TTLs", "KEYS in slowlog"];

const FLOW = [
  { k: "01", title: "Redis stays closed", body: "Port 6379 never opens to Baltan." },
  { k: "02", title: "Agent reads out", body: "INFO · SLOWLOG · names & sizes — no values." },
  { k: "03", title: "Findings land", body: "Health you can explain. Actions you can take." },
];

const LEAVES = ["memory", "ops/sec", "hit rate", "slowlog names", "key sizes", "P99"];
const STAYS = ["key values", "command args", "AUTH", "full dumps"];

function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [activeFinding, setActiveFinding] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    void fetch(`${prefix}/v1/auth/me`, { credentials: "include" }).then((r) => {
      setSignedIn(r.ok);
    });
  }, []);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setActiveFinding((n) => (n + 1) % 3);
    }, 3200);
    return () => window.clearInterval(id);
  }, [reduce]);

  const cta = "/app";
  const ctaLabel = signedIn ? "Open dashboard" : "Start a pilot";

  const findings = [
    {
      sev: "high",
      title: "Missing TTL",
      meaning: "Keys never expire — memory grows until eviction or OOM.",
      action: "Set TTL on session:* and cache:* writers.",
    },
    {
      sev: "mid",
      title: "Big key",
      meaning: "One key dominates memory and blocks peers on access.",
      action: "Split cache:feed or move bulk blobs out of Redis.",
    },
    {
      sev: "high",
      title: "Expensive command",
      meaning: "KEYS / HGETALL showed up in slowlog — stalls the event loop.",
      action: "Replace KEYS with SCAN; prefer targeted hashes.",
    },
  ];

  return (
    <div className="lp">
      <div className="lp-atmosphere" aria-hidden="true" />

      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <BrandMark />
        </a>
        <nav>
          <a href="#flow">Flow</a>
          <a href="#proof">Proof</a>
          <a href="#privacy">Privacy</a>
          <a href="#demo">Demo</a>
          <a className="lp-cta" href={cta}>
            {ctaLabel}
          </a>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <motion.div
            className="lp-hero-brand"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <BrandMark size="lg" />
          </motion.div>

          <h1 className="lp-hero-title">
            {KEYWORDS.map((word, i) => (
              <motion.span
                key={word}
                className="lp-kw"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                {word}
                {i < KEYWORDS.length - 1 ? <span className="lp-kw-sep"> · </span> : null}
              </motion.span>
            ))}
          </h1>

          <motion.p
            className="lp-lead"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.45 }}
          >
            Explainable Redis / Valkey health — without opening it to the internet.
          </motion.p>

          <motion.div
            className="lp-actions"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.4 }}
          >
            <a className="lp-cta lp-cta-lg" href={cta}>
              {ctaLabel}
            </a>
            <a className="lp-ghost" href="#demo">
              Book a demo
            </a>
          </motion.div>
        </div>

        <HeroStage />
      </section>

      <FadeIn>
        <section className="lp-flow" id="flow">
          <p className="lp-eyebrow">How it works</p>
          <ol className="lp-flow-track">
            {FLOW.map((step, i) => (
              <li key={step.k}>
                <span className="lp-flow-k">{step.k}</span>
                <h2>{step.title}</h2>
                <p>{step.body}</p>
                {i < FLOW.length - 1 ? <span className="lp-flow-link" aria-hidden="true" /> : null}
              </li>
            ))}
          </ol>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="lp-proof" id="proof">
          <div className="lp-proof-head">
            <p className="lp-eyebrow">Live signals</p>
            <h2>Findings, not a CLI dump.</h2>
          </div>

          <div className="lp-proof-grid">
            <div className="lp-specimen lp-specimen-health" tabIndex={0}>
              <div className="lp-specimen-label">health</div>
              <div className="lp-score-row">
                <span className="lp-score">68</span>
                <span className="lp-score-unit">/ 100</span>
              </div>
              <ul className="lp-parts">
                <li>
                  <span>memory</span>
                  <b>54</b>
                  <i style={{ width: "54%" }} />
                </li>
                <li>
                  <span>hygiene</span>
                  <b>61</b>
                  <i style={{ width: "61%" }} />
                </li>
                <li>
                  <span>commands</span>
                  <b>48</b>
                  <i style={{ width: "48%" }} />
                </li>
              </ul>
            </div>

            <div className="lp-specimen lp-specimen-finding">
              <div className="lp-specimen-label">finding</div>
              <div className="lp-finding-tabs" role="tablist" aria-label="Sample findings">
                {findings.map((f, i) => (
                  <button
                    key={f.title}
                    type="button"
                    role="tab"
                    aria-selected={activeFinding === i}
                    className={activeFinding === i ? "on" : undefined}
                    onClick={() => setActiveFinding(i)}
                  >
                    {f.title}
                  </button>
                ))}
              </div>
              <article className={`lp-finding-body ${findings[activeFinding].sev}`}>
                <h3>{findings[activeFinding].title}</h3>
                <p>
                  <strong>Means</strong> {findings[activeFinding].meaning}
                </p>
                <p>
                  <strong>Check</strong> {findings[activeFinding].action}
                </p>
              </article>
            </div>
          </div>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="lp-privacy" id="privacy">
          <p className="lp-eyebrow">Privacy by design</p>
          <h2>Telemetry leaves. Payloads don’t.</h2>
          <div className="lp-privacy-split">
            <div className="lp-privacy-col leave">
              <h3>Leaves your network</h3>
              <ul>
                {LEAVES.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div className="lp-privacy-rule" aria-hidden="true">
              <span>HTTPS</span>
            </div>
            <div className="lp-privacy-col stay">
              <h3>Stays with you</h3>
              <ul>
                {STAYS.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="lp-privacy-foot">Not RedisInsight. Diagnosis — not a key browser.</p>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="lp-install-hint">
          <div>
            <p className="lp-eyebrow">Setup</p>
            <h2>One Docker agent beside Redis.</h2>
            <p>We host the dashboard. You run the sidecar. Token once — rotate anytime.</p>
          </div>
          <a className="lp-cta lp-cta-lg" href={signedIn ? "/app/install" : cta}>
            {signedIn ? "Open install" : "Get agent token"}
          </a>
        </section>
      </FadeIn>

      <FadeIn>
        <section className="lp-demo" id="demo">
          <div className="lp-demo-copy">
            <p className="lp-eyebrow">Live walkthrough</p>
            <h2>Book 30 minutes with {DEMO_NAME}</h2>
            <p>Staging Redis: agent, health, findings, and what actually leaves your network.</p>
            <div className="lp-actions">
              <button type="button" className="lp-cta lp-cta-lg" onClick={() => setShowCal((v) => !v)}>
                {showCal ? "Hide calendar" : "Pick a time"}
              </button>
              <a className="lp-ghost" href={CALENDLY_URL} target="_blank" rel="noreferrer">
                Open Calendly
              </a>
            </div>
          </div>
          {showCal ? <CalendlyEmbed url={CALENDLY_URL} /> : null}
        </section>
      </FadeIn>

      <footer className="lp-foot">
        <span>baltan · closed pilot</span>
        <a href={cta}>{ctaLabel}</a>
      </footer>
    </div>
  );
}
