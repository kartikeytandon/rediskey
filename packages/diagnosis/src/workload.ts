export type WorkloadKind = "cache" | "broker" | "mixed" | "unknown";

type Namespace = { prefix: string; count: number };
type CommandStat = { command: string; calls: number };

export type WorkloadInput = {
  keyspace: { sampled: number; namespaces?: Namespace[] } | null;
  commandPicture?: { topCommands: CommandStat[] } | null;
};

const BROKER_PREFIXES = ["_kombu", "celery", "rq:", "bull:", "arq:", "dramatiq", "sidekiq"];
const BROKER_COMMANDS = new Set([
  "LPUSH",
  "RPUSH",
  "BRPOP",
  "BLPOP",
  "XADD",
  "XREAD",
  "XREADGROUP",
  "PUBLISH",
  "SUBSCRIBE",
  "PSUBSCRIBE",
]);
const CACHE_COMMANDS = new Set(["GET", "SET", "MGET", "MSET", "GETEX", "SETEX"]);

export function inferWorkload(input: WorkloadInput): WorkloadKind {
  const sampled = input.keyspace?.sampled ?? 0;
  const namespaces = input.keyspace?.namespaces ?? [];
  const brokerKeys = namespaces
    .filter((n) => BROKER_PREFIXES.some((p) => n.prefix === p || n.prefix.startsWith(`${p}.`)))
    .reduce((s, n) => s + n.count, 0);
  const brokerKeyShare = sampled > 0 ? brokerKeys / sampled : 0;

  const topCmds = input.commandPicture?.topCommands ?? [];
  const totalCalls = topCmds.reduce((s, c) => s + c.calls, 0);
  const brokerCalls = topCmds
    .filter((c) => BROKER_COMMANDS.has(c.command))
    .reduce((s, c) => s + c.calls, 0);
  const cacheCalls = topCmds
    .filter((c) => CACHE_COMMANDS.has(c.command))
    .reduce((s, c) => s + c.calls, 0);
  const brokerCmdShare = totalCalls > 0 ? brokerCalls / totalCalls : 0;
  const cacheCmdShare = totalCalls > 0 ? cacheCalls / totalCalls : 0;

  if (brokerKeyShare >= 0.4 || brokerCmdShare >= 0.25) return "broker";
  if (cacheCmdShare >= 0.35) return "cache";
  if (brokerKeyShare >= 0.15 && cacheCmdShare >= 0.15) return "mixed";
  return "unknown";
}

export function workloadLabel(kind: WorkloadKind): string {
  switch (kind) {
    case "broker":
      return "message broker / queue";
    case "cache":
      return "cache";
    case "mixed":
      return "mixed cache and queues";
    default:
      return "unknown";
  }
}
