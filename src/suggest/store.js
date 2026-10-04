import { getDb } from "../db.js";
import { DAY_MS, DECISIONS } from "./logic.js";

// Rows are never really deleted by staff: a removed suggestion keeps counting toward the author's daily limit.

export function createSuggestion({ guildId, channelId, userId, body, now = Date.now() }) {
  const result = getDb()
    .prepare("INSERT INTO suggestions (guild_id, channel_id, message_id, user_id, body, status, decided_by, note, created_at) VALUES (?, ?, NULL, ?, ?, 'open', NULL, NULL, ?)")
    .run(guildId, channelId, userId, body, now);
  return Number(result.lastInsertRowid);
}

export const getSuggestion = (id) => (Number.isSafeInteger(id) && id > 0 ? getDb().prepare("SELECT * FROM suggestions WHERE id = ?").get(id) ?? null : null);

export const setMessage = (id, messageId) => getDb().prepare("UPDATE suggestions SET message_id = ? WHERE id = ?").run(messageId, id);

// A suggestion that never got its message posted is dropped so it does not count against the author
export function discardSuggestion(id) {
  const db = getDb();
  db.prepare("DELETE FROM suggestion_votes WHERE suggestion_id = ?").run(id);
  db.prepare("DELETE FROM suggestions WHERE id = ? AND message_id IS NULL").run(id);
}

export const recentTimes = (guildId, userId, now = Date.now()) =>
  getDb().prepare("SELECT created_at FROM suggestions WHERE guild_id = ? AND user_id = ? AND created_at > ?").all(guildId, userId, now - DAY_MS).map((r) => Number(r.created_at));

export const listOpen = (guildId, limit = 15) =>
  getDb().prepare("SELECT * FROM suggestions WHERE guild_id = ? AND status = 'open' ORDER BY id DESC LIMIT ?").all(guildId, limit);

// One vote per person. Pressing the other button changes the vote, pressing the same one takes it back.
export function castVote(id, userId, value) {
  const db = getDb();
  const now = db.prepare("SELECT value FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?").get(id, userId);
  if (now && Number(now.value) === value) {
    db.prepare("DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?").run(id, userId);
    return { value: 0 };
  }
  db.prepare("INSERT INTO suggestion_votes (suggestion_id, user_id, value) VALUES (?, ?, ?) ON CONFLICT(suggestion_id, user_id) DO UPDATE SET value = excluded.value").run(id, userId, value);
  return { value };
}

export function tally(id) {
  const rows = getDb().prepare("SELECT value, COUNT(*) AS n FROM suggestion_votes WHERE suggestion_id = ? GROUP BY value").all(id);
  const count = (v) => Number(rows.find((r) => Number(r.value) === v)?.n ?? 0);
  return { up: count(1), down: count(-1) };
}

// Records the decision. The status flip from open is the guard: only the first call wins, a second returns false.
export function decide(id, action, staffId, note) {
  const picked = DECISIONS[action];
  if (!picked) return false;
  return Number(getDb().prepare("UPDATE suggestions SET status = ?, decided_by = ?, note = ? WHERE id = ? AND status = 'open'").run(picked.status, staffId, note || null, id).changes) === 1;
}

// Soft removal; true only when the suggestion existed in this server and was not removed yet
export const removeSuggestion = (guildId, id) =>
  Number(getDb().prepare("UPDATE suggestions SET status = 'removed' WHERE id = ? AND guild_id = ? AND status != 'removed'").run(id, guildId).changes) === 1;
