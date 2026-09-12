import { describe, expect, it } from "vitest";
import { buildDiagnosisContext } from "./context.js";

describe("buildDiagnosisContext", () => {
  it("returns schemaVersion 1 and never invents KPI numbers", () => {
    const ctx = buildDiagnosisContext({
      snapshot: {
        collectedAt: null,
        health: null,
        kpis: {
          usedMemory: null,
          maxMemory: null,
          memoryPct: null,
          opsPerSec: null,
          clients: null,
          evictions: null,
          hitRate: null,
          p99Ms: null,
          sampledKeys: null,
          missingTtlPct: null,
          biggestKeyBytes: null,
        },
        keyspace: null,
        commandPicture: null,
        slowlog: [],
      },
      findings: [],
      series: [],
    });

    expect(ctx.schemaVersion).toBe("1");
    expect(ctx.health.status).toBe("not_collected");
    expect(ctx.health.total).toBeNull();
    expect(ctx.keyspace.status).toBe("not_collected");
    expect(ctx.commandPicture.status).toBe("not_collected");
    expect(ctx.slowlogRecent.status).toBe("not_collected");
    expect(ctx.kpis.p99Ms).toBeNull();
    expect(ctx.notCollected).toContain("keyspace_scan");
    expect(ctx.notCollected).toContain("command_latency_p99_ms");
    expect(ctx.notesForModel.length).toBeGreaterThan(0);
  });

  it("normalizes findings and strips meaning/action from evidence", () => {
    const ctx = buildDiagnosisContext({
      snapshot: {
        collectedAt: "2026-08-23T10:00:00.000Z",
        health: {
          total: 59,
          parts: [{ id: "memory", label: "Memory", score: 70, weight: 0.2, why: "ok" }],
        },
        kpis: {
          usedMemory: 13_000_000,
          maxMemory: null,
          memoryPct: null,
          opsPerSec: 120,
          clients: 4,
          evictions: 0,
          hitRate: 80,
          p99Ms: 24.5,
          sampledKeys: 200,
          missingTtlPct: 90,
          biggestKeyBytes: 8_000_000,
        },
        keyspace: {
          sampled: 200,
          withTtl: 20,
          withoutTtl: 180,
          missingTtlPct: 90,
          namespaces: [{ prefix: "workload:", count: 50 }],
          bigKeys: [{ key: "mylist", bytes: 8_000_000 }],
          scanTruncated: true,
          scanComplete: false,
        },
        commandPicture: {
          topCommands: [{ command: "GET", calls: 100, usec: 1000, usecPerCall: 10 }],
          slowlogShares: [
            { command: "HGETALL", count: 5, sharePct: 80, totalDurationUs: 50_000 },
          ],
          hotKeys: [{ key: "hot", bytes: 1000, idleSeconds: 1 }],
        },
        slowlog: [{ command: "HGETALL", durationUs: 12_000 }],
        changes: [
          {
            id: "ops",
            label: "Ops / sec",
            current: 120,
            baseline: 80,
            deltaPct: 50,
            unit: "ops",
          },
        ],
        changesWindow: "prior_5h",
      },
      findings: [
        {
          id: "f1",
          category: "correlated_latency",
          severity: "high",
          title: "Latency lines up with heavy commands or large keys",
          evidence: {
            meaning: "P99 is elevated with big keys.",
            action: "Fix largest key first.",
            p99Ms: 24.5,
          },
          created_at: "2026-08-23T10:00:00.000Z",
        },
      ],
      series: [
        {
          metric: "used_memory",
          hours: 1,
          points: [
            { time: "2026-08-23T09:00:00.000Z", value: 10_000_000 },
            { time: "2026-08-23T10:00:00.000Z", value: 13_000_000 },
          ],
        },
        {
          metric: "command_latency_p99_ms",
          hours: 1,
          points: [],
        },
      ],
    });

    expect(ctx.health.status).toBe("collected");
    expect(ctx.health.total).toBe(59);
    expect(ctx.keyspace.status).toBe("partial");
    expect(ctx.keyspace.bigKeys[0]?.key).toBe("mylist");
    expect(ctx.commandPicture.status).toBe("collected");
    expect(ctx.findings).toHaveLength(1);
    expect(ctx.findings[0]?.meaning).toBe("P99 is elevated with big keys.");
    expect(ctx.findings[0]?.action).toBe("Fix largest key first.");
    expect(ctx.findings[0]?.evidence).toEqual({ p99Ms: 24.5 });
    expect(ctx.findings[0]?.evidence).not.toHaveProperty("meaning");
    expect(ctx.series[0]?.status).toBe("collected");
    expect(ctx.series[0]?.avg).toBe(11_500_000);
    expect(ctx.series[1]?.status).toBe("not_collected");
    expect(ctx.notCollected).toContain("series:command_latency_p99_ms");
    expect(ctx.notCollected).not.toContain("command_latency_p99_ms");
    expect(ctx.changes.window).toBe("prior_5h");
  });

  it("keeps a stable top-level shape for LLM consumers", () => {
    const ctx = buildDiagnosisContext({
      snapshot: {
        collectedAt: null,
        health: null,
        kpis: {
          usedMemory: null,
          maxMemory: null,
          memoryPct: null,
          opsPerSec: null,
          clients: null,
          evictions: null,
          hitRate: null,
          p99Ms: null,
          sampledKeys: null,
          missingTtlPct: null,
          biggestKeyBytes: null,
        },
        keyspace: null,
        commandPicture: null,
      },
      findings: [],
    });

    const keys = Object.keys(ctx).sort();
    expect(keys).toEqual(
      [
        "changes",
        "collectedAt",
        "commandPicture",
        "findings",
        "health",
        "keyspace",
        "kpis",
        "notCollected",
        "notesForModel",
        "schemaVersion",
        "series",
        "slowlogRecent",
      ].sort(),
    );
  });
});
