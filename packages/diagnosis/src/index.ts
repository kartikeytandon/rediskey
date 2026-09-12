import { finding } from "./finding-copy.js";
import { inferWorkload, workloadLabel, type WorkloadKind } from "./workload.js";

export type FindingSeverity = "high" | "warning" | "info";

export type Finding = {
  category: string;
  severity: FindingSeverity;
  title: string;
  meaning: string;
  action: string;
  evidence: Record<string, unknown>;
};

export type CommandStat = {
  command: string;
  calls: number;
  usec: number;
  usecPerCall: number;
};

export type SlowlogShare = {
  command: string;
  count: number;
  sharePct: number;
  totalDurationUs: number;
};

export type HotKeyHint = {
  key: string;
  bytes: number;
  idleSeconds?: number;
  freq?: number;
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
  commandPicture?: {
    topCommands: CommandStat[];
    slowlogShares: SlowlogShare[];
    hotKeys: HotKeyHint[];
  } | null;
};

export { inferWorkload, workloadLabel, type WorkloadKind };

const EXPENSIVE = new Set(["HGETALL", "KEYS", "SMEMBERS", "EVAL", "EVALSHA"]);

function withWorkload(evidence: Record<string, unknown>, workload: WorkloadKind): Record<string, unknown> {
  return { workload, workloadLabel: workloadLabel(workload), ...evidence };
}

