import { PermissionFlagsBits as P } from "discord.js";
import { getSection } from "../settings.js";

const TOGGLES = { ban: "logBans", timeout: "logTimeouts", role: "logRoles", automod: "logAutomod" };

// Posts one embed to the mod log channel. `kind` picks the switch that must be on, "case" (the bot's own commands) needs only the log itself.
// Returns true when posted. A missing channel or permission is a quiet no.
export async function postModLog(guild, embed, kind = "case") {
  try {
    const settings = getSection(guild.id, "modlog");
    if (!settings.enabled || !settings.channelId) return false;
    if (TOGGLES[kind] && !settings[TOGGLES[kind]]) return false;
    const channel = guild.channels?.cache?.get(settings.channelId);
    if (!channel?.send) return false;
    const perms = channel.permissionsFor?.(guild.members?.me);
    if (perms && !(perms.has(P.ViewChannel) && perms.has(P.SendMessages) && perms.has(P.EmbedLinks))) return false;
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    console.error("Could not post to the mod log:", error.message);
    return false;
  }
}

// Bans the bot itself carried out are logged as cases already, so the ban event that follows is not logged a second time
const recent = new Map();
const TTL = 60_000;

export function markBotAction(guildId, userId, kind, now = Date.now()) {
  recent.set(`${guildId}:${userId}:${kind}`, now);
  if (recent.size > 500) for (const [key, at] of recent) if (now - at > TTL) recent.delete(key);
}

export function wasBotAction(guildId, userId, kind, now = Date.now()) {
  const at = recent.get(`${guildId}:${userId}:${kind}`);
  return at !== undefined && now - at < TTL;
}
