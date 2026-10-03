import { ChannelType, PermissionFlagsBits } from "discord.js";
import { config } from "../config.js";
import { loadRecord, saveRecord } from "../store.js";
import { textChannelName } from "../ai/validate.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Bits removed from every restored role, and extra bits removed when the file came from another server
const ALWAYS = PermissionFlagsBits.Administrator;
const FOREIGN_ROLE = [
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.MentionEveryone,
].reduce((mask, bit) => mask | bit, 0n);
// The ones that also mean something inside a channel overwrite
const FOREIGN_OVERWRITE = [
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.MentionEveryone,
].reduce((mask, bit) => mask | bit, 0n);

export const isForeign = (snapshot, guildId) => snapshot.sourceGuildId !== String(guildId);

export function rolePermissions(bits, foreign) {
  return BigInt(bits) & ~(ALWAYS | (foreign ? FOREIGN_ROLE : 0n));
}

export function overwritePermissions(bits, foreign) {
  return BigInt(bits) & ~(ALWAYS | (foreign ? FOREIGN_OVERWRITE : 0n));
}

// The comparison key of a channel: Discord lowercases text names, so a text channel "Chat Chung" is the same as "chat-chung"
const channelKey = (type, parent, name) => `${type}|${parent ?? ""}|${type === "text" ? textChannelName(name) : name}`;

// Reads what a server already has, in the shape planRestore wants
export function describeExisting(guild) {
  const all = [...guild.channels.cache.values()];
  const categoryName = new Map(all.filter((c) => c.type === ChannelType.GuildCategory).map((c) => [c.id, c.name]));
  return {
    roles: [...guild.roles.cache.values()].map((r) => r.name),
    categories: [...categoryName.values()],
    channels: all
      .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice)
      .map((c) => ({ type: c.type === ChannelType.GuildVoice ? "voice" : "text", parent: categoryName.get(c.parentId) ?? null, name: c.name })),
  };
}

// What a restore would create and what is already there. Pure: nothing is touched.
export function planRestore(snapshot, existing) {
  const haveRoles = new Set(existing.roles);
  const haveCategories = new Set(existing.categories);
  const haveChannels = new Set(existing.channels.map((c) => channelKey(c.type, c.parent, c.name)));
  const split = (items, has) => ({ missing: items.filter((i) => !has(i)), present: items.filter((i) => has(i)) });
  const roles = split(snapshot.roles, (r) => haveRoles.has(r.name));
  const categories = split(snapshot.categories, (c) => haveCategories.has(c.name));
  const channels = split(snapshot.channels, (c) => haveChannels.has(channelKey(c.type, c.parent, c.name)));
  return {
    roles,
    categories,
    channels,
    counts: { roles: roles.missing.length, categories: categories.missing.length, channels: channels.missing.length },
    nothingToDo: !roles.missing.length && !categories.missing.length && !channels.missing.length,
  };
}

// Creates what is missing. It never deletes and never edits anything that exists, it records every ID it makes so /nuke can undo it,
// and it saves that record even when a step throws.
export async function restoreSnapshot(guild, snapshot, { onProgress = async () => {} } = {}) {
  const foreign = isForeign(snapshot, guild.id);
  const plan = planRestore(snapshot, describeExisting(guild));
  const record = loadRecord(guild.id);
  const total = plan.counts.roles + plan.counts.categories + plan.counts.channels;
  let done = 0;
  const step = async () => {
    done += 1;
    if (total && (done % 3 === 0 || done === total)) await onProgress(done, total);
    await sleep(config.stepDelayMs);
  };

  const roleId = new Map([...guild.roles.cache.values()].map((r) => [r.name, r.id]));
  roleId.set("@everyone", guild.roles.everyone.id);
  const categoryId = new Map();
  for (const c of guild.channels.cache.values()) if (c.type === ChannelType.GuildCategory && !categoryId.has(c.name)) categoryId.set(c.name, c.id);

  const permissionOverwrites = (list) =>
    list
      .filter((o) => roleId.has(o.role))
      .map((o) => ({ id: roleId.get(o.role), allow: overwritePermissions(o.allow, foreign), deny: overwritePermissions(o.deny, foreign) }));
  const reason = "Khôi phục từ bản sao lưu của thầu";

  try {
    for (const def of plan.roles.missing) {
      const role = await guild.roles.create({
        name: def.name,
        colors: { primaryColor: def.color },
        hoist: def.hoist,
        mentionable: def.mentionable,
        permissions: rolePermissions(def.permissions, foreign),
        reason,
      });
      roleId.set(def.name, role.id);
      record.roles.push(role.id);
      await step();
    }

    for (const def of plan.categories.missing) {
      const category = await guild.channels.create({
        name: def.name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: permissionOverwrites(def.overwrites),
        reason,
      });
      categoryId.set(def.name, category.id);
      record.categories.push(category.id);
      await step();
    }

    // A server's top bitrate depends on its boosts, so the value from the file is clamped to what this server allows
    const maxBitrate = guild.maximumBitrate ?? 96000;
    for (const def of plan.channels.missing) {
      const voice = def.type === "voice";
      const options = {
        name: def.name,
        type: voice ? ChannelType.GuildVoice : ChannelType.GuildText,
        permissionOverwrites: permissionOverwrites(def.overwrites),
        reason,
      };
      if (def.parent && categoryId.has(def.parent)) options.parent = categoryId.get(def.parent);
      if (voice) {
        options.bitrate = Math.max(8000, Math.min(def.bitrate, maxBitrate));
        options.userLimit = def.userLimit;
      } else {
        if (def.topic) options.topic = def.topic;
        options.nsfw = def.nsfw;
        options.rateLimitPerUser = def.rateLimitPerUser;
      }
      const channel = await guild.channels.create(options);
      record.channels.push(channel.id);
      await step();
    }
  } finally {
    saveRecord(guild.id, record);
  }

  return { created: plan.counts, present: { roles: plan.roles.present.length, categories: plan.categories.present.length, channels: plan.channels.present.length }, foreign };
}
