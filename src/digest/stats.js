import { countEvents } from "../analytics.js";
import { getDb } from "../db.js";
import { getSection } from "../settings.js";
import { fixIdsOf, getFix, latestReport, reports, runAudit } from "../audit/index.js";
import { DAY, WEEK } from "./schedule.js";

// Everything the weekly report counts. Only numbers and our own audit results, never anything a member wrote.

const one = (sql, ...args) => Number(getDb().prepare(sql).get(...args).n);

export const ticketCounts = (guildId, since, until) => ({
  opened: one("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND created_at >= ? AND created_at < ? AND status != 'pending'", guildId, since, until),
  closed: one("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND closed_at IS NOT NULL AND closed_at >= ? AND closed_at < ?", guildId, since, until),
  open: one("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND status = 'open'", guildId),
});

// The newest check from before the current week, so "versus last week" compares like with like
export function previousScore(guildId, now) {
  const old = reports(guildId, 20).find((r) => r.createdAt <= now - 5 * DAY);
  if (old) return old.score;
  return getSection(guildId, "digest").lastScore;
}

// What a report would offer to fix right now: the safe fixes it points at that still change something
export function fixesOf(guild, report) {
  if (!report) return [];
  return fixIdsOf(report)
    .map((id) => ({ id, title: getFix(id).title, change: getFix(id).describe(guild) }))
    .filter((f) => f.change);
}

// `audit` is injectable so the numbers can be tested without a Discord server
export async function collectStats(guild, { now = Date.now(), freshAudit = true, audit = runAudit } = {}) {
  const guildId = guild.id;
  const since = now - WEEK;
  const previous = previousScore(guildId, now);
  let report = null;
  if (freshAudit) {
    try {
      report = await audit(guild);
    } catch (error) {
      console.error("Digest audit failed:", error?.message ?? error);
    }
  }
  report ??= latestReport(guildId);
  const tickets = ticketCounts(guildId, since, now + 1);
  return {
    joins: countEvents(guildId, "join", since, now + 1),
    automodBlocks: countEvents(guildId, "automod_block", since, now + 1),
    ticketsOpened: tickets.opened,
    ticketsClosed: tickets.closed,
    openTickets: tickets.open,
    automodOn: getSection(guildId, "automod").enabled,
    score: report ? report.score : null,
    previousScore: previous,
    findings: report?.findings ?? [],
    fixes: fixesOf(guild, report),
  };
}
