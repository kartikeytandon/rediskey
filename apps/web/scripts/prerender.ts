/**
 * Post-Vite prerender: write crawlable HTML shells for marketing routes.
 * Crawlers see real title/H1/body; the SPA still hydrates over #root.
 *
 * Run: npx tsx scripts/prerender.ts (after vite build)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HOME_SEO,
  LEGAL_PAGES,
  PROBLEM_PAGES,
  SITE_NAME,
  SITE_URL,
  type ProblemPage,
  type SeoPage,
} from "../src/seo";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "dist");
const publicDir = join(__dirname, "..", "public");
const LASTMOD = new Date().toISOString().slice(0, 10);

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function absoluteUrl(path: string): string {
  if (path === "/") return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function homeBody(): string {
  return `
<main>
  <p>${escapeHtml(SITE_NAME)}</p>
  <h1>${escapeHtml(HOME_SEO.title.split("—")[0]!.trim())} — Redis &amp; Valkey diagnosis</h1>
  <p>${escapeHtml(HOME_SEO.description)}</p>
  <p>Explainable health for big keys, missing TTLs, eviction, and slow commands — without opening port 6379.</p>
  <nav aria-label="Guides">
    <ul>
      ${PROBLEM_PAGES.map((p) => `<li><a href="${escapeHtml(p.path)}">${escapeHtml(p.h1)}</a></li>`).join("\n      ")}
      <li><a href="/privacy">Privacy</a></li>
      <li><a href="/terms">Terms</a></li>
      <li><a href="/app">Start a pilot</a></li>
    </ul>
  </nav>
</main>`;
}

function problemBody(page: ProblemPage): string {
  const sections = page.sections
    .map(
      (s) => `
  <section>
    <h2>${escapeHtml(s.heading)}</h2>
    ${s.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n    ")}
  </section>`,
    )
    .join("\n");
  const faqs =
    page.faqs?.length ?
      `
  <section>
    <h2>FAQ</h2>
    ${page.faqs
      .map(
        (f) => `<h3>${escapeHtml(f.q)}</h3>
    <p>${escapeHtml(f.a)}</p>`,
      )
      .join("\n    ")}
  </section>`
    : "";
  const related = page.related
    .map((r) => `<li><a href="${escapeHtml(r.href)}">${escapeHtml(r.label)}</a></li>`)
    .join("\n      ");
  return `
<main>
  <nav aria-label="Breadcrumb"><a href="/">Home</a> / ${escapeHtml(page.h1)}</nav>
  <h1>${escapeHtml(page.h1)}</h1>
  <p>${escapeHtml(page.intro)}</p>
  ${sections}
  ${faqs}
  <p><a href="/app">Start a pilot</a> · <a href="/#demo">Book a demo</a></p>
  <nav aria-label="Related"><ul>${related}</ul></nav>
</main>`;
}

function legalBody(page: SeoPage): string {
  const isPrivacy = page.path === "/privacy";
  if (isPrivacy) {
    return `
<main>
  <h1>Privacy Policy</h1>
  <p>${escapeHtml(page.description)}</p>
  <p>Baltan’s read-only agent collects operational metrics (memory, ops/sec, slowlog command names, key names and sizes). Key values, command argument payloads, and AUTH secrets do not leave your network through Baltan.</p>
  <p>Contact: hello@baltan.xyz</p>
</main>`;
  }
  return `
<main>
  <h1>Terms of Service</h1>
  <p>${escapeHtml(page.description)}</p>
  <p>Baltan is offered as a closed pilot. Use the agent only on Redis/Valkey instances you are authorized to monitor, with a read-only ACL when possible.</p>
  <p>Contact: hello@baltan.xyz · <a href="/privacy">Privacy Policy</a></p>
</main>`;
}

function articleJsonLd(page: ProblemPage): string {
  const nodes: Record<string, unknown>[] = [
    {
      "@type": "Article",
      headline: page.h1,
      description: page.description,
      mainEntityOfPage: absoluteUrl(page.path),
      author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
  ];
  if (page.faqs?.length) {
    nodes.push({
      "@type": "FAQPage",
      mainEntity: page.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": nodes,
  });
}

function patchHead(html: string, page: SeoPage, extraJsonLd?: string): string {
  const url = absoluteUrl(page.path);
  const ogType = page.type === "article" ? "article" : "website";
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
  );
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
  );
  out = out.replace(
    /<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:type" content="${ogType}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
  );
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`,
  );
  if (page.noindex) {
    out = out.replace(
      /<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/i,
      `<meta name="robots" content="noindex, nofollow" />`,
    );
  }
  if (extraJsonLd) {
    out = out.replace(
      "</head>",
      `    <script type="application/ld+json">${extraJsonLd}</script>\n  </head>`,
    );
  }
  return out;
}

function injectRoot(html: string, body: string): string {
  return html.replace(/<div id="root"><\/div>/i, `<div id="root">${body}</div>`);
}

function writeRoute(relPath: string, html: string): void {
  const file =
    relPath === "/" ? join(distDir, "index.html") : join(distDir, relPath.replace(/^\//, ""), "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, "utf8");
  console.log(`prerender: ${relPath === "/" ? "/index.html" : `${relPath}/index.html`}`);
}

function buildSitemapXml(): string {
  const urls: { path: string; priority: string; changefreq: string }[] = [
    { path: "/", priority: "1.0", changefreq: "weekly" },
    ...PROBLEM_PAGES.map((p) => ({
      path: p.path,
      priority: p.path === "/why-is-redis-slow" ? "0.9" : "0.8",
      changefreq: "monthly",
    })),
    ...LEGAL_PAGES.map((p) => ({ path: p.path, priority: "0.3", changefreq: "yearly" })),
  ];
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${absoluteUrl(u.path)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function main(): void {
  const templatePath = join(distDir, "index.html");
  if (!existsSync(templatePath)) {
    throw new Error(`Missing ${templatePath} — run vite build first`);
  }
  const template = readFileSync(templatePath, "utf8");

  writeRoute("/", injectRoot(patchHead(template, HOME_SEO), homeBody()));

  for (const page of PROBLEM_PAGES) {
    writeRoute(
      page.path,
      injectRoot(patchHead(template, page, articleJsonLd(page)), problemBody(page)),
    );
  }

  for (const page of LEGAL_PAGES) {
    writeRoute(page.path, injectRoot(patchHead(template, page), legalBody(page)));
  }

  const sitemap = buildSitemapXml();
  writeFileSync(join(distDir, "sitemap.xml"), sitemap, "utf8");
  writeFileSync(join(publicDir, "sitemap.xml"), sitemap, "utf8");
  console.log(`prerender: sitemap.xml (${LASTMOD}) → dist + public`);
}

main();
