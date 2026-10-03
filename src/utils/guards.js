import { PermissionFlagsBits } from "discord.js";

const needed = {
  ManageChannels: "Quản lý kênh",
  ManageRoles: "Quản lý role",
  ManageGuild: "Quản lý server",
  ViewChannel: "Xem kênh",
  SendMessages: "Gửi tin nhắn",
  EmbedLinks: "Nhúng liên kết",
};

// Returns the Vietnamese names of permissions the bot is missing in this server
export function missingBotPermissions(guild) {
  const me = guild.members.me;
  if (!me) return Object.values(needed);
  if (me.permissions.has(PermissionFlagsBits.Administrator)) return [];
  return Object.entries(needed)
    .filter(([flag]) => !me.permissions.has(PermissionFlagsBits[flag]))
    .map(([, label]) => label);
}

export function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

// Guilds currently under construction, so two /build runs never overlap
const building = new Set();
export const lock = {
  tryAcquire(guildId) {
    if (building.has(guildId)) return false;
    building.add(guildId);
    return true;
  },
  release(guildId) {
    building.delete(guildId);
  },
};
