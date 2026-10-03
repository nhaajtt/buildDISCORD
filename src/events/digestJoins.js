import { Events, MessageType } from "discord.js";
import { track } from "../analytics.js";

// Counts joins for the weekly report from Discord's own "member joined" notice, which needs no privileged intent.
// Only the server id is stored. A small memory of recent notice ids keeps a repeated delivery from being counted twice.
const seen = new Set();

export function countJoin(message) {
  if (message?.type !== MessageType.UserJoin) return false;
  const guildId = message.guildId ?? message.guild?.id;
  if (!guildId || !message.author || message.author.bot) return false;
  if (message.id) {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    if (seen.size > 500) seen.delete(seen.values().next().value);
  }
  track(guildId, "join");
  return true;
}

export default {
  name: Events.MessageCreate,
  execute(client, message) {
    countJoin(message);
  },
};
