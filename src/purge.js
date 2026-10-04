import { getDb } from "./db.js";
import { forgetGuildXp } from "./activity/xp.js";

// Everything the bot keeps about a server except what billing needs (licenses, usage counters, orders) and the anonymous
// funnel counts, which hold only a server id and a time. Used by /xoadulieu so "forget this server" really forgets it.
const BY_GUILD = ["custom_themes", "backups", "scores", "recurring_events", "tickets", "audit_reports", "xp", "giveaways", "polls", "mod_cases", "role_menus", "temp_voice", "scheduled_messages", "reminders", "suggestions"];

export function purgeGuildData(guildId) {
  const db = getDb();
  const id = String(guildId);
  const removed = {};
  // Xp waiting to be written and cached settings would bring the server's data back after the delete
  forgetGuildXp(id);
  db.exec("BEGIN");
  try {
    // entries and votes hang off giveaways and polls, so they go first
    // The required role of a giveaway sits in a small table that only exists once the feature was used
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'giveaway_roles'").get()) {
      db.prepare("DELETE FROM giveaway_roles WHERE giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)").run(id);
    }
    db.prepare("DELETE FROM giveaway_entries WHERE giveaway_id IN (SELECT id FROM giveaways WHERE guild_id = ?)").run(id);
    db.prepare("DELETE FROM suggestion_votes WHERE suggestion_id IN (SELECT id FROM suggestions WHERE guild_id = ?)").run(id);
    db.prepare("DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE guild_id = ?)").run(id);
    for (const table of BY_GUILD) removed[table] = Number(db.prepare(`DELETE FROM ${table} WHERE guild_id = ?`).run(id).changes);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return removed;
}
