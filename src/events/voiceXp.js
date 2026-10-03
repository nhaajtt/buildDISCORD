import { Events } from "discord.js";
import { createVoiceTracker } from "../activity/voice.js";
import { activityConfig, grantVoiceXp } from "../activity/xp.js";
import { onLevelUp } from "../activity/announce.js";

const stateOf = (voice) => ({ channelId: voice.channelId ?? null, deaf: Boolean(voice.selfDeaf || voice.serverDeaf), afk: Boolean(voice.channelId && voice.channelId === voice.guild?.afkChannelId) });

// Voice time from voiceStateUpdate. Join times live in memory only; xp is granted for full minutes when someone leaves or switches.
export async function handleVoiceUpdate(oldState, newState, { tracker, now = Date.now(), config = activityConfig, grant = grantVoiceXp, levelUp = onLevelUp } = {}) {
  const guild = newState?.guild ?? oldState?.guild;
  const member = newState?.member ?? oldState?.member;
  if (!guild || member?.user?.bot) return [];
  const userId = newState?.id ?? oldState?.id;
  if (!userId) return [];

  // Without the feature on there is nothing to track, and nothing is kept in memory
  const cfg = config(guild.id, now());
  if (!cfg.active || !cfg.settings.voiceEnabled) {
    if (tracker.isSeeded(guild.id)) tracker.forgetGuild(guild.id);
    return [];
  }

  if (!tracker.isSeeded(guild.id)) {
    const members = [];
    for (const voice of guild.voiceStates?.cache?.values?.() ?? []) {
      if (voice.member?.user?.bot) continue;
      members.push({ userId: voice.id, ...stateOf(voice) });
    }
    tracker.seed(guild.id, members);
    return [];
  }

  const credits = tracker.update(guild.id, userId, stateOf(newState));
  for (const credit of credits) {
    const result = grant(guild.id, credit.userId, credit.minutes, cfg.settings, { now: now() });
    if (result.granted && result.levelAfter > result.levelBefore) {
      try {
        await levelUp({ guild, userId: credit.userId, member: oldState?.member ?? null, levelBefore: result.levelBefore, levelAfter: result.levelAfter, settings: cfg.settings });
      } catch (error) {
        console.error("Level-up failed:", error.message);
      }
    }
  }
  return credits;
}

const tracker = createVoiceTracker();

export default {
  name: Events.VoiceStateUpdate,
  async execute(client, oldState, newState) {
    try {
      await handleVoiceUpdate(oldState, newState, { tracker, now: Date.now });
    } catch (error) {
      console.error("Voice xp error:", error);
    }
  },
};
