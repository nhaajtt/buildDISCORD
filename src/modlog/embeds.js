import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { modLines as lines } from "../humor/modlog.js";

// Compact mod log embeds. Each builder reads only the fields it names, so a richer object (an AutoMod execution carries the
// message text, for one) can be passed in without any of that text ever reaching the embed.

const clip = (value, max) => String(value ?? "").replace(/\r/g, "").trim().slice(0, max);
const user = (id) => `<@${clip(id, 25).replace(/[^0-9]/g, "")}> (${clip(id, 25).replace(/[^0-9]/g, "")})`;
const stamp = (ms) => `<t:${Math.floor(Number(ms) / 1000) || 0}:f>`;

export function caseEmbed(c) {
  const fields = [
    { name: lines.fieldUser, value: user(c.user_id), inline: true },
    { name: lines.fieldMod, value: user(c.mod_id), inline: true },
  ];
  if (c.until) fields.push({ name: lines.fieldUntil, value: stamp(c.until), inline: true });
  fields.push({ name: lines.fieldReason, value: clip(c.reason, 300) || lines.noReason });
  return new EmbedBuilder().setColor(0xe67e22).setTitle(lines.logCaseTitle(c)).addFields(fields).setTimestamp(c.at ?? Date.now());
}

export function banEmbed({ userId, reason, banned = true }) {
  const fields = [{ name: lines.fieldUser, value: user(userId), inline: true }];
  if (banned) fields.push({ name: lines.fieldReason, value: clip(reason, 300) || lines.noReason });
  return new EmbedBuilder()
    .setColor(banned ? 0xc0392b : 0x2ecc71)
    .setTitle(banned ? lines.logBanTitle : lines.logUnbanTitle)
    .addFields(fields)
    .setTimestamp();
}

// Which permission bits differ between two role permission sets, by name
export function diffPermissions(oldBits, newBits) {
  const before = new PermissionsBitField(BigInt(oldBits));
  const after = new PermissionsBitField(BigInt(newBits));
  // a.missing(b) lists what b has and a lacks
  // Administrator makes missing() answer nothing, so ask without that shortcut
  return { added: before.missing(after, false), removed: after.missing(before, false) };
}

export function roleEmbed({ roleId, roleName, added, removed }) {
  const list = (names) => (names.length ? names.slice(0, 15).join(", ") + (names.length > 15 ? ` +${names.length - 15}` : "") : "-");
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(lines.logRoleTitle)
    .addFields(
      { name: lines.fieldRole, value: `<@&${clip(roleId, 25).replace(/[^0-9]/g, "")}> ${clip(roleName, 60)}` },
      { name: lines.fieldAdded, value: list(added) },
      { name: lines.fieldRemoved, value: list(removed) },
    )
    .setTimestamp();
}

// Rule name, who and where. Never the message.
export function automodEmbed({ ruleName, ruleTriggerType, userId, channelId }) {
  const fields = [
    { name: lines.fieldUserAm, value: user(userId), inline: true },
    { name: lines.fieldChannel, value: channelId ? `<#${clip(channelId, 25).replace(/[^0-9]/g, "")}>` : "-", inline: true },
    { name: lines.fieldRule, value: clip(ruleName, 100) || "-" },
  ];
  const trigger = lines.triggers[ruleTriggerType];
  if (trigger) fields.push({ name: lines.fieldTrigger, value: trigger, inline: true });
  return new EmbedBuilder().setColor(0xf1c40f).setTitle(lines.logAutomodTitle).addFields(fields).setFooter({ text: lines.noContentNote }).setTimestamp();
}
