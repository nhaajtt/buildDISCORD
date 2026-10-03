import { getDb } from "./db.js";

// Counts what happens on the way from invite to paying customer, so the owner can see where people drop off.
// Only the server id, a short kind and the time are stored, never a person or any content.
export const KINDS = ["invite", "wizard_done", "build_done", "feature_on", "trial", "paid", "left"];

export function track(guildId, kind, now = Date.now()) {
  try {
    getDb().prepare("INSERT INTO events_log (guild_id, kind, at) VALUES (?, ?, ?)").run(String(guildId), String(kind).slice(0, 40), now);
  } catch (error) {
    // counting must never break the thing being counted
    console.error("Could not record an event:", error.message);
  }
}

// How many distinct servers reached each step since `since`
export function funnel(since = 0) {
  const rows = getDb().prepare("SELECT kind, COUNT(DISTINCT guild_id) AS servers, COUNT(*) AS events FROM events_log WHERE at >= ? GROUP BY kind").all(since);
  const out = {};
  for (const row of rows) out[row.kind] = { servers: Number(row.servers), events: Number(row.events) };
  return out;
}

// The weekly report only reads the last week, so the per-event counts it feeds on are dropped after this long. Funnel kinds stay.
export const COUNT_KEEP_DAYS = 90;
const COUNT_KINDS = ["join", "automod_block"];

export function pruneCounts(now = Date.now()) {
  const cutoff = now - COUNT_KEEP_DAYS * 24 * 60 * 60 * 1000;
  return Number(getDb().prepare(`DELETE FROM events_log WHERE kind IN (${COUNT_KINDS.map(() => "?").join(", ")}) AND at < ?`).run(...COUNT_KINDS, cutoff).changes);
}

export function countEvents(guildId, kind, since = 0, until = Number.MAX_SAFE_INTEGER) {
  return Number(getDb().prepare("SELECT COUNT(*) AS n FROM events_log WHERE guild_id = ? AND kind = ? AND at >= ? AND at < ?").get(String(guildId), kind, since, until).n);
}
