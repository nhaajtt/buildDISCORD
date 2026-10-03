import { Events } from "discord.js";
import { track } from "../analytics.js";

// A server that removes the bot (an outage makes a guild unavailable instead, which is not a removal)
export default {
  name: Events.GuildDelete,
  execute(client, guild) {
    if (guild.available === false) return;
    track(guild.id, "left");
  },
};
