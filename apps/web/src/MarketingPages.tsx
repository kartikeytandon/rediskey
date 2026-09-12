import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { SeoHead, breadcrumbJsonLd, articleJsonLd, faqJsonLd } from "./SeoHead";
import { GUIDE_NAV, LEGAL_PAGES, SETUP_SEO, type ProblemPage } from "./seo";
import { AGENT_IMAGE, agentInstallCommands } from "./agentInstall";

function MarketingShell({
  children,
  cta = "/app",
}: {
  children: ReactNode;
  cta?: string;
}) {
  return (
    <div className="lp lp-sub">
      <div className="lp-atmosphere" aria-hidden="true" />
      <header className="lp-nav">
        <a className="lp-brand" href="/">
          <BrandMark />
        </a>
        <nav aria-label="Primary">
          <a href="/#flow">Flow</a>
          <a href="/why-is-redis-slow">Why slow?</a>
          <a href="/setup">Setup</a>
          <a href="/redis-monitor-dangerous">MONITOR</a>
          <a href="/#demo">Demo</a>
          <a className="lp-cta" href={cta}>
            Start a pilot
          </a>
        </nav>
      </header>
      <main className="lp-article">{children}</main>
      <footer className="lp-foot">
        <nav className="lp-foot-nav" aria-label="Footer">
          <a href="/">Home</a>
          {GUIDE_NAV.map((g) => (
            <a key={g.href} href={g.href}>
              {g.label}
            </a>
          ))}
          <a href="/privacy">Privacy</a>
          <a href="/setup">Setup</a>
          <a href="/terms">Terms</a>
        </nav>
        <span>baltan · closed pilot</span>
      </footer>
    </div>
  );
}

