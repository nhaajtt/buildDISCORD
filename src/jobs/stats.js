import { cleanText } from "../activity/text.js";
import { getSection, patchSection } from "../settings.js";
import { getPlan } from "../license.js";
import { lines } from "../humor/stats.js";
import { sweepTempVoice } from "../tempvoice/rooms.js";

// Discord lets a channel be renamed twice per 10 minutes. The job runs every 10 minutes and renames a channel only when its text
// changed and its last rename was at least 10 minutes ago (a couple of seconds of timer jitter are forgiven).
export const RENAME_GAP_MS = 10 * 60 * 1000;
const JITTER_MS = 2000;
const UNKNOWN_CHANNEL = 10003;
// discord.js queues a rename that hits the per-channel limit instead of failing, which could hold the whole round (and the
// temp room sweep after it) for up to ten minutes. A rename that takes longer than this is left to finish on its own.
export const RENAME_WAIT_MS = 20_000;

function withTimeout(promise, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("rename is taking too long, moving on")), ms);
    timer.unref?.();
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
export const KINDS = ["members", "boosts", "channels", "roles"];

// When each channel was last renamed. Lost on restart, which is safe: nothing is renamed unless its text changed.
const lastRename = new Map();
const MAX_TRACKED = 2000;

// The live number for a kind. @everyone is not counted as a role.
export function statValue(guild, kind) {
  if (kind === "members") return Math.max(0, Number(guild.memberCount) || 0);
  if (kind === "boosts") return Math.max(0, Number(guild.premiumSubscriptionCount) || 0);
  if (kind === "channels") return guild.channels?.cache?.size ?? 0;
  if (kind === "roles") return Math.max(0, (guild.roles?.cache?.size ?? 1) - 1);
  return 0;
}

// Template to a channel name: {n} (every occurrence) becomes the number, cleaned and capped at 100
export const renderStat = (template, n) => cleanText(String(template ?? "").replaceAll("{n}", String(n)), 100);

export const canRename = (channelId, now) => {
  const at = lastRename.get(channelId);
  return at === undefined || now - at >= RENAME_GAP_MS - JITTER_MS;
};

function remember(channelId, now) {
  if (lastRename.size >= MAX_TRACKED) lastRename.delete(lastRename.keys().next().value);
  lastRename.set(channelId, now);
}

// Forgets the throttle of a channel that is no longer listed
export const forgetStat = (channelId) => lastRename.delete(channelId);

// The names of what the bot lacks to rename this channel, empty when fine
export function missingToRename(guild, channel) {
  const perms = channel.permissionsFor?.(guild.members?.me);
  if (!perms) return ["Xem kênh", "Quản lý kênh"];
  const out = [];
  if (!perms.has("ViewChannel")) out.push("Xem kênh");
  if (!perms.has("ManageChannels")) out.push("Quản lý kênh");
  return out;
}

async function findChannel(guild, channelId) {
  const cached = guild.channels.cache.get(channelId);
  if (cached) return cached;
  try {
    return (await guild.channels.fetch(channelId)) ?? null;
  } catch (error) {
    return error?.code === UNKNOWN_CHANNEL ? null : undefined;
  }
}

// One server: updates the listed channels whose number changed. Returns what was renamed. Only listed channels are ever touched.
export async function updateGuildStats(guild, { now = Date.now() } = {}) {
  const settings = getSection(guild.id, "stats");
  if (!settings.enabled || !settings.channels.length) return { renamed: [], dropped: [] };
  const allowed = settings.channels.slice(0, getPlan(guild.id).statsChannels);
  const renamed = [];
  const dropped = [];

  for (const entry of allowed) {
    try {
      const channel = await findChannel(guild, entry.channelId);
      if (channel === undefined) continue;
      if (channel === null) {
        dropped.push(entry.channelId);
        continue;
      }
      if (!channel.isVoiceBased?.()) continue;
      const wanted = renderStat(entry.template, statValue(guild, entry.kind));
      if (!wanted || channel.name === wanted) continue;
      if (!canRename(channel.id, now)) continue;
      if (missingToRename(guild, channel).length) continue;
      // The clock starts before the call, so a failed or slow rename is not retried in a hurry
      remember(channel.id, now);
      await withTimeout(channel.setName(wanted, lines.reason), RENAME_WAIT_MS);
      renamed.push(channel.id);
    } catch (error) {
      console.error(`Stats channel ${entry.channelId} not updated:`, error.message);
    }
  }

  if (dropped.length) {
    const fresh = getSection(guild.id, "stats");
    patchSection(guild.id, "stats", { channels: fresh.channels.filter((c) => !dropped.includes(c.channelId)) });
    for (const id of dropped) forgetStat(id);
  }
  return { renamed, dropped };
}

export async function runStats(client, { now = Date.now() } = {}) {
  let renamed = 0;
  for (const guild of client.guilds.cache.values()) {
    if (guild.available === false) continue;
    try {
      renamed += (await updateGuildStats(guild, { now })).renamed.length;
    } catch (error) {
      console.error(`Stats for ${guild.id} failed:`, error.message);
    }
  }
  return renamed;
}

// The same ten-minute round also sweeps temporary voice rooms: rooms left empty by a restart are removed and rows for rooms
// deleted by hand are forgotten. Live emptying is handled by the voice event, this is the safety net.
export default {
  name: "stats",
  everyMs: RENAME_GAP_MS,
  async run(client) {
    try {
      await runStats(client);
    } finally {
      await sweepTempVoice(client);
    }
  },
};
