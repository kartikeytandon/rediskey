/** Shared telemetry contract. Agent JSON should match these shapes. */

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

export type KeyspaceSample = {
  sampled: number;
  withTtl: number;
  withoutTtl: number;
  missingTtlPct: number;
  namespaces: { prefix: string; count: number }[];
  bigKeys: { key: string; bytes: number }[];
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
