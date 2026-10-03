import { Events } from "discord.js";
import { track } from "../analytics.js";
import { clearActivityCache } from "../activity/xp.js";
import { forgetVoiceGuild } from "./voiceXp.js";

// A server that removes the bot (an outage makes a guild unavailable instead, which is not a removal)
export default {
  name: Events.GuildDelete,
  execute(client, guild) {
    // Whatever the reason, what was kept in memory about the server is stale
    forgetVoiceGuild(guild.id);
    clearActivityCache(guild.id);
    if (guild.available === false) return;
    track(guild.id, "left");
  },
};
