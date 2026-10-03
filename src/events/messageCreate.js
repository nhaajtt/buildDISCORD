import { Events, MessageType } from "discord.js";
import { welcomeMember } from "../onboarding/index.js";
import { handleRaidJoin } from "../security/guard.js";

// Discord posts a "member joined" notice for every join, so a raid would turn into a flood of welcomes.
// This keeps the ids it has seen and caps how many welcomes one server gets per window.
export function createJoinFilter({ limit = 10, windowMs = 60_000, remember = 500, now = Date.now } = {}) {
  const seen = new Set();
  const stamps = new Map();

  const recent = (guildId, at) => (stamps.get(guildId) ?? []).filter((t) => at - t < windowMs);

  return {
    accept(message) {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      if (seen.size > remember) seen.delete(seen.values().next().value);

      const at = now();
      const guildId = message.guildId ?? message.guild?.id;
      const live = recent(guildId, at);
      const allowed = live.length < limit;
      if (allowed) live.push(at);
      stamps.set(guildId, live);
      if (!allowed) return false;
      // Servers that went quiet would otherwise stay in the map forever
      if (stamps.size > 1000) for (const key of stamps.keys()) if (!recent(key, at).length) stamps.delete(key);
      return true;
    },
  };
}

export async function handleJoinMessage(message, filter, welcome = welcomeMember) {
  if (message?.type !== MessageType.UserJoin || !message.guild) return false;
  if (!message.author || message.author.bot) return false;
  if (!filter.accept(message)) return false;
  try {
    await welcome(message.guild, message.author.id);
  } catch (error) {
    console.error("Welcome error:", error);
  }
  return true;
}

const filter = createJoinFilter();

export default {
  name: Events.MessageCreate,
  async execute(client, message) {
    // The raid counter sees every join, while the welcome filter caps how many welcomes go out
    await handleRaidJoin(message);
    await handleJoinMessage(message, filter);
  },
};
