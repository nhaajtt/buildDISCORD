import { Events } from "discord.js";
import { activityConfig, grantMessageXp } from "../activity/xp.js";
import { onLevelUp } from "../activity/announce.js";

// Xp for chatting. Uses only who wrote and where, never the text, so it works without the message content intent.
// The checks run from cheapest to dearest: shape of the message, then the cached settings, then the in-memory cooldown;
// the database is only written (in batches) when xp is actually earned.
export async function handleMessageXp(message, { now = Date.now(), config = activityConfig, grant = grantMessageXp, levelUp = onLevelUp } = {}) {
  const author = message?.author;
  if (!author || author.bot || author.system) return null;
  if (message.webhookId || message.system) return null;
  const guild = message.guild;
  if (!guild) return null;

  const cfg = config(guild.id, now);
  if (!cfg.active) return null;

  const result = grant(guild.id, author.id, cfg.settings, { now });
  if (result.granted && result.levelAfter > result.levelBefore) {
    try {
      await levelUp({ guild, userId: author.id, member: message.member ?? null, levelBefore: result.levelBefore, levelAfter: result.levelAfter, settings: cfg.settings });
    } catch (error) {
      console.error("Level-up failed:", error.message);
    }
  }
  return result;
}

export default {
  name: Events.MessageCreate,
  async execute(client, message) {
    try {
      await handleMessageXp(message);
    } catch (error) {
      console.error("Activity xp error:", error);
    }
  },
};
