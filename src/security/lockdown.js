import { ChannelType, PermissionFlagsBits } from "discord.js";

// Pure planning for a lockdown. It decides which channels to change and what to put back; the Discord calls live in guard.js.

export const MAX_CHANNELS = 150;
export const LOCKABLE_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// What the @everyone overwrite of a channel says about SendMessages: "allow", "deny" or "neutral" (no opinion)
export function everyoneSendState(channel, everyoneId) {
  const overwrite = channel.permissionOverwrites?.cache?.get(everyoneId);
  if (overwrite?.allow?.has(PermissionFlagsBits.SendMessages)) return "allow";
  if (overwrite?.deny?.has(PermissionFlagsBits.SendMessages)) return "deny";
  return "neutral";
}

// Channels where @everyone can send right now, with the overwrite state to put back later. Anything else is left alone.
export function planLock(channels, guildId, everyoneRole) {
  const plan = [];
  for (const channel of channels) {
    if (plan.length >= MAX_CHANNELS) break;
    if (!LOCKABLE_TYPES.includes(channel.type)) continue;
    if (channel.manageable === false) continue;
    const state = everyoneSendState(channel, guildId);
    if (state === "deny") continue;
    const canSend = channel.permissionsFor?.(everyoneRole ?? guildId)?.has(PermissionFlagsBits.SendMessages);
    if (!canSend) continue;
    plan.push({ id: channel.id, sendMessages: state });
  }
  return plan;
}

// For each recorded channel: put it back only if it is still exactly as the lockdown left it (SendMessages denied for @everyone).
// A channel that vanished, or that someone changed by hand since, is not ours to touch.
export function planRestore(saved, getChannel, guildId) {
  const restore = [];
  const skipped = [];
  for (const entry of saved) {
    const channel = getChannel(entry.id);
    if (!channel) skipped.push({ id: entry.id, why: "gone" });
    else if (everyoneSendState(channel, guildId) !== "deny") skipped.push({ id: entry.id, why: "changed" });
    else restore.push(entry);
  }
  return { restore, skipped };
}

// Value for permissionOverwrites.edit: null clears the bit, true brings the old allow back
export const restoreValue = (state) => (state === "allow" ? true : null);

// One step up, or null when already at the top (nothing to record, nothing to restore)
export const raisedVerification = (level) => (Number.isInteger(level) && level >= 0 && level < 4 ? level + 1 : null);

// Put the level back only if it is still the one the lockdown set
export const shouldRestoreVerification = (saved, current) => Number.isInteger(saved) && current === saved + 1;

export function lockdownDue(lockdown, lockMinutes, now) {
  return Boolean(lockdown?.active) && now >= lockdown.since + lockMinutes * 60_000;
}
