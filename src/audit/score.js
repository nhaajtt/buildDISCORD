import { gradeBands } from "../humor/audit.js";

export const PENALTY = { cao: 15, vua: 7, thap: 3 };

export function scoreFindings(findings) {
  const lost = (Array.isArray(findings) ? findings : []).reduce((sum, f) => sum + (PENALTY[f?.severity] ?? 0), 0);
  return Math.max(0, 100 - lost);
}

export const gradeFor = (score) => gradeBands.find((band) => score >= band.min)?.label ?? gradeBands.at(-1).label;

export function countBySeverity(findings) {
  const counts = { cao: 0, vua: 0, thap: 0 };
  for (const f of findings) if (f.severity in counts) counts[f.severity] += 1;
  return counts;
}

export function buildReport(facts, findings, createdAt = Date.now()) {
  const score = scoreFindings(findings);
  return {
    score,
    grade: gradeFor(score),
    findings,
    stats: {
      roles: facts.counts?.roles ?? 0,
      channels: facts.counts?.channels ?? 0,
      members: facts.memberCount ?? null,
      findings: countBySeverity(findings),
    },
    createdAt,
  };
}
