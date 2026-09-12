import type { DiagnosisContext } from "@rediskey/diagnosis";

export type ExplainCitation = {
  kind: "finding" | "kpi" | "health" | "note";
  id: string;
  label: string;
};

export type ExplainResult = {
  question: string;
  answer: string;
  citations: ExplainCitation[];
  mode: "llm" | "rules";
  model: string | null;
};

const DEFAULT_QUESTION = "Why is Redis slow?";

function fmtBytes(n: number | null): string | null {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Deterministic evidence-only answer when no LLM key is configured. */
export function explainFromRules(context: DiagnosisContext, question = DEFAULT_QUESTION): ExplainResult {
  const citations: ExplainCitation[] = [];
  const parts: string[] = [];

  if (context.collectedAt == null && context.health.status === "not_collected") {
    return {
      question,
      answer:
        "Baltan has no recent sample for this instance yet. Connect the agent and wait for an ingest before diagnosing latency.",
      citations: [{ kind: "note", id: "no_sample", label: "No sample collected" }],
      mode: "rules",
      model: null,
    };
  }

  if (context.health.status === "collected" && context.health.total != null) {
    parts.push(`Instance health is ${context.health.total}/100 on the latest sample.`);
    citations.push({
      kind: "health",
      id: "total",
      label: `Health ${context.health.total}/100`,
    });
  }

  const k = context.kpis;
  if (k.p99Ms != null) {
    parts.push(`Command P99 latency is ${k.p99Ms.toFixed(2)} ms.`);
    citations.push({ kind: "kpi", id: "p99Ms", label: `P99 ${k.p99Ms.toFixed(2)} ms` });
  } else {
    parts.push("Command P99 latency was not collected on this sample.");
    citations.push({ kind: "note", id: "p99_missing", label: "P99 not collected" });
  }

  if (k.memoryPct != null) {
    parts.push(`Memory is at ${k.memoryPct.toFixed(0)}% of maxmemory.`);
    citations.push({ kind: "kpi", id: "memoryPct", label: `Memory ${k.memoryPct.toFixed(0)}%` });
  }
  if ((k.evictions ?? 0) > 0) {
    parts.push(`Evictions are ${k.evictions} — Redis is shedding keys under memory pressure.`);
    citations.push({ kind: "kpi", id: "evictions", label: `Evictions ${k.evictions}` });
  }
  if (k.missingTtlPct != null && k.missingTtlPct >= 50) {
    parts.push(`${k.missingTtlPct.toFixed(0)}% of sampled keys have no TTL.`);
    citations.push({
      kind: "kpi",
      id: "missingTtlPct",
      label: `${k.missingTtlPct.toFixed(0)}% missing TTL`,
    });
  }
  if (k.biggestKeyBytes != null && k.biggestKeyBytes >= 2048) {
    parts.push(`Largest sampled key is ${fmtBytes(k.biggestKeyBytes)}.`);
    citations.push({
      kind: "kpi",
      id: "biggestKeyBytes",
      label: `Largest key ${fmtBytes(k.biggestKeyBytes)}`,
    });
  }

  const topFindings = context.findings.slice(0, 4);
  if (topFindings.length === 0) {
    parts.push("There are no open findings right now.");
  } else {
    parts.push("Top open findings:");
    for (const f of topFindings) {
      const tip = f.action ? ` What to check: ${f.action}` : "";
      const meaning = f.meaning ? ` ${f.meaning}` : "";
      parts.push(`- [${f.severity}] ${f.title}.${meaning}${tip}`);
      citations.push({
        kind: "finding",
        id: f.id ?? f.category,
        label: f.title,
      });
    }
  }

  if (context.keyspace.status === "not_collected") {
    parts.push("Keyspace SCAN was not collected.");
  } else if (context.keyspace.scanTruncated) {
    parts.push("Keyspace sample was truncated — not a full keyspace view.");
    citations.push({ kind: "note", id: "scan_truncated", label: "SCAN truncated" });
  }

  parts.push(
    "This answer only uses Baltan evidence above. Signals listed under notCollected were not invented.",
  );

  return {
    question,
    answer: parts.join(" "),
    citations,
    mode: "rules",
    model: null,
  };
}

export function buildExplainMessages(context: DiagnosisContext, question: string) {
  const system = [
    "You are Baltan, a Redis/Valkey diagnosis assistant.",
    "Answer ONLY using the JSON diagnosis context provided by the user.",
    "Rules:",
    "- Lead with the single most likely primary cause of slowness (or say evidence does not show clear slowness).",
    "- Then name at most 2 supporting signals with concrete numbers/finding titles from the context.",
    "- Do NOT dump every metric. Skip healthy/irrelevant signals.",
    "- If a field is null or status is not_collected, say it was not collected — never invent values.",
    "- Never invent Redis key values (Baltan does not store values).",
    "- End with 2–4 short bullets of what to check next, taken from finding.action fields when present.",
    "- Do not mention being an AI model unless asked.",
  ].join("\n");

  const user = [
    `Question: ${question}`,
    "",
    "Diagnosis context (JSON):",
    JSON.stringify(context),
  ].join("\n");

  return { system, user };
}

function citationsFromContext(context: DiagnosisContext): ExplainCitation[] {
  const citations: ExplainCitation[] = [];
  if (context.health.total != null) {
    citations.push({
      kind: "health",
      id: "total",
      label: `Health ${context.health.total}/100`,
    });
  }
  for (const f of context.findings.slice(0, 5)) {
    citations.push({ kind: "finding", id: f.id ?? f.category, label: f.title });
  }
  if (context.kpis.p99Ms != null) {
    citations.push({
      kind: "kpi",
      id: "p99Ms",
      label: `P99 ${context.kpis.p99Ms.toFixed(2)} ms`,
    });
  }
  return citations;
}

/** Google Gemini generateContent (free-tier friendly). */
export async function explainWithGemini(
  context: DiagnosisContext,
  question: string,
  opts: { apiKey: string; model: string },
): Promise<ExplainResult> {
  const { system, user } = buildExplainMessages(context, question);
  const model = encodeURIComponent(opts.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`llm_failed:${res.status}:${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const answer = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!answer) throw new Error("llm_empty");

  return {
    question,
    answer,
    citations: citationsFromContext(context),
    mode: "llm",
    model: opts.model,
  };
}

/** OpenAI-compatible chat completions (optional). */
export async function explainWithLlm(
  context: DiagnosisContext,
  question: string,
  opts: { apiKey: string; model: string; baseUrl: string },
): Promise<ExplainResult> {
  const { system, user } = buildExplainMessages(context, question);
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`llm_failed:${res.status}:${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("llm_empty");

  return {
    question,
    answer,
    citations: citationsFromContext(context),
    mode: "llm",
    model: opts.model,
  };
}

export { DEFAULT_QUESTION };
