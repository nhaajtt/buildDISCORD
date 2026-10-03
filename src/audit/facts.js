import { toBits } from "./perms.js";

// A plain description of a server, readable by the rule engine without touching Discord again.
// Permission fields are bigints, so facts are not meant to be stored as JSON.

const text = (value) => (typeof value === "string" ? value : "");
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const idOrNull = (value) => (typeof value === "string" && value ? value : null);

export function toFacts(guild) {
  const roles = [...(guild.roles?.cache?.values() ?? [])].map((role) => ({
    id: String(role.id),
    name: text(role.name),
    position: num(role.position) ?? 0,
    managed: Boolean(role.managed),
    isEveryone: role.id === guild.id,
    permissions: toBits(role.permissions),
  }));

  const channels = [...(guild.channels?.cache?.values() ?? [])].map((channel) => ({
    id: String(channel.id),
    name: text(channel.name),
    type: num(channel.type),
    parentId: idOrNull(channel.parentId),
    overwrites: [...(channel.permissionOverwrites?.cache?.values() ?? [])].map((o) => ({
      id: String(o.id),
      type: num(o.type),
      allow: toBits(o.allow),
      deny: toBits(o.deny),
    })),
  }));

  return {
    guildId: guild.id,
    name: text(guild.name),
    memberCount: num(guild.memberCount),
    verificationLevel: num(guild.verificationLevel),
    explicitContentFilter: num(guild.explicitContentFilter),
    mfaLevel: num(guild.mfaLevel),
    systemChannelId: idOrNull(guild.systemChannelId),
    rulesChannelId: idOrNull(guild.rulesChannelId),
    roles,
    channels,
    counts: { roles: roles.length, channels: channels.length },
  };
}

// Reads a guild over the API (roles and channels are refreshed first) into facts
export async function readFacts(guild) {
  await Promise.all([guild.roles?.fetch?.().catch(() => {}), guild.channels?.fetch?.().catch(() => {})]);
  return toFacts(guild);
}
