import { MessageFlags, PermissionFlagsBits as P } from "discord.js";
import { getSection } from "../settings.js";
import { onboardingLines } from "../humor/onboarding.js";
import { buildWelcomePost, wantsVerify } from "./format.js";
import { isSafeRole } from "./safety.js";

const REASON = "Chào người mới";

const botTop = (guild) => guild.members?.me?.roles?.highest?.position ?? -1;

async function findRole(guild, roleId) {
  return guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
}

// Gives a role only if it is still safe right now: a role can be edited after it was configured.
// Returns "given", "already", "missing", "unsafe" or "failed"; it never throws.
export async function giveRole(guild, member, roleId) {
  const role = await findRole(guild, roleId);
  if (!role) return "missing";
  if (!isSafeRole(role, botTop(guild))) return "unsafe";
  if (member.roles.cache.has(roleId)) return "already";
  try {
    await member.roles.add(role, REASON);
    return "given";
  } catch {
    return "failed";
  }
}

// Taking a role away is always allowed to be attempted, but a failure is only reported
export async function takeRole(guild, member, roleId) {
  if (!member.roles.cache.has(roleId)) return "absent";
  const role = await findRole(guild, roleId);
  if (!role) return "missing";
  try {
    await member.roles.remove(role, REASON);
    return "removed";
  } catch {
    return "failed";
  }
}

async function findChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
}

function canPost(guild, channel) {
  if (!channel || typeof channel.send !== "function") return false;
  if (typeof channel.isTextBased === "function" && !channel.isTextBased()) return false;
  if (typeof channel.permissionsFor !== "function") return true;
  return Boolean(channel.permissionsFor(guild.members?.me)?.has([P.ViewChannel, P.SendMessages]));
}

// Welcomes one member who just joined. Safe to call twice for the same member: roles are only added when missing.
export async function welcomeMember(guild, userId, { settings = getSection(guild.id, "welcome"), rng } = {}) {
  if (!settings.enabled) return { status: "disabled" };
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { status: "gone" };

  const result = { status: "welcomed", role: null, channelId: null };
  if (settings.newbieRoleId) result.role = await giveRole(guild, member, settings.newbieRoleId);

  let channel = await findChannel(guild, settings.channelId);
  if (!canPost(guild, channel)) channel = canPost(guild, guild.systemChannel) ? guild.systemChannel : null;
  if (!channel) return { ...result, status: "no-channel" };

  try {
    await channel.send(buildWelcomePost(settings, { userId, serverName: guild.name, rng }));
    result.channelId = channel.id;
  } catch {
    return { ...result, status: "send-failed" };
  }
  return result;
}

// The verify button: only the member it was posted for can press it
export async function verifyMember(interaction, userId) {
  const refuse = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (interaction.user.id !== userId) return refuse(onboardingLines.wrongUser);
  const { guild } = interaction;
  const settings = getSection(guild.id, "welcome");
  if (!wantsVerify(settings)) return refuse(onboardingLines.verifyOff);

  const member = (await guild.members.fetch(userId).catch(() => null)) ?? interaction.member;
  if (!member) return refuse(onboardingLines.verifyNoMember);

  const given = await giveRole(guild, member, settings.verifyRoleId);
  if (given === "missing" || given === "unsafe") return refuse(onboardingLines.verifyRoleGone);
  if (given === "failed") return refuse(onboardingLines.verifyFailed);

  if (settings.newbieRoleId) await takeRole(guild, member, settings.newbieRoleId);
  return interaction.update({ content: onboardingLines.verified(userId), components: [] });
}
