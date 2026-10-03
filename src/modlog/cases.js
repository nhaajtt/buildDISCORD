import { getDb } from "../db.js";

export const CASE_ACTIONS = ["warn", "timeout", "kick", "ban"];

// Stores one moderation case and returns its id
export function addCase({ guildId, userId, modId, action, reason = null, until = null, at = Date.now() }) {
  if (!CASE_ACTIONS.includes(action)) throw new Error(`Unknown case action: ${action}`);
  const result = getDb()
    .prepare("INSERT INTO mod_cases (guild_id, user_id, mod_id, action, reason, until, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(String(guildId), String(userId), String(modId), action, reason === null ? null : String(reason).slice(0, 300), until, at);
  return Number(result.lastInsertRowid);
}

export function listCases(guildId, userId, limit = 10) {
  return getDb()
    .prepare("SELECT * FROM mod_cases WHERE guild_id = ? AND user_id = ? ORDER BY at DESC, id DESC LIMIT ?")
    .all(String(guildId), String(userId), Math.min(25, Math.max(1, limit)));
}

export function countCases(guildId, userId) {
  return Number(getDb().prepare("SELECT COUNT(*) AS n FROM mod_cases WHERE guild_id = ? AND user_id = ?").get(String(guildId), String(userId)).n);
}
