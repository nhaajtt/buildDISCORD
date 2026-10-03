import { getDb } from "./db.js";

// What the bot built per server, so /nuke can undo it and the self-assign role buttons can be trusted
const emptyRecord = () => ({ theme: null, roles: [], pickRoles: [], categories: [], channels: [] });

export function loadRecord(guildId) {
  const row = getDb().prepare("SELECT record FROM guilds WHERE id = ?").get(guildId);
  if (!row) return emptyRecord();
  try {
    return { ...emptyRecord(), ...JSON.parse(row.record) };
  } catch {
    return emptyRecord();
  }
}

export function saveRecord(guildId, record) {
  getDb()
    .prepare(
      "INSERT INTO guilds (id, record, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record, updated_at = excluded.updated_at",
    )
    .run(guildId, JSON.stringify(record), Date.now());
}

export function clearRecord(guildId) {
  getDb().prepare("DELETE FROM guilds WHERE id = ?").run(guildId);
}
