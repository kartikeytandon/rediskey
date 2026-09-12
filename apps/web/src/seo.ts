/** Canonical site origin — set VITE_SITE_URL in production builds. */
function readSiteUrl(): string {
  const fromVite =
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    typeof import.meta.env.VITE_SITE_URL === "string"
      ? import.meta.env.VITE_SITE_URL.trim()
      : "";
  const fromNode =
    typeof process !== "undefined" && typeof process.env?.VITE_SITE_URL === "string"
      ? process.env.VITE_SITE_URL.trim()
      : "";
  return (fromVite || fromNode || "https://baltan.xyz").replace(/\/$/, "");
}

export const SITE_URL = readSiteUrl();

export const SITE_NAME = "Baltan";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/brand/baltan-logo-dark-bg-2x.png`;

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  /** comma-separated keywords for meta (supporting signal only) */
  keywords?: string;
  noindex?: boolean;
  type?: "website" | "article";
};

export const HOME_SEO: SeoPage = {
  path: "/",
  title: "Baltan — Why is Redis slow? Diagnosis for Redis & Valkey",
  description:
    "Baltan explains Redis and Valkey health: big keys, missing TTLs, eviction, and slow commands — with a read-only agent. Port 6379 never opens to the internet.",
  keywords:
    "Redis monitoring, Valkey observability, why is Redis slow, Redis big keys, Redis missing TTL, Redis eviction, Redis diagnosis, RedisInsight alternative",
};

export const APP_SEO: SeoPage = {
  path: "/app",
  title: "Dashboard — Baltan",
  description: "Sign in to your Baltan Redis / Valkey dashboard.",
  noindex: true,
};

export type ProblemPage = SeoPage & {
  h1: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
  related: { href: string; label: string }[];
};

export const PROBLEM_PAGES: ProblemPage[] = [
  {
    path: "/why-is-redis-slow",
    title: "Why is Redis slow? Diagnose latency without opening 6379 | Baltan",
    description:
      "Redis latency usually comes from memory pressure, big keys, expensive commands, or missing TTLs. Baltan ranks the cause from safe telemetry — not a key browser.",
    keywords: "why is Redis slow, Redis latency, Redis P99, Redis slowlog",
    type: "article",
    h1: "Why is Redis slow?",
    intro:
      "When Redis feels slow, the event loop is usually blocked or thrashing — not “the network.” Baltan is built for that question: evidence-only diagnosis from a read-only agent beside your instance.",
    sections: [
      {
        heading: "What usually causes Redis latency",
        body: [
          "Memory near maxmemory triggers synchronous eviction on the write path, which raises command latency and can start an eviction–miss–rewrite spiral.",
          "Large keys (big hashes, lists, or strings) make single commands expensive and stall peers sharing the same single-threaded process.",
          "Commands like KEYS, large HGETALL, or hot GET patterns show up in SLOWLOG and dominate P99.",
          "Keys without TTLs grow forever under volatile-* policies — Redis runs out of eviction candidates and either rejects writes or thrash-evicts the wrong data.",
        ],
      },
      {
        heading: "How Baltan answers the question",
        body: [
          "A Docker sidecar samples INFO, MEMORY, SLOWLOG, clients, and rate-limited SCAN (names and sizes only — never values).",
          "You get an explainable health score, ranked findings, and a “Why is Redis slow?” diagnosis that cites Baltan evidence only.",
          "Port 6379 stays private. Telemetry leaves over HTTPS; payloads and AUTH stay with you.",
        ],
      },
    ],
    related: [
      { href: "/redis-high-memory", label: "Redis high memory & eviction" },
      { href: "/redis-big-keys", label: "Redis big keys" },
      { href: "/redis-missing-ttl", label: "Missing TTLs" },
    ],
  },
  {
    path: "/redis-high-memory",
    title: "Redis high memory & eviction: find the cause fast | Baltan",
    description:
      "Troubleshoot Redis high memory, maxmemory pressure, and eviction thrashing with Baltan’s read-only agent — no key values leave your network.",
    keywords: "Redis high memory, Redis eviction, maxmemory, used_memory, mem_fragmentation",
    type: "article",
    h1: "Redis high memory and eviction",
    intro:
      "High used_memory is not always a crisis — sustained evicted_keys with rising latency is. Baltan surfaces memory pressure, fragmentation, and eviction alongside the commands and keys that make it worse.",
    sections: [
      {
        heading: "Signals that matter",
        body: [
          "used_memory vs maxmemory percentage — how close you are to the ceiling.",
          "evicted_keys rate — thrashing vs healthy cache turnover.",
          "Fragmentation ratio — RSS vs dataset when the OS sees more RAM than Redis “needs.”",
          "Missing TTLs and big keys — the usual reasons memory only goes up.",
        ],
      },
      {
        heading: "What Baltan does differently",
        body: [
          "Findings explain meaning and what to check next — not a raw INFO paste.",
          "Correlated views connect memory pressure to latency and expensive commands when they move together.",
          "You never open Redis to Baltan’s cloud; the agent pushes sanitized metrics out.",
        ],
      },
    ],
    related: [
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-missing-ttl", label: "Missing TTLs" },
      { href: "/redis-big-keys", label: "Big keys" },
    ],
  },
  {
    path: "/redis-missing-ttl",
    title: "Redis keys without TTL: memory growth explained | Baltan",
    description:
      "Missing TTLs are a top cause of Redis memory growth and failed volatile eviction. Baltan samples TTL coverage safely and tells you what to fix.",
    keywords: "Redis missing TTL, Redis no expiry, Redis memory growth, volatile-lru",
    type: "article",
    h1: "Redis keys without TTL",
    intro:
      "If session or cache keys never expire, memory climbs until eviction or OOM. Under volatile-* policies, keys without TTL are not eviction candidates — writes can fail even though the instance “should” reclaim space.",
    sections: [
      {
        heading: "Why missing TTLs hurt",
        body: [
          "Unbounded growth on namespaces that were meant to be temporary.",
          "volatile-lru / volatile-ttl behave like noeviction when nothing has an expiry.",
          "Hit rate and latency suffer once eviction finally kicks in on the wrong keys.",
        ],
      },
      {
        heading: "How Baltan helps",
        body: [
          "Rate-limited SCAN reports missing-TTL percentage and namespace patterns — never values.",
          "Findings call out hygiene issues with a concrete action (add TTL, change writers, adjust policy).",
          "Works for Redis and Valkey with the same read-only agent model.",
        ],
      },
    ],
    related: [
      { href: "/redis-high-memory", label: "High memory & eviction" },
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-vs-redisinsight", label: "Baltan vs RedisInsight" },
    ],
  },
  {
    path: "/redis-big-keys",
    title: "Redis big keys: find oversized keys without dumping values | Baltan",
    description:
      "Oversized Redis keys block the event loop and inflate memory. Baltan finds big-key sizes with a safe SCAN — never reads values.",
    keywords: "Redis big keys, large Redis key, Redis MEMORY USAGE, Redis hot key",
    type: "article",
    h1: "Redis big keys",
    intro:
      "One oversized hash or string can dominate memory and turn a single GET/HGETALL into a latency event for every client on that instance. Baltan ranks largest sampled keys by size — names and bytes only.",
    sections: [
      {
        heading: "Why big keys matter",
        body: [
          "Single-threaded Redis means one expensive key access delays everyone.",
          "Replication and persistence cost scales with key size.",
          "Splitting or moving blobs often beats “just add RAM.”",
        ],
      },
      {
        heading: "Safe sampling with Baltan",
        body: [
          "The agent uses rate-limited SCAN and size estimates — no DUMP, no value reads.",
          "Findings connect big keys to slowlog and latency when they correlate.",
          "Dashboard actions tell you what to inspect next in your app, not inside Baltan.",
        ],
      },
    ],
    related: [
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-high-memory", label: "High memory" },
      { href: "/redis-vs-redisinsight", label: "vs RedisInsight" },
    ],
  },
  {
    path: "/redis-vs-redisinsight",
    title: "Baltan vs RedisInsight: diagnosis, not a Redis GUI | Baltan",
    description:
      "RedisInsight is a GUI for browsing Redis. Baltan is explainable diagnosis with a private read-only agent — health, findings, and why Redis is slow.",
    keywords: "RedisInsight alternative, Redis GUI vs monitoring, Redis diagnosis tool",
    type: "article",
    h1: "Baltan vs RedisInsight",
    intro:
      "Teams searching for a “Redis GUI” often need something else: a clear answer when production Redis is slow or full. Baltan is built for that gap.",
    sections: [
      {
        heading: "Different jobs",
        body: [
          "RedisInsight helps you explore keys and run commands in a visual client.",
          "Baltan continuously scores health, opens findings (TTL, big keys, slow commands, eviction), and explains latency from evidence.",
          "Baltan never needs Redis exposed to the public internet — a sidecar pushes sanitized telemetry out.",
        ],
      },
      {
        heading: "When to use which",
        body: [
          "Use a GUI when you are developing or inspecting a safe environment interactively.",
          "Use Baltan when you need ongoing production diagnosis, Slack alerts, and “why is Redis slow?” without browsing values.",
          "Many teams use both — they solve different problems.",
        ],
      },
    ],
    related: [
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/#privacy", label: "Privacy model" },
      { href: "/#demo", label: "Book a demo" },
    ],
  },
];

export const LEGAL_PAGES: SeoPage[] = [
  {
    path: "/privacy",
    title: "Privacy Policy — Baltan",
    description:
      "How Baltan handles account data and Redis telemetry. Key values never leave your network; the agent sends sanitized metrics only.",
  },
  {
    path: "/terms",
    title: "Terms of Service — Baltan",
    description:
      "Terms for using Baltan’s closed pilot and hosted Redis / Valkey diagnosis service.",
  },
];

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function findProblemPage(path: string): ProblemPage | undefined {
  return PROBLEM_PAGES.find((p) => p.path === path);
}
