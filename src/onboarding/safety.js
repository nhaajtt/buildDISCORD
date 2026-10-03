import { PermissionFlagsBits as P } from "discord.js";

// A role handed out automatically to strangers must never be able to run the server, so anything that could hurt is forbidden
export const FORBIDDEN_PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageRoles",
  "ManageChannels",
  "ManageWebhooks",
  "ManageMessages",
  "BanMembers",
  "KickMembers",
  "ModerateMembers",
  "MentionEveryone",
];

const toBits = (permissions) => {
  try {
    return BigInt(permissions?.bitfield ?? permissions ?? 0);
  } catch {
    return 0n;
  }
};

// Why a role may not be handed out: "missing", "managed", "everyone", "above" or "dangerous" (with the permission names), or null when it is fine
export function roleProblem(role, botTopRolePosition) {
  if (!role || typeof role !== "object") return { code: "missing" };
  if (role.managed) return { code: "managed" };
  if (role.name === "@everyone" || (role.guild?.id && role.id === role.guild.id) || role.isEveryone) return { code: "everyone" };
  const top = Number(botTopRolePosition);
  if (!Number.isFinite(top) || !(Number(role.position) < top)) return { code: "above" };
  const bits = toBits(role.permissions);
  const names = FORBIDDEN_PERMISSIONS.filter((name) => (bits & P[name]) !== 0n);
  if (names.length) return { code: "dangerous", names };
  return null;
}

export const isSafeRole = (role, botTopRolePosition) => roleProblem(role, botTopRolePosition) === null;
