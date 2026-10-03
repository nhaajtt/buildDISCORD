import { ChannelType, Events, PermissionFlagsBits } from "discord.js";
import { guildJoinLine } from "../humor/lines.js";
import { startPayload } from "../onboarding/wizard.js";
import { track } from "../analytics.js";
import { forgetVoiceGuild } from "./voiceXp.js";

// A guild that became available again after an outage is not a new invite
const FRESH_MS = 2 * 60 * 1000;
const SEND = PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel;

const canWrite = (channel, me) => Boolean(channel?.permissionsFor?.(me)?.has(SEND));

// The system channel when the bot may write there, else the first text channel it can write in
export function pickWelcomeChannel(guild) {
  const me = guild.members?.me;
  if (canWrite(guild.systemChannel, me)) return guild.systemChannel;
  // Without a system channel the bot may have the rights to write in staff-only rooms, so only rooms everybody can see are used
  const everyone = guild.roles?.everyone;
  const open = (c) => !everyone || Boolean(c.permissionsFor?.(everyone)?.has(PermissionFlagsBits.ViewChannel));
  const rooms = [...(guild.channels?.cache?.values?.() ?? [])].filter((c) => c.type === ChannelType.GuildText && canWrite(c, me) && open(c));
  rooms.sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
  return rooms[0] ?? null;
}

export default {
  name: Events.GuildCreate,
  async execute(client, guild) {
    // Also sent again after a reconnect: voice leaves missed meanwhile would leave people counted as still in a room
    forgetVoiceGuild(guild.id);
    const fresh = !guild.joinedTimestamp || Date.now() - guild.joinedTimestamp < FRESH_MS;
    if (!fresh) return;
    track(guild.id, "invite");
    const channel = pickWelcomeChannel(guild);
    const payload = startPayload();
    await channel?.send({ content: guildJoinLine, ...payload }).catch(() => {});
  },
};
