import { EmbedBuilder } from "discord.js";
import { getDb } from "../db.js";
import { PLANS, addUsage, getPlan, getUsage, isUnlocked } from "../license.js";
import { getSection } from "../settings.js";
import { pickChannel, postSafe } from "../digest/channel.js";
import { DAY } from "../digest/schedule.js";
import { planLines } from "../humor/digest.js";

export const WARN_DAYS = 3;
// A plan that ended longer ago than this is not announced (the bot was away or the server only just got the bot back)
export const ENDED_WINDOW_DAYS = 7;

// The last moment each server's paid time runs out, for servers that ever redeemed a code
function lastExpiries() {
  return getDb()
    .prepare("SELECT guild_id AS guildId, MAX(expires_at) AS expiresAt FROM licenses WHERE guild_id IS NOT NULL AND expires_at IS NOT NULL GROUP BY guild_id")
    .all()
    .map((r) => ({ guildId: r.guildId, expiresAt: Number(r.expiresAt) }));
}

// Which plan was the last to run out, for the wording
function planAt(guildId, expiresAt) {
  const row = getDb().prepare("SELECT plan FROM licenses WHERE guild_id = ? AND expires_at = ? LIMIT 1").get(guildId, expiresAt);
  return PLANS[row?.plan]?.label ?? "trả phí";
}

// The reminder is remembered in the lifetime usage counters under a key that includes the expiry time, so a renewal gets its own
// reminders later and the same expiry is never announced twice. The mark is written before posting.
const key = (kind, expiresAt) => `expiry:${kind}:${expiresAt}`;
const seen = (guildId, kind, expiresAt) => getUsage(guildId, key(kind, expiresAt), { lifetime: true }) > 0;
const mark = (guildId, kind, expiresAt, now) => addUsage(guildId, key(kind, expiresAt), { lifetime: true, now });

const embedOf = ({ title, description }) => new EmbedBuilder().setColor(0xf5c518).setTitle(title).setDescription(description).setFooter({ text: planLines.footer });

function destination(guild) {
  const ids = [getSection(guild.id, "digest").channelId, getSection(guild.id, "security").alertChannelId];
  return pickChannel(guild, ids, { system: true });
}

export async function runExpiryJob(client, { now = Date.now() } = {}) {
  const posted = [];
  for (const { guildId, expiresAt } of lastExpiries()) {
    try {
      if (isUnlocked(guildId)) continue;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      let kind = null;
      if (expiresAt > now && expiresAt - now <= WARN_DAYS * DAY) kind = "soon";
      else if (expiresAt <= now && now - expiresAt <= ENDED_WINDOW_DAYS * DAY && getPlan(guildId, now).rank === 0) kind = "ended";
      if (!kind || seen(guildId, kind, expiresAt)) continue;
      mark(guildId, kind, expiresAt, now);
      const label = planAt(guildId, expiresAt);
      const text = kind === "soon" ? planLines.soon(label, Math.max(1, Math.ceil((expiresAt - now) / DAY)), Math.floor(expiresAt / 1000)) : planLines.ended(label);
      const result = await postSafe(guild, destination(guild), { embeds: [embedOf(text)] });
      if (result.ok) posted.push({ guildId, kind });
    } catch (error) {
      console.error(`Plan reminder for ${guildId} failed:`, error?.message ?? error);
    }
  }
  return posted;
}

export default {
  name: "expiry",
  everyMs: 60 * 60 * 1000,
  run: (client) => runExpiryJob(client),
};
