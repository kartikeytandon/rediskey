export type CollectionStatus = "collected" | "not_collected" | "partial";

export type DiagnosisContextSeriesPoint = { time: string; value: number };

export type DiagnosisContextSeriesSummary = {
  metric: string;
  hours: number;
  status: CollectionStatus;
  pointCount: number;
  first: DiagnosisContextSeriesPoint | null;
  last: DiagnosisContextSeriesPoint | null;
  min: number | null;
  max: number | null;
  avg: number | null;
};

export type DiagnosisContextFinding = {
  id: string | null;
  category: string;
  severity: "high" | "warning" | "info" | string;
  title: string;
  meaning: string | null;
  action: string | null;
  evidence: Record<string, unknown>;
  createdAt: string | null;
};

export type DiagnosisContext = {
  schemaVersion: "1";
  collectedAt: string | null;
  health: {
    status: CollectionStatus;
    total: number | null;
    parts: Array<{ id: string; label: string; score: number; weight: number; why: string }>;
  };
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
  changes: {
    status: CollectionStatus;
    window: "prior_24h" | "prior_5h" | null;
    metrics: Array<{
      id: string;
      label: string;
      current: number;
      baseline: number;
      deltaPct: number | null;
      unit: "bytes" | "ops" | "count" | "pct";
    }>;
  };
  findings: DiagnosisContextFinding[];
  keyspace: {
    status: CollectionStatus;
    sampled: number | null;
    withTtl: number | null;
    withoutTtl: number | null;
    missingTtlPct: number | null;
    namespaces: Array<{ prefix: string; count: number }>;
    bigKeys: Array<{ key: string; bytes: number }>;
    scanTruncated: boolean | null;
    scanComplete: boolean | null;
  };
  commandPicture: {
    status: CollectionStatus;
    topCommands: Array<{ command: string; calls: number; usec: number; usecPerCall: number }>;
    slowlogShares: Array<{
      command: string;
      count: number;
      sharePct: number;
      totalDurationUs: number;
    }>;
    hotKeys: Array<{ key: string; bytes: number; idleSeconds?: number; freq?: number }>;
  };
  slowlogRecent: {
    status: CollectionStatus;
    entries: Array<{ command: string; durationUs: number }>;
  };
  series: DiagnosisContextSeriesSummary[];
  /** Fields / signals Baltan does not collect — models must not invent them. */
  notCollected: string[];
  notesForModel: string[];
};

export type DiagnosisContextSnapshotInput = {
  collectedAt: string | Date | null;
  health: {
    total: number;
    parts: Array<{ id: string; label: string; score: number; weight: number; why: string }>;
  } | null;
  kpis: DiagnosisContext["kpis"];
  changes?: DiagnosisContext["changes"]["metrics"];
  changesWindow?: "prior_24h" | "prior_5h" | null;
  keyspace: {
    sampled: number;
    withTtl?: number;
    withoutTtl?: number;
    missingTtlPct: number;
    namespaces?: Array<{ prefix: string; count: number }> | unknown;
    bigKeys?: Array<{ key: string; bytes: number }> | unknown;
    scanTruncated?: boolean;
    scanComplete?: boolean;
  } | null;
  commandPicture: {
    topCommands?: Array<{ command: string; calls: number; usec: number; usecPerCall: number }>;
    slowlogShares?: Array<{
      command: string;
      count: number;
      sharePct: number;
      totalDurationUs: number;
    }>;
    hotKeys?: Array<{ key: string; bytes: number; idleSeconds?: number; freq?: number }>;
  } | null;
  slowlog?: Array<{ command: string; durationUs: number }>;
};

export type DiagnosisContextFindingInput = {
  id?: string;
  category: string;
  severity: string;
  title: string;
  evidence?: Record<string, unknown> | null;
  created_at?: string | Date | null;
  createdAt?: string | Date | null;
  meaning?: string;
  action?: string;
};

export type DiagnosisContextSeriesInput = {
  metric: string;
  hours: number;
  points: Array<{ time: string | Date; value: number }>;
};

const DEFAULT_NOT_COLLECTED = [
  "replica_lag",
  "persistence_fork_ms",
  "cluster_slot_coverage",
  "client_list_details",
  "key_values",
  "acl_rules",
];

const NOTES_FOR_MODEL = [
  "schemaVersion is 1 — treat unknown fields as absent.",
  "null means not collected on this sample — never invent a number.",
  "Only cite metrics and findings present in this context.",
  "If status is not_collected, say that Baltan did not collect that signal.",
  "Do not invent Redis key values; Baltan never stores values.",
];

function iso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function asNamespaceList(raw: unknown): Array<{ prefix: string; count: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is { prefix: string; count: number } => {
      return (
        n != null &&
        typeof n === "object" &&
        typeof (n as { prefix?: unknown }).prefix === "string" &&
        typeof (n as { count?: unknown }).count === "number"
      );
    })
    .slice(0, 20);
}

