export type Engine = "redis" | "valkey";

export type MetricSample = {
  name: string;
  value: number;
  timestamp: string;
};

export type SlowlogSample = {
  id: number;
  durationUs: number;
  command: string;
};

export type NamespaceCount = { prefix: string; count: number };
export type BigKeySample = { key: string; bytes: number };
export type KeyspaceSample = {
  sampled: number;
  withTtl: number;
  withoutTtl: number;
  missingTtlPct: number;
  namespaces: NamespaceCount[];
  bigKeys: BigKeySample[];
};

export type TelemetryPayload = {
  agentId: string;
  engine: Engine;
  version: string;
  collectedAt: string;
  server: Record<string, string>;
  metrics: MetricSample[];
  slowlog: SlowlogSample[];
  keyspace?: KeyspaceSample;
};

export function isTelemetryPayload(body: unknown): body is TelemetryPayload {
  if (!body || typeof body !== "object") return false;
  const b = body as TelemetryPayload;
  return (
    typeof b.agentId === "string" &&
    (b.engine === "redis" || b.engine === "valkey") &&
    Array.isArray(b.metrics)
  );
}
