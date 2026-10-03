import { AutoModerationActionType, Events } from "discord.js";
import { track } from "../analytics.js";

// Counts messages AutoMod blocked, for the weekly report. A rule with several actions fires one event per action,
// so only the "block message" action is counted. Nothing but the server id is stored, never who or what was blocked.
export function countBlock(execution) {
  const guildId = execution?.guild?.id ?? execution?.guildId;
  if (!guildId || execution?.action?.type !== AutoModerationActionType.BlockMessage) return false;
  track(guildId, "automod_block");
  return true;
}

export default {
  name: Events.AutoModerationActionExecution,
  execute(client, execution) {
    countBlock(execution);
  },
};
