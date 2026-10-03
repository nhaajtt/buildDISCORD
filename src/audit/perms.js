import { PermissionFlagsBits as P } from "discord.js";

// Permissions that let someone run, empty or spam a server
export const DANGEROUS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "ManageWebhooks",
  "ManageMessages",
  "KickMembers",
  "BanMembers",
  "MentionEveryone",
  "ModerateMembers",
];

export const MODERATION = ["ModerateMembers", "KickMembers", "ManageMessages"];

export const maskOf = (names) => names.reduce((mask, name) => mask | P[name], 0n);
export const DANGEROUS_MASK = maskOf(DANGEROUS);

export const toBits = (value) => {
  if (typeof value === "bigint") return value;
  try {
    return BigInt(value?.bitfield ?? value ?? 0);
  } catch {
    return 0n;
  }
};

export const namesIn = (bits, names) => names.filter((name) => (bits & P[name]) !== 0n);
export const hasAny = (bits, names) => namesIn(bits, names).length > 0;
