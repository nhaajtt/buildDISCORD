import { PermissionFlagsBits as P } from "discord.js";

// Pure decisions for anti-nuke: count deletions per person, and pick which dangerous roles may be taken away.

export const DANGEROUS = ["Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "ManageWebhooks", "BanMembers", "KickMembers"];

export function createNukeCounter({ now = Date.now, cooldownMs = 30_000, maxKeys = 2000 } = {}) {
  const stamps = new Map();
  const quietUntil = new Map();
  return {
    // Counts one deletion by `executorId`. Trips at `threshold` deletions inside `windowSec`, then is quiet for the cooldown.
    record(guildId, executorId, { threshold, windowSec }) {
      const key = `${guildId}:${executorId}`;
      const at = now();
      if ((quietUntil.get(key) ?? 0) > at) return { tripped: false, count: 0, cooling: true };
      const live = (stamps.get(key) ?? []).filter((t) => at - t < windowSec * 1000);
      live.push(at);
      if (live.length >= threshold) {
        stamps.delete(key);
        quietUntil.set(key, at + cooldownMs);
        return { tripped: true, count: live.length };
      }
      stamps.set(key, live);
      if (stamps.size > maxKeys) {
        for (const [k, list] of stamps) if (!list.some((t) => at - t < windowSec * 1000)) stamps.delete(k);
        for (const [k, until] of quietUntil) if (until <= at) quietUntil.delete(k);
      }
      return { tripped: false, count: live.length };
    },
  };
}

// Whose deletions are never acted on: the server owner (their server) and the bot itself (/nuke, /build, tickets, backups)
export function ignoreExecutor({ executorId, ownerId, botId }) {
  if (!executorId) return "unknown";
  if (executorId === botId) return "bot";
  if (executorId === ownerId) return "owner";
  return null;
}

export const isDangerousRole = (role) => DANGEROUS.some((name) => role.permissions?.has?.(P[name]));

// Roles of the executor that may be removed, and the dangerous ones that must stay with the reason.
// Never the @everyone role, a managed role, or any role at or above the bot's top role.
export function pickStrippable(roles, { guildId, botHighest }) {
  const strip = [];
  const kept = [];
  for (const role of roles) {
    if (role.id === guildId || !isDangerousRole(role)) continue;
    if (role.managed) kept.push({ role, why: "managed" });
    else if (role.position >= botHighest) kept.push({ role, why: "above" });
    else strip.push(role);
  }
  return { strip, kept };
}

// Can the bot act against this member at all: not the owner, not the bot, not above the bot
export function memberRefusal({ memberId, ownerId, botId, memberHighest, botHighest }) {
  if (memberId === ownerId) return "owner";
  if (memberId === botId) return "bot";
  if (memberHighest >= botHighest) return "above";
  return null;
}
