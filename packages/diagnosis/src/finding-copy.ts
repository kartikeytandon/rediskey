import type { FindingSeverity } from "./index.js";

export type FindingDraft = {
  category: string;
  severity: FindingSeverity;
  title: string;
  meaning: string;
  action: string;
  evidence: Record<string, unknown>;
};

export function finding(
  category: string,
  severity: FindingSeverity,
  title: string,
  meaning: string,
  action: string,
  evidence: Record<string, unknown> = {},
): FindingDraft {
  return { category, severity, title, meaning, action, evidence };
}