function asBigKeys(raw: unknown): Array<{ key: string; bytes: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((k): k is { key: string; bytes: number } => {
      return (
        k != null &&
        typeof k === "object" &&
        typeof (k as { key?: unknown }).key === "string" &&
        typeof (k as { bytes?: unknown }).bytes === "number"
      );
    })
    .slice(0, 10);
}

function summarizeSeries(input: DiagnosisContextSeriesInput): DiagnosisContextSeriesSummary {
  const points = input.points.map((p) => ({
    time: iso(p.time) ?? String(p.time),
    value: p.value,
  }));
  if (points.length === 0) {
    return {
      metric: input.metric,
      hours: input.hours,
      status: "not_collected",
      pointCount: 0,
      first: null,
      last: null,
      min: null,
      max: null,
      avg: null,
    };
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    metric: input.metric,
    hours: input.hours,
    status: "collected",
    pointCount: points.length,
    first: points[0] ?? null,
    last: points[points.length - 1] ?? null,
    min,
    max,
    avg,
  };
}

function normalizeFinding(f: DiagnosisContextFindingInput): DiagnosisContextFinding {
  const evidence = { ...(f.evidence ?? {}) };
  const meaning =
    typeof f.meaning === "string"
      ? f.meaning
      : typeof evidence.meaning === "string"
        ? evidence.meaning
        : null;
  const action =
    typeof f.action === "string"
      ? f.action
      : typeof evidence.action === "string"
        ? evidence.action
        : null;
  delete evidence.meaning;
  delete evidence.action;
  return {
    id: f.id ?? null,
    category: f.category,
    severity: f.severity,
    title: f.title,
    meaning,
    action,
    evidence,
    createdAt: iso(f.createdAt ?? f.created_at ?? null),
  };
}

/**
 * Build a stable, LLM-safe diagnosis context from dashboard inputs.
 * Never invents values — null / not_collected when data is missing.
 */
export function buildDiagnosisContext(input: {
  snapshot: DiagnosisContextSnapshotInput;
  findings: DiagnosisContextFindingInput[];
  series?: DiagnosisContextSeriesInput[];
}): DiagnosisContext {
  const { snapshot, findings } = input;
  const series = (input.series ?? []).map(summarizeSeries);

  const kpis = snapshot.kpis;
  const health = snapshot.health;
  const keyspace = snapshot.keyspace;
  const commandPicture = snapshot.commandPicture;
  const slowlog = snapshot.slowlog ?? [];
  const changesMetrics = snapshot.changes ?? [];
  const changesWindow = snapshot.changesWindow ?? null;

  const notCollected = [...DEFAULT_NOT_COLLECTED];
  if (kpis.p99Ms == null) notCollected.push("command_latency_p99_ms");
  if (keyspace == null) notCollected.push("keyspace_scan");
  if (commandPicture == null) notCollected.push("command_picture");
  if (slowlog.length === 0) notCollected.push("slowlog_recent");
  if (changesMetrics.length === 0) notCollected.push("baseline_changes");
  for (const s of series) {
    if (s.status === "not_collected") notCollected.push(`series:${s.metric}`);
  }

  return {
    schemaVersion: "1",
    collectedAt: iso(snapshot.collectedAt),
    health: health
      ? {
          status: "collected",
          total: health.total,
          parts: health.parts,
        }
      : {
          status: "not_collected",
          total: null,
          parts: [],
        },
    kpis: { ...kpis },
    changes:
      changesMetrics.length > 0
        ? {
            status: "collected",
            window: changesWindow,
            metrics: changesMetrics,
          }
        : {
            status: "not_collected",
            window: null,
            metrics: [],
          },
    findings: findings.map(normalizeFinding),
    keyspace: keyspace
      ? {
          status: keyspace.scanTruncated ? "partial" : "collected",
          sampled: keyspace.sampled,
          withTtl: keyspace.withTtl ?? null,
          withoutTtl: keyspace.withoutTtl ?? null,
          missingTtlPct: keyspace.missingTtlPct,
          namespaces: asNamespaceList(keyspace.namespaces),
          bigKeys: asBigKeys(keyspace.bigKeys),
          scanTruncated: keyspace.scanTruncated ?? null,
          scanComplete: keyspace.scanComplete ?? null,
        }
      : {
          status: "not_collected",
          sampled: null,
          withTtl: null,
          withoutTtl: null,
          missingTtlPct: null,
          namespaces: [],
          bigKeys: [],
          scanTruncated: null,
          scanComplete: null,
        },
    commandPicture: commandPicture
      ? {
          status: "collected",
          topCommands: (commandPicture.topCommands ?? []).slice(0, 10),
          slowlogShares: (commandPicture.slowlogShares ?? []).slice(0, 10),
          hotKeys: (commandPicture.hotKeys ?? []).slice(0, 10),
        }
      : {
          status: "not_collected",
          topCommands: [],
          slowlogShares: [],
          hotKeys: [],
        },
    slowlogRecent:
      slowlog.length > 0
        ? {
            status: "collected",
            entries: slowlog.slice(0, 16),
          }
        : {
            status: "not_collected",
            entries: [],
          },
    series,
    notCollected: [...new Set(notCollected)],
    notesForModel: NOTES_FOR_MODEL,
  };
}
