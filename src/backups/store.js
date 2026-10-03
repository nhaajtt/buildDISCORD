import { getDb } from "../db.js";
import { validateSnapshot } from "./validate.js";
import { BackupError, serialize } from "./snapshot.js";

export const NAME_MAX = 40;

// Names are 1 to 40 characters with single spaces. Returns null when the name is unusable.
export function normalizeName(raw) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

const sameName = "guild_id = ? AND lower(name) = lower(?)";

export function countBackups(guildId) {
  return getDb().prepare("SELECT COUNT(*) AS n FROM backups WHERE guild_id = ?").get(guildId).n;
}

export function hasBackup(guildId, name) {
  return Boolean(getDb().prepare(`SELECT 1 FROM backups WHERE ${sameName}`).get(guildId, name));
}

// Stores a snapshot under a new name. A name already in use is refused: replacing a backup silently would destroy the older one.
export function saveBackup(guildId, name, snapshot, now = Date.now()) {
  if (hasBackup(guildId, name)) throw new BackupError("name already used");
  const data = serialize(snapshot);
  const result = getDb().prepare("INSERT INTO backups (guild_id, name, data, created_at) VALUES (?, ?, ?, ?)").run(guildId, name, data, now);
  return Number(result.lastInsertRowid);
}

export function listBackups(guildId) {
  return getDb()
    .prepare("SELECT id, name, created_at, length(data) AS bytes, data FROM backups WHERE guild_id = ? ORDER BY created_at DESC")
    .all(guildId)
    .map((row) => {
      let counts = { roles: 0, categories: 0, channels: 0 };
      try {
        counts = JSON.parse(row.data).counts ?? counts;
      } catch {
        // an unreadable row is still listed so it can be deleted
      }
      return { id: row.id, name: row.name, createdAt: row.created_at, bytes: row.bytes, counts };
    });
}

// Loads a backup and runs it through the strict check again, because the database is data too
export function getBackup(guildId, name) {
  const row = getDb().prepare(`SELECT id, name, data, created_at FROM backups WHERE ${sameName}`).get(guildId, name);
  if (!row) return null;
  return { id: row.id, name: row.name, createdAt: row.created_at, snapshot: validateSnapshot(JSON.parse(row.data)) };
}

export function getBackupById(guildId, id) {
  const row = getDb().prepare("SELECT id, name, data, created_at FROM backups WHERE guild_id = ? AND id = ?").get(guildId, id);
  if (!row) return null;
  return { id: row.id, name: row.name, createdAt: row.created_at, snapshot: validateSnapshot(JSON.parse(row.data)) };
}

export function deleteBackup(guildId, id) {
  return Number(getDb().prepare("DELETE FROM backups WHERE guild_id = ? AND id = ?").run(guildId, id).changes);
}