export function ProblemGuide({ page }: { page: ProblemPage }) {
  const jsonLd = [
    breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: page.h1, path: page.path },
    ]),
    articleJsonLd(page),
    ...(page.faqs?.length ? [faqJsonLd(page.faqs)] : []),
  ];
  return (
    <MarketingShell>
      <SeoHead page={page} jsonLd={jsonLd} />
      <nav className="lp-crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span aria-hidden="true">/</span>
        <span>{page.h1}</span>
      </nav>
      <p className="lp-eyebrow">Redis diagnosis</p>
      <h1>{page.h1}</h1>
      <p className="lp-article-lead">{page.intro}</p>
      {page.sections.map((s) => (
        <section key={s.heading}>
          <h2>{s.heading}</h2>
          {s.body.map((p) => (
            <p key={p.slice(0, 48)}>{p}</p>
          ))}
        </section>
      ))}
      {page.faqs?.length ? (
        <section className="lp-guide-faq" aria-labelledby="guide-faq-heading">
          <h2 id="guide-faq-heading">FAQ</h2>
          {page.faqs.map((f) => (
            <div key={f.q} className="lp-guide-faq-item">
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </section>
      ) : null}
      <aside className="lp-article-cta">
        <h2>See it on your staging Redis</h2>
        <p>Read-only agent, explainable health, ranked findings — port 6379 stays closed.</p>
        <div className="lp-actions">
          <a className="lp-cta lp-cta-lg" href="/app">
            Start a pilot
          </a>
          <a className="lp-ghost" href="/#demo">
            Book a demo
          </a>
        </div>
      </aside>
      <nav className="lp-related" aria-label="Related guides">
        <h2>Related</h2>
        <ul>
          {page.related.map((r) => (
            <li key={r.href}>
              <a href={r.href}>{r.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </MarketingShell>
  );
}

export function SetupPage() {
  const sample = agentInstallCommands({
    token: null,
    agentKey: "agt_<from-dashboard>",
    engine: "redis",
    ingestUrl: "https://baltan.xyz/api",
  });
  const acl = `ACL SETUSER baltan on >YOUR_AGENT_REDIS_PASSWORD ~* &* -@all +@read +info +slowlog +latency +memory +client +scan +ttl +ping`;
  const prodSafe = `docker run -d --name baltan-agent --restart unless-stopped \\
  -e AGENT_TOKEN='rk_...' \\
  -e REDIS_PASSWORD='...' \\
  ${AGENT_IMAGE} \\
  --addr redis.internal:6379 \\
  --engine redis \\
  --agent-id agt_... \\
  --ingest-url https://baltan.xyz/api \\
  --interval 30s \\
  --scan-limit 200 \\
  --scan-timeout 2s`;

  return (
    <MarketingShell>
      <SeoHead
        page={SETUP_SEO}
        jsonLd={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Setup", path: "/setup" },
        ])}
      />
      <nav className="lp-crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a>
        <span aria-hidden="true">/</span>
        <span>Setup</span>
      </nav>
      <p className="lp-eyebrow">Public docs</p>
      <h1>Install the Baltan agent</h1>
      <p className="lp-article-lead">
        Secure by design: a read-only Docker sidecar beside Redis. Port 6379 never opens to Baltan.
        No MONITOR. Key values never leave your network. Sign up only when you need an agent token.
      </p>

      <section>
        <h2>Security model</h2>
        <p>
          Baltan is built so diagnosis does not mean exposing Redis. The agent runs in your network,
          speaks Redis with a least-privilege ACL, and pushes sanitized telemetry out over HTTPS.
        </p>
        <p>
          <strong>Never sent:</strong> key values, command argument payloads, AUTH secrets, full
          dumps.
        </p>
        <p>
          <strong>Sent over HTTPS:</strong> memory, ops/sec, hit rate, slowlog command names, key
          names and sizes from rate-limited SCAN.
        </p>
      </section>

      <section>
        <h2>Start on staging</h2>
        <ol className="lp-setup-steps">
          <li>Create a Baltan account and add a Redis / Valkey database (closed pilot).</li>
          <li>
            Open <a href="/app/install">Install</a> in the app — copy the one-time agent token and
            agent-id.
          </li>
          <li>Point the agent at <strong>staging</strong> first. Watch logs before production.</li>
          <li>
            Prefer a read-only Redis ACL user. Use{" "}
            <code>--no-scan</code> or lower <code>--scan-limit</code> on large keyspaces until you
            are comfortable.
          </li>
        </ol>
      </section>

      <section>
        <h2>Docker run (template)</h2>
        <p>
          Replace the token and agent-id from your dashboard. Change{" "}
          <code>host.docker.internal:6379</code> to your Redis host:port. Image:{" "}
          <code>{AGENT_IMAGE}</code>.
        </p>
        <pre className="lp-setup-pre">{sample.run}</pre>
        <p>
          After signup, the same commands with your real token live at{" "}
          <a href="/app/install">/app/install</a>.
        </p>
      </section>

      <section>
        <h2>Safer production SCAN</h2>
        <p>Lower interval and SCAN caps on busy instances:</p>
        <pre className="lp-setup-pre">{prodSafe}</pre>
        <p>
          Metrics-only (no key names): add <code>--no-scan</code>. Env equivalents:{" "}
          <code>BALTAN_NO_SCAN</code>, <code>BALTAN_SCAN_LIMIT</code>,{" "}
          <code>BALTAN_SCAN_TIMEOUT</code>.
        </p>
      </section>

      <section>
        <h2>Read-only Redis ACL (Redis 6+)</h2>
        <p>Create a dedicated user — no write commands:</p>
        <pre className="lp-setup-pre">{acl}</pre>
        <p>
          Set <code>REDIS_PASSWORD</code> to that ACL password. Commands used: PING, INFO, SLOWLOG,
          CLIENT LIST, MEMORY, SCAN, TTL, latency stats — never GET / HGETALL on your data.
        </p>
      </section>

      <aside className="lp-article-cta">
        <h2>Ready for a token?</h2>
        <p>Setup stays public. The agent token is issued after you join the pilot.</p>
        <div className="lp-actions">
          <a className="lp-cta lp-cta-lg" href="/app">
            Start a pilot
          </a>
          <a className="lp-ghost" href="/#privacy">
            Security &amp; privacy
          </a>
        </div>
      </aside>
    </MarketingShell>
  );
}

export function PrivacyPage() {
  const page = LEGAL_PAGES.find((p) => p.path === "/privacy")!;
  return (
    <MarketingShell>
      <SeoHead
        page={page}
        jsonLd={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Privacy", path: "/privacy" },
        ])}
      />
      <p className="lp-eyebrow">Legal</p>
      <h1>Privacy Policy</h1>
      <p className="lp-article-lead">Last updated: September 12, 2026</p>
      <section>
        <h2>Who we are</h2>
        <p>
          Baltan (“we”) provides explainable Redis and Valkey diagnosis via a hosted dashboard and a
          customer-operated read-only agent. Contact: hello@baltan.xyz.
        </p>
      </section>
      <section>
        <h2>Account data</h2>
        <p>
          When you create an account we store your email, password hash (bcrypt), organization name,
          and session cookies needed to keep you signed in. We use this to operate the service and
          communicate about your pilot.
        </p>
      </section>
      <section>
        <h2>Redis telemetry</h2>
        <p>
          The Baltan agent runs in your environment. It collects operational metrics (for example
          memory, ops/sec, slowlog command names, key names and sizes from rate-limited SCAN).{" "}
          <strong>Key values, command argument payloads, and AUTH secrets are not collected</strong>{" "}
          and do not leave your network through Baltan.
        </p>
        <p>
          Telemetry is sent to Baltan over HTTPS using your agent token so we can compute health,
          findings, alerts, and diagnosis.
        </p>
      </section>
      <section>
        <h2>Optional integrations</h2>
        <p>
          If you configure Slack alerts or AI diagnosis (for example Gemini), relevant finding
          summaries or diagnosis context may be sent to those providers under your configuration.
        </p>
      </section>
      <section>
        <h2>Retention &amp; deletion</h2>
        <p>
          During the closed pilot we retain metrics and findings as needed to run the product. Contact
          us to request account or telemetry deletion.
        </p>
      </section>
      <section>
        <h2>Changes</h2>
        <p>We may update this policy; the date above will change when we do.</p>
      </section>
    </MarketingShell>
  );
}

export function TermsPage() {
  const page = LEGAL_PAGES.find((p) => p.path === "/terms")!;
  return (
    <MarketingShell>
      <SeoHead
        page={page}
        jsonLd={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Terms", path: "/terms" },
        ])}
      />
      <p className="lp-eyebrow">Legal</p>
      <h1>Terms of Service</h1>
      <p className="lp-article-lead">Last updated: September 12, 2026</p>
      <section>
        <h2>Pilot service</h2>
        <p>
          Baltan is offered as a closed pilot. Features may change. The service is provided “as is”
          without warranties of uninterrupted availability or fitness for a particular purpose.
        </p>
      </section>
      <section>
        <h2>Your responsibilities</h2>
        <p>
          You must only point the agent at Redis/Valkey instances you are authorized to monitor. You
          are responsible for running the agent with a least-privilege (read-only) ACL, protecting
          agent tokens, and using staging instances until you are comfortable with SCAN limits.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not abuse ingest APIs, attempt to extract other customers’ data, or use Baltan to
          violate law or third-party rights.
        </p>
      </section>
      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, Baltan is not liable for indirect, incidental, or
          consequential damages, or for decisions you make based on findings or AI/rules diagnosis.
          Always verify changes in your own environment.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions: hello@baltan.xyz. Related: <a href="/privacy">Privacy Policy</a>.
        </p>
      </section>
    </MarketingShell>
  );
}

export function NotFoundPage() {
  return (
    <MarketingShell>
      <SeoHead
        page={{
          path: "/404",
          title: "Page not found — Baltan",
          description: "That page does not exist on Baltan.",
          noindex: true,
        }}
      />
      <h1>Page not found</h1>
      <p className="lp-article-lead">
        Try the <a href="/">home page</a> or{" "}
        <a href="/why-is-redis-slow">Why is Redis slow?</a>
      </p>
    </MarketingShell>
  );
}
