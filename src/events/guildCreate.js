import { ChannelType, Events, PermissionFlagsBits } from "discord.js";
import { guildJoinLine } from "../humor/lines.js";

export default {
  name: Events.GuildCreate,
  async execute(client, guild) {
    const me = guild.members.me;
    const channel =
      guild.systemChannel ??
      guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages));
    await channel?.send(guildJoinLine).catch(() => {});
  },
};
