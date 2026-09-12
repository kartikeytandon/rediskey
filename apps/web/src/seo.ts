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

/**
 * Day 3 keyword map — one primary URL per query (no cannibalization).
 * Tier: A = own now, B = support, C = do not chase as primary.
 */
export type KeywordRow = {
  query: string;
  tier: "A" | "B" | "C";
  primaryPath: string;
  intent: string;
};

export const KEYWORD_MAP: KeywordRow[] = [
  { query: "why is redis slow", tier: "A", primaryPath: "/why-is-redis-slow", intent: "latency diagnosis" },
  { query: "redis high latency", tier: "A", primaryPath: "/why-is-redis-slow", intent: "latency diagnosis" },
  { query: "redis p99 high", tier: "A", primaryPath: "/why-is-redis-slow", intent: "latency diagnosis" },
  { query: "redis slow under load", tier: "A", primaryPath: "/why-is-redis-slow", intent: "latency diagnosis" },
  { query: "redis high memory", tier: "A", primaryPath: "/redis-high-memory", intent: "memory / eviction" },
  { query: "redis eviction", tier: "A", primaryPath: "/redis-high-memory", intent: "memory / eviction" },
  { query: "redis maxmemory", tier: "A", primaryPath: "/redis-high-memory", intent: "memory / eviction" },
  { query: "redis memory full", tier: "A", primaryPath: "/redis-high-memory", intent: "memory / eviction" },
  { query: "redis big keys", tier: "A", primaryPath: "/redis-big-keys", intent: "oversized keys" },
  { query: "redis large hash", tier: "A", primaryPath: "/redis-big-keys", intent: "oversized keys" },
  { query: "redis hgetall slow", tier: "A", primaryPath: "/redis-big-keys", intent: "oversized keys" },
  { query: "redis keys without ttl", tier: "A", primaryPath: "/redis-missing-ttl", intent: "TTL hygiene" },
  { query: "redis missing ttl", tier: "A", primaryPath: "/redis-missing-ttl", intent: "TTL hygiene" },
  { query: "volatile-lru no ttl", tier: "B", primaryPath: "/redis-missing-ttl", intent: "TTL hygiene" },
  { query: "redis monitor production", tier: "A", primaryPath: "/redis-monitor-dangerous", intent: "safe observability" },
  { query: "redis monitor performance", tier: "A", primaryPath: "/redis-monitor-dangerous", intent: "safe observability" },
  { query: "never use redis monitor", tier: "A", primaryPath: "/redis-monitor-dangerous", intent: "safe observability" },
  { query: "redis keys vs scan", tier: "A", primaryPath: "/redis-monitor-dangerous", intent: "safe commands" },
  { query: "redisinsight alternative", tier: "B", primaryPath: "/redis-vs-redisinsight", intent: "compare" },
  { query: "redis gui vs monitoring", tier: "B", primaryPath: "/redis-vs-redisinsight", intent: "compare" },
  { query: "redis cache hit rate low", tier: "B", primaryPath: "/redis-high-memory", intent: "eviction spiral" },
  { query: "redis mem_fragmentation_ratio", tier: "B", primaryPath: "/redis-high-memory", intent: "memory advanced" },
  { query: "elasticache enginecpuutilization", tier: "B", primaryPath: "/why-is-redis-slow", intent: "cloud latency" },
  { query: "elasticache evictions", tier: "B", primaryPath: "/redis-high-memory", intent: "cloud memory" },
  { query: "valkey monitoring", tier: "B", primaryPath: "/", intent: "brand / Valkey" },
  { query: "redis gui", tier: "C", primaryPath: "/redis-vs-redisinsight", intent: "avoid as primary" },
  { query: "redisinsight", tier: "C", primaryPath: "/redis-vs-redisinsight", intent: "avoid as primary" },
  { query: "redis tutorial", tier: "C", primaryPath: "/", intent: "avoid" },
  { query: "prometheus redis exporter", tier: "C", primaryPath: "/", intent: "avoid" },
];