export function evaluate(input: DiagnosisInput): Finding[] {
  const m = input.metrics;
  const workload = inferWorkload(input);
  const findings: Finding[] = [];

  const used = m.used_memory;
  const max = m.maxmemory;
  const evicted = m.evicted_keys ?? 0;
  if (max > 0 && used / max >= 0.85) {
    findings.push(
      finding(
        "memory_pressure",
        evicted > 0 ? "high" : "warning",
        "Memory is near maxmemory",
        `Redis is using ${((used / max) * 100).toFixed(0)}% of maxmemory${evicted > 0 ? " and keys are being evicted" : ""}.`,
        evicted > 0
          ? "Raise maxmemory, shorten TTLs, or trim large keys before evictions hurt hit rate."
          : "Plan headroom: review largest keys and eviction policy before writes start failing.",
        withWorkload({ used_memory: used, maxmemory: max, ratio: used / max, evicted_keys: evicted }, workload),
      ),
    );
  }

  const frag = m.mem_fragmentation_ratio;
  const rss = m.used_memory_rss;
  if (frag != null && frag >= 1.5 && (rss ?? 0) >= 5_000_000) {
    findings.push(
      finding(
        "memory_fragmentation",
        frag >= 2.5 ? "high" : "warning",
        `Memory fragmentation ratio is ${frag.toFixed(2)}`,
        "RSS is much higher than allocated memory — often fragmentation or copy-on-write after a fork.",
        "Check persistence fork load, consider restart in a maintenance window if ratio stays high.",
        withWorkload(
          { mem_fragmentation_ratio: frag, used_memory_rss: rss, used_memory: used },
          workload,
        ),
      ),
    );
  }

  const ks = input.keyspace;
  if (ks && ks.sampled >= 5 && ks.missingTtlPct >= 50) {
    const brokerNote =
      workload === "broker"
        ? "Queues often omit TTL — confirm retention and dead-letter handling instead."
        : "Add TTLs to cache/session keys or use explicit eviction policies.";
    findings.push(
      finding(
        "missing_ttl",
        ks.missingTtlPct >= 80 ? "high" : "warning",
        "Most sampled keys have no TTL",
        `${ks.missingTtlPct.toFixed(0)}% of sampled keys never expire — memory can grow without bound.`,
        brokerNote,
        withWorkload(
          { sampled: ks.sampled, missingTtlPct: ks.missingTtlPct, namespaces: ks.namespaces ?? [] },
          workload,
        ),
      ),
    );
  }

  const big = (ks?.bigKeys ?? []).filter((k) => k.bytes >= 2048);
  if (big.length > 0) {
    findings.push(
      finding(
        "big_keys",
        big.some((k) => k.bytes >= 1_000_000) ? "high" : "warning",
        `${big.length} sampled key(s) are large`,
        "Large keys increase latency, block replication, and make eviction expensive.",
        "Inspect listed keys: split hashes/lists, paginate HGETALL users, or move blobs out of Redis.",
        withWorkload({ keys: big }, workload),
      ),
    );
  }

  const picture = input.commandPicture;
  const slowShares = picture?.slowlogShares ?? [];
  if (slowShares.length > 0) {
    const top = slowShares[0];
    const expensive = EXPENSIVE.has(top.command);
    if (top.sharePct >= 40 || expensive) {
      findings.push(
        finding(
          "expensive_commands",
          top.sharePct >= 70 || expensive ? "high" : "warning",
          `${top.command} is ${top.sharePct.toFixed(0)}% of slowlog entries`,
          `Slow commands dominate the slowlog — clients wait on ${top.command} more than anything else.`,
          expensive
            ? `Replace ${top.command} with bounded reads (HSCAN, smaller pages) or denormalize hot fields.`
            : "Profile callers of this command and add indexes, smaller payloads, or caching.",
          withWorkload({ top: slowShares.slice(0, 5), slowlogEntries: input.slowlog.length }, workload),
        ),
      );
    }
  } else {
    const expensive = input.slowlog.filter((s) => EXPENSIVE.has(s.command.toUpperCase()));
    if (expensive.length > 0) {
      findings.push(
        finding(
          "expensive_commands",
          "warning",
          "Slowlog contains expensive commands",
          "Full scans or bulk reads appeared in the slowlog — they block the single Redis thread.",
          "Find app code paths using KEYS, HGETALL, or SMEMBERS on large collections.",
          withWorkload({ commands: expensive.slice(0, 10) }, workload),
        ),
      );
    }
  }

  const topCommands = picture?.topCommands ?? [];
  if (topCommands.length >= 2) {
    const totalCalls = topCommands.reduce((s, c) => s + c.calls, 0);
    if (totalCalls > 0) {
      const top = topCommands[0];
      const share = (top.calls / totalCalls) * 100;
      if (share >= 45) {
        findings.push(
          finding(
            "command_concentration",
            share >= 70 ? "warning" : "info",
            `${top.command} is ${share.toFixed(0)}% of tracked command calls`,
            "One command type accounts for most traffic — a hotspot or a very narrow workload.",
            "Confirm this matches expectations; if not, trace which client or job issues those calls.",
            withWorkload({ topCommands: topCommands.slice(0, 6), sharePct: share }, workload),
          ),
        );
      }
    }
  }

  const hotKeys = (picture?.hotKeys ?? []).filter(
    (k) => (k.freq ?? 0) > 0 || (k.idleSeconds != null && k.idleSeconds >= 0 && k.idleSeconds < 300),
  );
  if (hotKeys.length > 0) {
    findings.push(
      finding(
        "hot_key_candidates",
        hotKeys.some((k) => k.bytes >= 1_000_000) ? "warning" : "info",
        `${hotKeys.length} hot or recently active key candidate(s)`,
        "These keys were large and recently touched — likely latency or memory hotspots.",
        "Check access patterns on listed keys; shard, cache locally, or split hot structures.",
        withWorkload({ keys: hotKeys.slice(0, 8) }, workload),
      ),
    );
  }

  const rejected = m.rejected_connections ?? 0;
  const clients = m.connected_clients ?? 0;
  if (rejected > 0 || clients >= 200) {
    findings.push(
      finding(
        "connection_storm",
        rejected > 0 ? "high" : "warning",
        "Unusual connection pressure",
        rejected > 0
          ? "Redis rejected new connections — clients may be retrying in a tight loop."
          : `${clients} connected clients is high for a single instance.`,
        "Use connection pooling, fix reconnect storms, and check maxclients vs app instance count.",
        withWorkload({ rejected_connections: rejected, connected_clients: clients }, workload),
      ),
    );
  }

  const hits = m.keyspace_hits ?? 0;
  const misses = m.keyspace_misses ?? 0;
  const denom = hits + misses;
  const hitRate = denom > 0 ? hits / denom : 1;
  const cacheLike = workload === "cache" || (workload === "unknown" && denom >= 100);
  if (cacheLike && denom >= 20 && hitRate < 0.5) {
    findings.push(
      finding(
        "cache_degradation",
        "warning",
        "Cache hit rate is low",
        `Hit rate is ${(hitRate * 100).toFixed(0)}% — most reads miss the cache.`,
        "Check TTLs, warming, key churn, and whether the working set fits in memory.",
        withWorkload({ hits, misses, hitRate }, workload),
      ),
    );
  }

  // Day 12: correlate latency with expensive work / large or hot keys
  const p99 = m.command_latency_p99_ms;
  const expensiveSignal =
    (slowShares[0] != null &&
      (slowShares[0].sharePct >= 40 || EXPENSIVE.has(slowShares[0].command))) ||
    input.slowlog.some((s) => EXPENSIVE.has(s.command.toUpperCase()));
  const bigSignal = big.some((k) => k.bytes >= 10_000);
  const hotSignal = hotKeys.length > 0;
  if (p99 != null && p99 >= 5 && (expensiveSignal || bigSignal || hotSignal)) {
    const signals: string[] = [];
    if (expensiveSignal) signals.push("expensive_commands");
    if (bigSignal) signals.push("big_keys");
    if (hotSignal) signals.push("hot_keys");
    findings.push(
      finding(
        "correlated_latency",
        p99 >= 20 || (expensiveSignal && bigSignal) ? "high" : "warning",
        "Latency lines up with heavy commands or large keys",
        `P99 is ${p99.toFixed(1)} ms while ${signals.join(" + ")} are also elevated — likely one root cause, not separate issues.`,
        "Start with the largest key and top slowlog command; fix those before tuning Redis itself.",
        withWorkload(
          {
            p99Ms: p99,
            signals,
            topSlowCommand: slowShares[0]?.command ?? null,
            largestKeyBytes: big[0]?.bytes ?? null,
          },
          workload,
        ),
      ),
    );
  }

  // Memory rising under load with no TTLs — growth, not a one-off spike
  const ops = m.instantaneous_ops_per_sec ?? 0;
  const memRatio = max > 0 && used != null ? used / max : 0;
  if (
    ks &&
    ks.sampled >= 5 &&
    ks.missingTtlPct >= 50 &&
    ops >= 50 &&
    (memRatio >= 0.7 || (m.used_memory ?? 0) >= 50_000_000)
  ) {
    findings.push(
      finding(
        "correlated_growth",
        memRatio >= 0.85 || evicted > 0 ? "high" : "warning",
        "Load + missing TTLs point to unbounded growth",
        `Ops are ${ops}/s while ${ks.missingTtlPct.toFixed(0)}% of sampled keys lack TTL${
          memRatio > 0 ? ` and memory is at ${(memRatio * 100).toFixed(0)}% of max` : ""
        }.`,
        "Add TTLs or size caps on write paths; otherwise memory will keep climbing with traffic.",
        withWorkload(
          {
            signals: ["ops", "missing_ttl", memRatio > 0 ? "memory" : "used_memory"],
            opsPerSec: ops,
            missingTtlPct: ks.missingTtlPct,
            memoryRatio: memRatio || null,
            used_memory: used,
          },
          workload,
        ),
      ),
    );
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

function scoreLatency(p99Ms: number | undefined): { score: number; weight: number; why: string } {
  if (p99Ms == null || Number.isNaN(p99Ms) || p99Ms < 0) {
    return { score: 0, weight: 0, why: "command latency p99 not collected" };
  }
  let score: number;
  if (p99Ms <= 1) score = 100;
  else if (p99Ms <= 5) score = clamp(100 - ((p99Ms - 1) / 4) * 25);
  else if (p99Ms <= 20) score = clamp(75 - ((p99Ms - 5) / 15) * 45);
  else if (p99Ms <= 50) score = clamp(30 - ((p99Ms - 20) / 30) * 30);
  else score = 0;
  return { score, weight: 0.1, why: `command p99 ${p99Ms.toFixed(2)} ms` };
}

export function scoreHealth(input: DiagnosisInput): HealthScore {
  const m = input.metrics;
  const ks = input.keyspace;
  const workload = inferWorkload(input);
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
  const frag = m.mem_fragmentation_ratio;
  if (frag != null && frag >= 1.5) {
    memory = Math.min(memory, frag >= 2.5 ? 50 : 70);
    memoryWhy += `; fragmentation ${frag.toFixed(2)}`;
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

  const latency = scoreLatency(m.command_latency_p99_ms);
  parts.push({
    id: "latency",
    label: "Latency",
    score: latency.score,
    weight: latency.weight,
    why: latency.why,
  });

  const hits = m.keyspace_hits ?? 0;
  const misses = m.keyspace_misses ?? 0;
  const denom = hits + misses;
  let cache = 100;
  let cacheWhy = "not enough hits/misses to judge";
  if (workload === "broker") {
    cacheWhy = "broker workload — hit rate not meaningful";
  } else if (denom >= 20) {
    cache = clamp((hits / denom) * 100);
    cacheWhy = `hit rate ${((hits / denom) * 100).toFixed(0)}%`;
  }
  parts.push({
    id: "cache",
    label: "Cache",
    score: cache,
    weight: 0.15,
    why: cacheWhy,
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

export {
  buildDiagnosisContext,
  type CollectionStatus,
  type DiagnosisContext,
  type DiagnosisContextFinding,
  type DiagnosisContextFindingInput,
  type DiagnosisContextSeriesInput,
  type DiagnosisContextSeriesSummary,
  type DiagnosisContextSnapshotInput,
} from "./context.js";

