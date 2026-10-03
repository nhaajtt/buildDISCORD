import { randomBytes } from "node:crypto";
import { getDb } from "../db.js";
import { STATUS } from "./logic.js";

// Ticket rows. A row is never deleted when its channel is: the history stays.

// Takes the next number and a place in the user's quota before the channel exists. channel_id is UNIQUE and NOT NULL,
// so the row waits under a throwaway value until attachChannel sets the real one.
export function reserveTicket({ guildId, userId, type, now }) {
  const db = getDb();
  const placeholder = `pending:${randomBytes(6).toString("hex")}`;
  const { lastInsertRowid } = db
    .prepare("INSERT INTO tickets (guild_id, channel_id, user_id, type, status, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(guildId, placeholder, userId, type, STATUS.PENDING, now);
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND id <= ?").get(guildId, lastInsertRowid);
  return { id: Number(lastInsertRowid), number: n };
}

export function attachChannel(id, channelId) {
  getDb().prepare("UPDATE tickets SET channel_id = ?, status = ? WHERE id = ? AND status = ?").run(channelId, STATUS.OPEN, id, STATUS.PENDING);
}

export function discardTicket(id) {
  getDb().prepare("DELETE FROM tickets WHERE id = ? AND status = ?").run(id, STATUS.PENDING);
}

export const getTicket = (id) => getDb().prepare("SELECT * FROM tickets WHERE id = ?").get(id) ?? null;

// Pending and open both count against a person's limit
export const countActive = (guildId, userId) =>
  getDb().prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ? AND user_id = ? AND status IN (?, ?)").get(guildId, userId, STATUS.PENDING, STATUS.OPEN).n;

export const listOpen = (guildId) => getDb().prepare("SELECT * FROM tickets WHERE guild_id = ? AND status = ? ORDER BY id").all(guildId, STATUS.OPEN);

export const listAllOpen = () => getDb().prepare("SELECT * FROM tickets WHERE status = ? ORDER BY guild_id, id").all(STATUS.OPEN);

export const claimRow = (id, userId) => getDb().prepare("UPDATE tickets SET claimed_by = ? WHERE id = ? AND status = ?").run(userId, id, STATUS.OPEN);

export const closeRow = (id, now, reason) =>
  getDb().prepare("UPDATE tickets SET status = ?, closed_at = ?, close_reason = ? WHERE id = ? AND status = ?").run(STATUS.CLOSED, now, reason ?? null, id, STATUS.OPEN);

export const reopenRow = (id) =>
  getDb().prepare("UPDATE tickets SET status = ?, closed_at = NULL, close_reason = NULL WHERE id = ? AND status = ?").run(STATUS.OPEN, id, STATUS.CLOSED);

// Rows left pending by a crash between reserving and creating the channel
export const dropStalePending = (olderThan) => getDb().prepare("DELETE FROM tickets WHERE status = ? AND created_at < ?").run(STATUS.PENDING, olderThan).changes;
