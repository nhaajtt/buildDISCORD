import { PermissionFlagsBits } from "discord.js";
import { permLabels } from "../humor/digest.js";

// Finds a channel the bot may post in and says what is missing when it may not. Nothing here throws on a missing permission.

const NEEDED = ["ViewChannel", "SendMessages", "EmbedLinks"];

// The first id that is a channel in this server and, when `system` is true, the system channel after that
export function pickChannel(guild, ids = [], { system = true } = {}) {
  for (const id of ids) {
    const channel = id ? guild.channels?.cache?.get(id) : null;
    if (channel && typeof channel.send === "function") return channel;
  }
  const fallback = system ? guild.systemChannel : null;
  return fallback && typeof fallback.send === "function" ? fallback : null;
}

// Vietnamese names of what the bot lacks in this channel
export function missingIn(guild, channel) {
  if (typeof channel?.permissionsFor !== "function") return [];
  const perms = channel.permissionsFor(guild.members?.me);
  if (!perms) return NEEDED.map((n) => permLabels[n]);
  return NEEDED.filter((n) => !perms.has(PermissionFlagsBits[n])).map((n) => permLabels[n]);
}

// Posts with no mentions allowed. Returns { ok } or { ok: false, reason: "channel" | "perms" | "failed", missing }.
export async function postSafe(guild, channel, payload) {
  if (!channel) return { ok: false, reason: "channel", missing: [] };
  const missing = missingIn(guild, channel);
  if (missing.length) return { ok: false, reason: "perms", missing };
  try {
    const message = await channel.send({ ...payload, allowedMentions: { parse: [] } });
    return { ok: true, message };
  } catch (error) {
    console.error("Could not post a report:", error?.message ?? error);
    return { ok: false, reason: "failed", missing: [] };
  }
}
