export type FindingSeverity = "high" | "warning" | "info";

export type Finding = {
  category: string;
  severity: FindingSeverity;
  title: string;
  evidence: Record<string, unknown>;
};

export type DiagnosisInput = {
  metrics: Record<string, number>;
  keyspace: {
    sampled: number;
    missingTtlPct: number;
    namespaces?: { prefix: string; count: number }[];
    bigKeys: { key: string; bytes: number }[];
  } | null;
  slowlog: { command: string; durationUs: number }[];
};

const EXPENSIVE = new Set(["HGETALL", "KEYS", "SMEMBERS", "EVAL", "EVALSHA"]);

export function evaluate(input: DiagnosisInput): Finding[] {
  const m = input.metrics;
  const findings: Finding[] = [];

  const used = m.used_memory;
  const max = m.maxmemory;
  const evicted = m.evicted_keys ?? 0;
  if (max > 0 && used / max >= 0.85) {
    findings.push({
      category: "memory_pressure",
      severity: evicted > 0 ? "high" : "warning",
      title: "Memory is near maxmemory",
      evidence: {
        used_memory: used,
        maxmemory: max,
        ratio: used / max,
        evicted_keys: evicted,
      },
    });
  }

  const ks = input.keyspace;
  if (ks && ks.sampled >= 5 && ks.missingTtlPct >= 50) {
    findings.push({
      category: "missing_ttl",
      severity: ks.missingTtlPct >= 80 ? "high" : "warning",
      title: "Most sampled keys have no TTL",
      evidence: {
        sampled: ks.sampled,
        missingTtlPct: ks.missingTtlPct,
        namespaces: ks.namespaces ?? [],
      },
    });
  }

  const big = (ks?.bigKeys ?? []).filter((k) => k.bytes >= 2048);
  if (big.length > 0) {
    findings.push({
      category: "big_keys",
      severity: big.some((k) => k.bytes >= 1_000_000) ? "high" : "warning",
      title: `${big.length} sampled key(s) are large`,
      evidence: { keys: big },
    });
  }

  const expensive = input.slowlog.filter((s) => EXPENSIVE.has(s.command.toUpperCase()));
  if (expensive.length > 0) {
    findings.push({
      category: "expensive_commands",
      severity: "warning",
      title: "Slowlog contains expensive commands",
      evidence: { commands: expensive.slice(0, 10) },
    });
  }

  const rejected = m.rejected_connections ?? 0;
  const clients = m.connected_clients ?? 0;
  if (rejected > 0 || clients >= 200) {
    findings.push({
      category: "connection_storm",
      severity: rejected > 0 ? "high" : "warning",
      title: "Unusual connection pressure",
      evidence: { rejected_connections: rejected, connected_clients: clients },
    });
  }

  const hits = m.keyspace_hits ?? 0;
  const misses = m.keyspace_misses ?? 0;
  const denom = hits + misses;
  if (denom >= 20 && hits / denom < 0.5) {
    findings.push({
      category: "cache_degradation",
      severity: "warning",
      title: "Cache hit rate is low",
      evidence: { hits, misses, hitRate: hits / denom },
    });
  }

  return findings;
}

export type ScorePart = {
  id: string;
  label: string;
  score: number;
  weight: number;
  why: string;
};

export type HealthScore = {
  total: number;
  parts: ScorePart[];
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function scoreHealth(input: DiagnosisInput): HealthScore {
  const m = input.metrics;
  const ks = input.keyspace;
  const parts: ScorePart[] = [];

  let memory = 100;
  let memoryWhy = "maxmemory unset; no eviction pressure";
  if ((m.maxmemory ?? 0) > 0 && m.used_memory != null) {
    const ratio = m.used_memory / m.maxmemory;
    memory = ratio < 0.7 ? 100 : clamp(100 - ((ratio - 0.7) / 0.3) * 100);
    memoryWhy = `used/maxmemory ${(ratio * 100).toFixed(0)}%`;
  }
  if ((m.evicted_keys ?? 0) > 0) {
    memory = Math.min(memory, 45);
    memoryWhy += `; evicted_keys=${m.evicted_keys}`;
  }
  parts.push({ id: "memory", label: "Memory", score: memory, weight: 0.2, why: memoryWhy });

  const expensive = input.slowlog.filter((s) => EXPENSIVE.has(s.command.toUpperCase()));
  const commands = expensive.length === 0 ? 100 : clamp(100 - expensive.length * 15);
  parts.push({
    id: "commands",
    label: "Commands",
    score: commands,
    weight: 0.15,
    why: expensive.length ? `${expensive.length} expensive slowlog entries` : "no expensive slowlog commands",
  });

  parts.push({
    id: "latency",
    label: "Latency",
    score: 100,
    weight: 0.1,
    why: "P99 not collected yet",
  });

  const hits = m.keyspace_hits ?? 0;
  const misses = m.keyspace_misses ?? 0;
  const denom = hits + misses;
  const cache = denom >= 20 ? clamp((hits / denom) * 100) : 100;
  parts.push({
    id: "cache",
    label: "Cache",
    score: cache,
    weight: 0.15,
    why: denom >= 20 ? `hit rate ${((hits / denom) * 100).toFixed(0)}%` : "not enough hits/misses to judge",
  });

  const rejected = m.rejected_connections ?? 0;
  const clients = m.connected_clients ?? 0;
  let connections = 100;
  let connWhy = `${clients} clients, 0 rejected`;
  if (rejected > 0) {
    connections = 35;
    connWhy = `${rejected} rejected connections`;
  } else if (clients >= 200) {
    connections = 60;
    connWhy = `${clients} connected clients`;
  }
  parts.push({ id: "connections", label: "Connections", score: connections, weight: 0.1, why: connWhy });

  parts.push({
    id: "replication",
    label: "Replication",
    score: 100,
    weight: 0.1,
    why: "no replica lag telemetry on this sample",
  });

  let hygiene = 100;
  let hyWhy = "not enough keys sampled";
  if (ks && ks.sampled >= 5) {
    hygiene = clamp(100 - ks.missingTtlPct);
    hyWhy = `${ks.missingTtlPct.toFixed(0)}% of sampled keys have no TTL`;
    const big = (ks.bigKeys ?? []).filter((k) => k.bytes >= 2048);
    if (big.length) {
      hygiene = Math.min(hygiene, 70);
      hyWhy += `; ${big.length} large key(s)`;
    }
  }
  parts.push({ id: "hygiene", label: "Data hygiene", score: hygiene, weight: 0.2, why: hyWhy });

  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  const total = clamp(parts.reduce((s, p) => s + p.score * p.weight, 0) / weightSum);
  return { total, parts };
}
