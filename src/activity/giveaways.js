import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import { getDb } from "../db.js";
import { SNOWFLAKE } from "../settings.js";
import { lines } from "../humor/giveaways.js";

export const MAX_ACTIVE_GIVEAWAYS = 10;
export const MAX_WINNERS = 10;

// The required role is kept in a small table of this feature, so the shared giveaways table does not change.
const prepared = new WeakSet();
function db() {
  const handle = getDb();
  if (!prepared.has(handle)) {
    handle.exec("CREATE TABLE IF NOT EXISTS giveaway_roles (giveaway_id INTEGER PRIMARY KEY, role_id TEXT NOT NULL)");
    prepared.add(handle);
  }
  return handle;
}

// ---------- pure logic ----------

// Picks `count` different ids at random (a partial shuffle, so nobody can win twice). rng returns a number in [0, 1).
export function drawWinners(ids, count, rng = Math.random) {
  const pool = [...new Set(ids)];
  const take = Math.min(pool.length, Math.max(0, Math.floor(Number(count) || 0)));
  for (let i = 0; i < take; i += 1) {
    const r = Math.min(0.999999999, Math.max(0, Number(rng()) || 0));
    const j = i + Math.floor(r * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

const parseIds = (raw) => {
  try {
    const list = JSON.parse(raw ?? "[]");
    return Array.isArray(list) ? list.filter((id) => typeof id === "string" && SNOWFLAKE.test(id)) : [];
  } catch {
    return [];
  }
};

// ---------- storage ----------

function mapRow(row) {
  if (!row) return null;
  const role = db().prepare("SELECT role_id FROM giveaway_roles WHERE giveaway_id = ?").get(row.id);
  return { ...row, roleId: role?.role_id ?? null, winnerIds: parseIds(row.winner_ids) };
}

export function createGiveaway({ guildId, channelId, hostId, prize, winners, endsAt, roleId = null, now = Date.now() }) {
  const handle = db();
  const result = handle
    .prepare("INSERT INTO giveaways (guild_id, channel_id, message_id, host_id, prize, winners, ends_at, status, winner_ids, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, 'active', NULL, ?)")
    .run(guildId, channelId, hostId, prize, Math.min(MAX_WINNERS, Math.max(1, winners)), endsAt, now);
  const id = Number(result.lastInsertRowid);
  if (roleId && SNOWFLAKE.test(roleId)) handle.prepare("INSERT INTO giveaway_roles (giveaway_id, role_id) VALUES (?, ?)").run(id, roleId);
  return id;
}

export const getGiveaway = (id) => (Number.isSafeInteger(id) && id > 0 ? mapRow(db().prepare("SELECT * FROM giveaways WHERE id = ?").get(id)) : null);

export const setGiveawayMessage = (id, messageId) => db().prepare("UPDATE giveaways SET message_id = ? WHERE id = ?").run(messageId, id);

// Removes a giveaway that never got its message posted
export function discardGiveaway(id) {
  const handle = db();
  handle.prepare("DELETE FROM giveaway_entries WHERE giveaway_id = ?").run(id);
  handle.prepare("DELETE FROM giveaway_roles WHERE giveaway_id = ?").run(id);
  handle.prepare("DELETE FROM giveaways WHERE id = ? AND message_id IS NULL").run(id);
}

export const countActive = (guildId) => Number(db().prepare("SELECT COUNT(*) AS n FROM giveaways WHERE guild_id = ? AND status = 'active'").get(guildId).n);

export const listGiveaways = (guildId, limit = 15) =>
  db()
    .prepare("SELECT * FROM giveaways WHERE guild_id = ? ORDER BY (status = 'active') DESC, id DESC LIMIT ?")
    .all(guildId, limit)
    .map(mapRow);

export const countEntries = (id) => Number(db().prepare("SELECT COUNT(*) AS n FROM giveaway_entries WHERE giveaway_id = ?").get(id).n);

// One entry per person: the first press joins, the next one leaves
export function toggleEntry(id, userId) {
  const handle = db();
  const gone = handle.prepare("DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?").run(id, userId);
  if (Number(gone.changes) > 0) return { joined: false, count: countEntries(id) };
  handle.prepare("INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)").run(id, userId);
  return { joined: true, count: countEntries(id) };
}

export const dueGiveaways = (now, limit = 500) =>
  db().prepare("SELECT * FROM giveaways WHERE status = 'active' AND ends_at <= ? ORDER BY ends_at LIMIT ?").all(now, limit).map(mapRow);

// Closes a giveaway and draws its winners in one step. The status flip is the guard: only the call that flips it from active
// to ended draws anything, so a second call (a retry, an overlapping tick) changes nothing and returns { closed: false }.
export function closeGiveaway(id, { rng = Math.random } = {}) {
  const handle = db();
  handle.exec("BEGIN IMMEDIATE");
  try {
    const flipped = handle.prepare("UPDATE giveaways SET status = 'ended' WHERE id = ? AND status = 'active'").run(id);
    if (Number(flipped.changes) !== 1) {
      handle.exec("ROLLBACK");
      return { closed: false };
    }
    const row = handle.prepare("SELECT winners FROM giveaways WHERE id = ?").get(id);
    const entrants = handle.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ? ORDER BY user_id").all(id).map((r) => r.user_id);
    const winners = drawWinners(entrants, row.winners, rng);
    handle.prepare("UPDATE giveaways SET winner_ids = ? WHERE id = ?").run(JSON.stringify(winners), id);
    handle.exec("COMMIT");
    return { closed: true, winners, entries: entrants.length };
  } catch (error) {
    try {
      handle.exec("ROLLBACK");
    } catch {
      // the transaction may already be over
    }
    throw error;
  }
}

export const cancelGiveaway = (guildId, id) =>
  Number(db().prepare("UPDATE giveaways SET status = 'cancelled' WHERE id = ? AND guild_id = ? AND status = 'active'").run(id, guildId).changes) === 1;

// Draws new winners among the people who entered and have not won yet. The new ones are added to the stored winners.
export function rerollGiveaway(guildId, id, count, { rng = Math.random } = {}) {
  const handle = db();
  const g = getGiveaway(id);
  if (!g || g.guild_id !== guildId) return { ok: false, reason: "missing" };
  if (g.status !== "ended") return { ok: false, reason: "notEnded" };
  const entrants = handle.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ? ORDER BY user_id").all(id).map((r) => r.user_id);
  const eligible = entrants.filter((u) => !g.winnerIds.includes(u));
  const winners = drawWinners(eligible, Math.min(MAX_WINNERS, Math.max(1, count)), rng);
  if (!winners.length) return { ok: false, reason: "nobody" };
  handle.prepare("UPDATE giveaways SET winner_ids = ? WHERE id = ?").run(JSON.stringify([...g.winnerIds, ...winners]), id);
  return { ok: true, winners, giveaway: g };
}

// ---------- the message ----------

const sec = (ms) => Math.floor(ms / 1000);

export function buildGiveawayPayload(g, { entries = 0 } = {}) {
  const embed = new EmbedBuilder().setColor(0xf5c518);
  if (g.status === "active") {
    embed
      .setTitle(lines.embedTitle(g.prize))
      .setDescription(lines.embedBody(g.host_id, g.winners, sec(g.ends_at), g.roleId))
      .setFooter({ text: lines.footer });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`quatang:join:${g.id}`).setLabel(lines.buttonJoin).setEmoji("🎉").setStyle(ButtonStyle.Success));
    return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
  }
  if (g.status === "cancelled") embed.setTitle(lines.cancelledTitle(g.prize)).setColor(0x95a5a6).setDescription(`Người tổ chức: <@${g.host_id}>`);
  else {
    embed
      .setTitle(lines.endedTitle(g.prize))
      .setColor(0x95a5a6)
      .setDescription(`${g.winnerIds.length ? lines.endedWinners(g.winnerIds) : lines.endedNobody}\nNgười tổ chức: <@${g.host_id}>`)
      .setFooter({ text: `${entries} người tham gia` });
  }
  return { embeds: [embed], components: [], allowedMentions: { parse: [] } };
}

// ---------- pressing ----------

export async function handleGiveawayPress(interaction, [action, idText], { now = Date.now() } = {}) {
  const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  if (action !== "join" || !interaction.guildId) return;
  const g = getGiveaway(Number(idText));
  if (!g || g.guild_id !== interaction.guildId) return reply(lines.pressGone);
  if (g.status !== "active" || now >= g.ends_at) return reply(lines.pressEnded);
  if (interaction.user?.bot) return reply(lines.pressBot);
  // The required role is checked at the moment of the press, not when the giveaway was made
  if (g.roleId && !interaction.member?.roles?.cache?.has(g.roleId)) return reply(lines.pressNeedRole(g.roleId));
  const result = toggleEntry(g.id, interaction.user.id);
  return reply(result.joined ? lines.joined(result.count) : lines.left(result.count));
}
