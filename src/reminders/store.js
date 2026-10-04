import { getDb } from "../db.js";
import { cleanText } from "../activity/text.js";
import { DAY, MAX_AHEAD_MS } from "./parse.js";

export const MAX_BODY = 300;
export const MAX_PENDING_USER = 10;
export const MAX_PENDING_GUILD_USER = 25;
export const MAX_AGE_MS = 365 * DAY;
export const MAX_PER_RUN = 100;
// Delivered rows are kept a month, then dropped
const KEEP_DONE_MS = 30 * DAY;

export const cleanBody = (value) => cleanText(value, MAX_BODY);

export function countPending(userId, guildId = undefined) {
  if (guildId === undefined) return Number(getDb().prepare("SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND status = 'pending'").get(userId).n);
  return Number(getDb().prepare("SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND guild_id IS ? AND status = 'pending'").get(userId, guildId).n);
}

// Stores a reminder unless the person is at a limit. Counting and inserting happen in one synchronous step.
export function createReminder({ guildId = null, userId, channelId = null, body, dueAt, now = Date.now() }) {
  const text = cleanBody(body);
  if (!text) return { ok: false, reason: "body" };
  if (!Number.isFinite(dueAt) || dueAt - now > MAX_AHEAD_MS) return { ok: false, reason: "far" };
  if (countPending(userId) >= MAX_PENDING_USER) return { ok: false, reason: "user", max: MAX_PENDING_USER };
  if (countPending(userId, guildId) >= MAX_PENDING_GUILD_USER) return { ok: false, reason: "guild", max: MAX_PENDING_GUILD_USER };
  const result = getDb()
    .prepare("INSERT INTO reminders (guild_id, user_id, channel_id, body, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
    .run(guildId, userId, channelId, text, Math.floor(dueAt), now);
  return { ok: true, id: Number(result.lastInsertRowid) };
}

export const listPending = (userId, limit = 25) =>
  getDb().prepare("SELECT * FROM reminders WHERE user_id = ? AND status = 'pending' ORDER BY due_at, id LIMIT ?").all(userId, limit);

// Only the owner's own pending reminders can be removed
export const deletePending = (userId, id) =>
  Number.isSafeInteger(id) && Number(getDb().prepare("DELETE FROM reminders WHERE id = ? AND user_id = ? AND status = 'pending'").run(id, userId).changes) === 1;

export const dueReminders = (now, limit = MAX_PER_RUN) =>
  getDb().prepare("SELECT * FROM reminders WHERE status = 'pending' AND due_at <= ? ORDER BY due_at, id LIMIT ?").all(now, limit);

// The guard against a double send: only the call that flips pending to done may deliver
export const claimReminder = (id) => Number(getDb().prepare("UPDATE reminders SET status = 'done' WHERE id = ? AND status = 'pending'").run(id).changes) === 1;

export const markFailed = (id) => getDb().prepare("UPDATE reminders SET status = 'failed' WHERE id = ? AND status = 'done'").run(id);

// Nothing lives longer than a year, and finished rows go after a month
export function pruneReminders(now = Date.now()) {
  const db = getDb();
  db.prepare("DELETE FROM reminders WHERE created_at < ?").run(now - MAX_AGE_MS);
  db.prepare("DELETE FROM reminders WHERE status != 'pending' AND due_at < ?").run(now - KEEP_DONE_MS);
}