export const HOME_SEO: SeoPage = {
  path: "/",
  title: "Baltan — Why is Redis slow? Diagnosis for Redis & Valkey",
  description:
    "Baltan explains Redis and Valkey health: big keys, missing TTLs, eviction, and slow commands — with a read-only agent. No MONITOR. Port 6379 never opens to the internet.",
  keywords:
    "why is Redis slow, Redis monitoring, Valkey observability, Redis big keys, Redis missing TTL, Redis eviction, Redis MONITOR, RedisInsight alternative",
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
    title: "Why Is Redis Slow? Fix High Latency & P99 | Baltan",
    description:
      "Why is Redis slow? High latency and P99 spikes usually come from memory pressure, big keys, KEYS-class commands, or missing TTLs — not “the network.” Diagnose safely without MONITOR.",
    keywords: "why is Redis slow, Redis high latency, Redis P99, Redis slowlog, Redis under load",
    type: "article",
    h1: "Why is Redis slow?",
    intro:
      "When Redis feels slow, the single-threaded event loop is usually blocked or thrashing — eviction under maxmemory, an oversized key, or an expensive command in SLOWLOG. Baltan ranks that cause from read-only telemetry so you can fix the right thing first.",
    sections: [
      {
        heading: "Redis high latency: the usual production causes",
        body: [
          "Memory near maxmemory triggers synchronous eviction on the write path. Latency climbs while evicted_keys and cache misses rise together — a memory pressure spiral.",
          "Large keys (hashes, lists, sorted sets) make a single HGETALL, SMEMBERS, or unbounded LRANGE stall every other client on that instance.",
          "KEYS, SORT, and hot slowlog commands dominate P99. Redis docs warn that KEYS in production is a common latency source — use SCAN instead.",
          "Missing TTLs under volatile-* policies leave Redis with no eviction candidates, so writes fail or thrash the wrong data.",
        ],
      },
      {
        heading: "What not to do when Redis is slow",
        body: [
          "Do not leave MONITOR running on a production primary — Redis must stream every command; official benchmarks show throughput can drop by more than 50%.",
          "Do not run KEYS * on a large keyspace. Prefer rate-limited SCAN and SLOWLOG / latency tooling.",
          "Do not open port 6379 to a SaaS GUI “just to look around” if you only need diagnosis. Prefer a private read-only sidecar.",
        ],
      },
      {
        heading: "How Baltan diagnoses “why is Redis slow?”",
        body: [
          "A Docker agent beside Redis samples INFO, MEMORY, SLOWLOG, clients, and bounded SCAN (names and sizes only — never values).",
          "You get an explainable health score, ranked findings, and a “Why is Redis slow?” answer that cites Baltan evidence only.",
          "Port 6379 stays private. Telemetry leaves over HTTPS; payloads and AUTH stay with you.",
        ],
      },
    ],
    related: [
      { href: "/redis-monitor-dangerous", label: "Why MONITOR is dangerous in production" },
      { href: "/redis-high-memory", label: "Redis high memory & eviction" },
      { href: "/redis-big-keys", label: "Redis big keys" },
      { href: "/redis-missing-ttl", label: "Missing TTLs" },
    ],
  },
  {
    path: "/redis-high-memory",
    title: "Redis High Memory & Eviction: Spot Thrashing Fast | Baltan",
    description:
      "Troubleshoot Redis high memory, maxmemory pressure, eviction thrashing, and falling cache hit rate. Baltan’s read-only agent surfaces the signals — no key values leave your network.",
    keywords:
      "Redis high memory, Redis eviction, redis maxmemory, redis memory full, cache hit rate, mem_fragmentation_ratio",
    type: "article",
    h1: "Redis high memory and eviction",
    intro:
      "High used_memory alone is not always an emergency — sustained evicted_keys with rising latency and falling hit rate is. That eviction thrashing pattern is one of the most common reasons production Redis “gets slow” under load.",
    sections: [
      {
        heading: "Redis memory full: signals that matter",
        body: [
          "used_memory vs maxmemory — how close you are to the ceiling (and whether policy is noeviction vs allkeys-*/volatile-*).",
          "evicted_keys rate — healthy cache turnover vs thrashing. Sample twice; the delta matters more than the absolute counter.",
          "keyspace hits vs misses — when misses rise with evictions, the app is rewriting what just got evicted.",
          "mem_fragmentation_ratio — RSS vs dataset; very high fragmentation or swap-like ratios need a different fix than “add more keys.”",
        ],
      },
      {
        heading: "Why eviction raises Redis latency",
        body: [
          "Eviction runs on the command path. Under write load near maxmemory, Redis spends CPU choosing victims instead of serving GETs.",
          "On ElastiCache / managed Redis, watch Evictions alongside EngineCPUUtilization and CacheHitRate — the same story shows up in CloudWatch.",
          "Missing TTLs and big keys are the usual reasons memory only goes up until the spiral starts.",
        ],
      },
      {
        heading: "How Baltan helps without dumping the dataset",
        body: [
          "Findings explain meaning and what to check next — not a raw INFO paste.",
          "Correlated views connect memory pressure to latency and expensive commands when they move together.",
          "The agent never opens Redis to Baltan’s cloud; it pushes sanitized metrics out over HTTPS.",
        ],
      },
    ],
    related: [
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-missing-ttl", label: "Missing TTLs" },
      { href: "/redis-big-keys", label: "Big keys" },
      { href: "/redis-monitor-dangerous", label: "Don’t use MONITOR" },
    ],
  },
  {
    path: "/redis-missing-ttl",
    title: "Redis Keys Without TTL: Memory Growth & volatile-lru | Baltan",
    description:
      "Redis keys without TTL drive unbounded memory growth. Under volatile-lru / volatile-ttl, missing expiries behave like noeviction. Baltan samples TTL coverage safely.",
    keywords: "Redis keys without TTL, Redis missing TTL, Redis no expiry, volatile-lru, Redis memory growth",
    type: "article",
    h1: "Redis keys without TTL",
    intro:
      "If session or cache keys never expire, memory climbs until eviction or OOM. With volatile-* maxmemory policies, keys without TTL are not eviction candidates — writes can fail even though Redis was “configured to evict.”",
    sections: [
      {
        heading: "Why missing TTLs hurt production Redis",
        body: [
          "Namespaces meant to be temporary (session:*, cache:*) grow without bound when writers forget EXPIRE / SET EX.",
          "volatile-lru and volatile-ttl only evict keys that already have an expiry — no TTL means the policy collapses toward noeviction behavior.",
          "Hit rate and latency suffer once eviction finally kicks in on the wrong keys or when OOM errors start rejecting writes.",
        ],
      },
      {
        heading: "How to find keys with no expiry safely",
        body: [
          "Prefer rate-limited SCAN + TTL checks over KEYS *. Baltan’s agent reports missing-TTL percentage and namespace patterns — never values.",
          "Pair TTL hygiene with maxmemory policy review: caches often want allkeys-lru; mixed stores need disciplined TTLs if you stay on volatile-*.",
          "Findings call out hygiene issues with a concrete action: add TTLs in writers, shorten lifetimes, or change policy.",
        ],
      },
      {
        heading: "Redis and Valkey",
        body: [
          "The same read-only agent model works for Redis and Valkey — memory pressure, TTLs, big keys, and slow commands.",
        ],
      },
    ],
    related: [
      { href: "/redis-high-memory", label: "High memory & eviction" },
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-big-keys", label: "Big keys" },
      { href: "/redis-vs-redisinsight", label: "Baltan vs RedisInsight" },
    ],
  },
  {
    path: "/redis-big-keys",
    title: "Redis Big Keys: Find Large Keys Without Reading Values | Baltan",
    description:
      "Redis big keys block the event loop and inflate memory. Find oversized hashes and collections with safe SCAN + MEMORY USAGE — Baltan never dumps values.",
    keywords: "Redis big keys, redis large hash, redis HGETALL slow, MEMORY USAGE, redis-cli --bigkeys",
    type: "article",
    h1: "Redis big keys",
    intro:
      "One oversized hash, list, or sorted set can dominate memory and turn a single HGETALL / SMEMBERS / unbounded LRANGE into a latency event for every client. Aggregate used_memory can look “fine” while P99 explodes.",
    sections: [
      {
        heading: "Why big keys cause Redis high latency",
        body: [
          "Command execution is single-threaded. An O(N) touch on a giant key queues everyone else behind it — even when PING still looks healthy.",
          "Replication and persistence cost scale with key size; big keys make failovers and rewrites more expensive.",
          "Splitting structures, paginating reads, or moving blobs out of Redis usually beats “just add RAM.”",
        ],
      },
      {
        heading: "How to find large Redis keys safely",
        body: [
          "redis-cli --bigkeys and MEMORY USAGE use incremental SCAN — still respect load. Baltan’s agent rate-limits SCAN and reports names and sizes only.",
          "Watch SLOWLOG for HGETALL, SMEMBERS, LRANGE 0 -1, SORT, and wide ZRANGE* — often the symptom of a big key, not a “slow network.”",
          "Never use MONITOR to hunt big keys in production; it streams every command and can cut throughput roughly in half.",
        ],
      },
      {
        heading: "What Baltan shows",
        body: [
          "Largest sampled keys by bytes, tied to findings when they correlate with latency or memory pressure.",
          "Dashboard actions tell you what to inspect in your app next — without browsing values inside Baltan.",
        ],
      },
    ],
    related: [
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-high-memory", label: "High memory" },
      { href: "/redis-monitor-dangerous", label: "Don’t use MONITOR" },
      { href: "/redis-vs-redisinsight", label: "vs RedisInsight" },
    ],
  },
  {
    path: "/redis-monitor-dangerous",
    title: "Don’t Use Redis MONITOR in Production (50% Hit) | Baltan",
    description:
      "Redis MONITOR can cut throughput by ~50% and streams command arguments. Use SLOWLOG, INFO, and a read-only agent instead — how Baltan observes Redis safely.",
    keywords:
      "Redis MONITOR production, Redis MONITOR performance, never use MONITOR, KEYS vs SCAN, Redis SLOWLOG",
    type: "article",
    h1: "Why you should not use MONITOR in production",
    intro:
      "MONITOR streams every command Redis runs to the connected client. It is useful for a few minutes of debugging — and dangerous as a standing production habit. Official Redis benchmarks show a single MONITOR client can reduce throughput by more than 50%.",
    sections: [
      {
        heading: "What MONITOR actually costs",
        body: [
          "Redis must format and send every command to MONITOR clients. Under load that competes with serving your app.",
          "Arguments are visible on the wire — sessions, tokens, and PII can leak into the MONITOR stream (AUTH is redacted; most other args are not).",
          "More MONITOR clients make the hit worse. Leaving it running overnight is a self-inflicted outage pattern.",
        ],
      },
      {
        heading: "Safer tools than MONITOR (and than KEYS *)",
        body: [
          "SLOWLOG — commands that exceeded your latency threshold, without streaming the whole workload.",
          "Latency monitoring / LATENCY DOCTOR — spike analysis with near-zero overhead when configured thoughtfully.",
          "INFO memory/stats + bounded SCAN / MEMORY USAGE — structure and size signals without dumping values.",
          "Replace KEYS with SCAN (and HSCAN / SSCAN / ZSCAN). KEYS is another classic production latency footgun called out in Redis docs.",
        ],
      },
      {
        heading: "How Baltan observes Redis instead",
        body: [
          "Baltan never runs MONITOR. The agent is a periodic read-only sidecar: INFO, SLOWLOG, CLIENT LIST, MEMORY, rate-limited SCAN.",
          "You get health, findings, and “Why is Redis slow?” from evidence — without opening 6379 to the internet and without reading key values.",
          "That is the observability posture Redis’s own docs push toward: targeted debugging tools, not a permanent command tap.",
        ],
      },
    ],
    related: [
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-big-keys", label: "Redis big keys" },
      { href: "/redis-high-memory", label: "High memory & eviction" },
      { href: "/redis-vs-redisinsight", label: "Baltan vs RedisInsight" },
    ],
  },
  {
    path: "/redis-vs-redisinsight",
    title: "Baltan vs RedisInsight: Diagnosis, Not a Redis GUI | Baltan",
    description:
      "Looking for a RedisInsight alternative? RedisInsight is a GUI for browsing keys. Baltan is production diagnosis — health, findings, why Redis is slow — with a private read-only agent.",
    keywords: "RedisInsight alternative, Redis GUI vs monitoring, Redis diagnosis tool, Baltan vs RedisInsight",
    type: "article",
    h1: "Baltan vs RedisInsight",
    intro:
      "Teams searching for a “Redis GUI” often need something else: a clear answer when production Redis is slow or full. RedisInsight and Baltan solve different jobs — use the right one.",
    sections: [
      {
        heading: "RedisInsight: interactive GUI",
        body: [
          "Browse keys, run commands, inspect slowlog, and develop against Redis visually.",
          "Best for local/staging exploration and hands-on debugging when opening a client to Redis is acceptable.",
        ],
      },
      {
        heading: "Baltan: ongoing diagnosis",
        body: [
          "Continuously scores health, opens findings (TTL, big keys, slow commands, eviction), and explains latency from evidence.",
          "Never needs Redis exposed to Baltan’s cloud — a sidecar pushes sanitized telemetry out.",
          "Does not replace a GUI for CRUD on keys; it replaces “stare at INFO until the incident is over.”",
        ],
      },
      {
        heading: "When to use which",
        body: [
          "Use RedisInsight (or similar) when you are developing or inspecting a safe environment interactively.",
          "Use Baltan when you need production diagnosis, Slack alerts, and “why is Redis slow?” without browsing values.",
          "Many teams use both — GUI for development, Baltan for production truth.",
        ],
      },
    ],
    related: [
      { href: "/why-is-redis-slow", label: "Why is Redis slow?" },
      { href: "/redis-monitor-dangerous", label: "Don’t use MONITOR" },
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

/** Footer / nav / homepage guide grid (stable order). */
export const GUIDE_NAV = [
  {
    href: "/why-is-redis-slow",
    label: "Why is Redis slow?",
    title: "Why is Redis slow?",
    blurb: "Rank latency from memory, slowlog, and big keys.",
  },
  {
    href: "/redis-high-memory",
    label: "High memory",
    title: "High memory & eviction",
    blurb: "Catch maxmemory pressure before thrashing wins.",
  },
  {
    href: "/redis-missing-ttl",
    label: "Missing TTL",
    title: "Missing TTLs",
    blurb: "Find namespaces that never expire.",
  },
  {
    href: "/redis-big-keys",
    label: "Big keys",
    title: "Big keys",
    blurb: "Sizes and names only — never values.",
  },
  {
    href: "/redis-monitor-dangerous",
    label: "Don’t use MONITOR",
    title: "Don’t use MONITOR",
    blurb: "Why MONITOR can cut throughput ~50% — and what to use instead.",
  },
  {
    href: "/redis-vs-redisinsight",
    label: "vs RedisInsight",
    title: "vs RedisInsight",
    blurb: "Diagnosis product, not a key browser.",
  },
] as const;
