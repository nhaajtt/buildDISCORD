import { getDb } from "../db.js";

// The rooms the bot made. A channel that is not a row here is never deleted by this feature.

export function recordRoom({ channelId, guildId, ownerId, now = Date.now() }) {
  getDb().prepare("INSERT OR REPLACE INTO temp_voice (channel_id, guild_id, owner_id, created_at) VALUES (?, ?, ?, ?)").run(channelId, guildId, ownerId, now);
}

export const getRoom = (channelId) => getDb().prepare("SELECT * FROM temp_voice WHERE channel_id = ?").get(channelId) ?? null;

export const forgetRoom = (channelId) => Number(getDb().prepare("DELETE FROM temp_voice WHERE channel_id = ?").run(channelId).changes);

export const countRooms = (guildId) => Number(getDb().prepare("SELECT COUNT(*) AS n FROM temp_voice WHERE guild_id = ?").get(guildId).n);

export const allRooms = () => getDb().prepare("SELECT * FROM temp_voice ORDER BY created_at").all();
