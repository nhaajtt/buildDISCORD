import { getDb } from "../db.js";
import { auditLines as lines } from "../humor/audit.js";
import { readFacts } from "./facts.js";
import { getFix } from "./fixes.js";
import { buildReport } from "./score.js";
import { runRules } from "./rules.js";

// The public contract of the health check (the web dashboard reads it too): runAudit, applyFix, latestReport, reports.
// A report is { score, grade, findings, stats, createdAt }.

export const KEEP_REPORTS = 20;

const parse = (row) => {
  try {
    const report = JSON.parse(row.report);
    return report && typeof report === "object" ? report : null;
  } catch {
    return null;
  }
};

function store(guildId, report) {
  const db = getDb();
  db.prepare("INSERT INTO audit_reports (guild_id, score, report, created_at) VALUES (?, ?, ?, ?)").run(guildId, report.score, JSON.stringify(report), report.createdAt);
  // Only the newest reports are kept per server
  db.prepare("DELETE FROM audit_reports WHERE guild_id = ? AND id NOT IN (SELECT id FROM audit_reports WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ?)").run(
    guildId,
    guildId,
    KEEP_REPORTS,
  );
}

export async function runAudit(guild) {
  const facts = await readFacts(guild);
  const report = buildReport(facts, runRules(facts));
  store(guild.id, report);
  return report;
}

// Applies one safe fix and returns { fixId, changed, summary }. Unknown ids change nothing.
export async function applyFix(guild, fixId) {
  const fix = getFix(fixId);
  if (!fix) return { fixId, changed: false, summary: lines.unknownFix };
  return fix.apply(guild);
}

// Newest first, at most `limit` (1 to 20)
export function reports(guildId, limit = KEEP_REPORTS) {
  const n = Math.min(KEEP_REPORTS, Math.max(1, Math.trunc(Number(limit)) || KEEP_REPORTS));
  return getDb()
    .prepare("SELECT report FROM audit_reports WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(guildId, n)
    .map(parse)
    .filter(Boolean);
}

export const latestReport = (guildId) => reports(guildId, 1)[0] ?? null;

export { FIXES, fixIdsOf, getFix } from "./fixes.js";
export { RULES, runRules } from "./rules.js";
export { scoreFindings } from "./score.js";
