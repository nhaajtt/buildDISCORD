import { ChannelType, OverwriteType } from "discord.js";

// Version 1 of the file format. A snapshot is plain JSON: it can be stored in the database, exported to a file and imported into another server.
export const SNAPSHOT_VERSION = 1;
export const LIMITS = {
  roles: 250,
  categories: 50,
  // Discord counts categories as channels, so the two share this cap
  channelsTotal: 500,
  overwritesPerTarget: 100,
  name: 100,
  topic: 1024,
  bytes: 400 * 1024,
};

export class BackupError extends Error {}

const bitsOf = (permissions) => {
  if (permissions === undefined || permissions === null) return "0";
  if (typeof permissions === "object" && "bitfield" in permissions) return String(permissions.bitfield);
  return String(permissions);
};

const trimTo = (value, max) => String(value ?? "").slice(0, max);

function overwritesOf(channel, guild) {
  const out = [];
  for (const overwrite of channel.permissionOverwrites?.cache?.values() ?? []) {
    // Member overwrites are skipped: they point at people, who do not exist in another server
    if (overwrite.type !== OverwriteType.Role) continue;
    const role = overwrite.id === guild.id ? { name: "@everyone" } : guild.roles.cache.get(overwrite.id);
    if (!role) continue;
    out.push({ role: trimTo(role.name, LIMITS.name), allow: bitsOf(overwrite.allow), deny: bitsOf(overwrite.deny) });
  }
  return out.slice(0, LIMITS.overwritesPerTarget);
}

export function serialize(snapshot) {
  const text = JSON.stringify(snapshot);
  if (Buffer.byteLength(text) > LIMITS.bytes) throw new BackupError("snapshot too large");
  return text;
}

// Reads the structure of a server (roles, categories, text and voice channels, role overwrites) into a snapshot
export function captureSnapshot(guild, now = Date.now()) {
  const roles = [...guild.roles.cache.values()]
    .filter((role) => !role.managed && role.id !== guild.id && role.name !== "@everyone")
    .sort((a, b) => a.position - b.position)
    .map((role) => ({
      name: trimTo(role.name, LIMITS.name),
      color: role.colors?.primaryColor ?? role.color ?? 0,
      hoist: Boolean(role.hoist),
      mentionable: Boolean(role.mentionable),
      permissions: bitsOf(role.permissions),
    }));
  if (roles.length > LIMITS.roles) throw new BackupError("too many roles");

  const all = [...guild.channels.cache.values()];
  const byPosition = (a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0);
  const categoryChannels = all.filter((c) => c.type === ChannelType.GuildCategory).sort(byPosition);
  const categoryNameById = new Map(categoryChannels.map((c) => [c.id, trimTo(c.name, LIMITS.name)]));
  const categories = categoryChannels.map((c) => ({ name: trimTo(c.name, LIMITS.name), overwrites: overwritesOf(c, guild) }));

  const channelOf = (channel) => {
    const voice = channel.type === ChannelType.GuildVoice;
    const entry = {
      name: trimTo(channel.name, LIMITS.name),
      type: voice ? "voice" : "text",
      parent: categoryNameById.get(channel.parentId) ?? null,
      overwrites: overwritesOf(channel, guild),
    };
    if (voice) {
      entry.bitrate = Number(channel.bitrate) || 64000;
      entry.userLimit = Number(channel.userLimit) || 0;
    } else {
      if (channel.topic) entry.topic = trimTo(channel.topic, LIMITS.topic);
      entry.nsfw = Boolean(channel.nsfw);
      entry.rateLimitPerUser = Number(channel.rateLimitPerUser) || 0;
    }
    return entry;
  };
  const isText = (c) => c.type === ChannelType.GuildText;
  const isVoice = (c) => c.type === ChannelType.GuildVoice;
  // Channels outside any category first, then each category in order, text before voice like Discord lists them
  const parents = [null, ...categoryChannels.map((c) => c.id)];
  const channels = parents.flatMap((parentId) => {
    const inParent = all.filter((c) => (c.parentId ?? null) === parentId);
    return [...inParent.filter(isText).sort(byPosition), ...inParent.filter(isVoice).sort(byPosition)].map(channelOf);
  });

  if (categories.length > LIMITS.categories || categories.length + channels.length > LIMITS.channelsTotal) {
    throw new BackupError("too many channels");
  }

  const snapshot = {
    version: SNAPSHOT_VERSION,
    takenAt: now,
    sourceGuildId: String(guild.id),
    counts: { roles: roles.length, categories: categories.length, channels: channels.length },
    roles,
    categories,
    channels,
  };
  serialize(snapshot);
  return snapshot;
}
