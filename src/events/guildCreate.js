import { ChannelType, Events, PermissionFlagsBits } from "discord.js";
import { guildJoinLine } from "../humor/lines.js";
import { startPayload } from "../onboarding/wizard.js";
import { track } from "../analytics.js";

// A guild that became available again after an outage is not a new invite
const FRESH_MS = 2 * 60 * 1000;
const SEND = PermissionFlagsBits.SendMessages | PermissionFlagsBits.ViewChannel;

const canWrite = (channel, me) => Boolean(channel?.permissionsFor?.(me)?.has(SEND));

// The system channel when the bot may write there, else the first text channel it can write in
export function pickWelcomeChannel(guild) {
  const me = guild.members?.me;
  if (canWrite(guild.systemChannel, me)) return guild.systemChannel;
  return guild.channels?.cache?.find((c) => c.type === ChannelType.GuildText && canWrite(c, me)) ?? null;
}

export default {
  name: Events.GuildCreate,
  async execute(client, guild) {
    const fresh = !guild.joinedTimestamp || Date.now() - guild.joinedTimestamp < FRESH_MS;
    if (!fresh) return;
    track(guild.id, "invite");
    const channel = pickWelcomeChannel(guild);
    const payload = startPayload();
    await channel?.send({ content: guildJoinLine, ...payload }).catch(() => {});
  },
};
