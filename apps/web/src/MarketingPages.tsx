import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { SeoHead, breadcrumbJsonLd, articleJsonLd } from "./SeoHead";
import { LEGAL_PAGES, type ProblemPage } from "./seo";

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
          <a href="/why-is-redis-slow">Why is Redis slow?</a>
          <a href="/redis-high-memory">High memory</a>
          <a href="/redis-missing-ttl">Missing TTL</a>
          <a href="/redis-big-keys">Big keys</a>
          <a href="/redis-vs-redisinsight">vs RedisInsight</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
        <span>baltan · closed pilot</span>
      </footer>
    </div>
  );
}

export function ProblemGuide({ page }: { page: ProblemPage }) {
  return (
    <MarketingShell>
      <SeoHead
        page={page}
        jsonLd={[
          breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: page.h1, path: page.path },
          ]),
          articleJsonLd(page),
        ]}
      />
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
