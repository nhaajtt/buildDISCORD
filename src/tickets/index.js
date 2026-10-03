import { ActionRowBuilder, ChannelType, EmbedBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } from "discord.js";
import { getSection } from "../settings.js";
import { gateFeature } from "../utils/gate.js";
import { isAdmin } from "../utils/guards.js";
import { ticketLines as lines } from "../humor/tickets.js";
import { REASON_MAX, buildOverwrites, channelName, checkStaffRole, closedRow, createCooldown, openerAccess, permit, ticketRow, validateReason } from "./logic.js";
import { attachChannel, claimRow, closeRow, countActive, discardTicket, getTicket, reopenRow, reserveTicket, dropStalePending } from "./store.js";

// The Discord side of tickets. Every handler re-reads the ticket row and the settings and checks the presser itself:
// custom ids only say which ticket is meant, never that the action is allowed.

let clock = Date.now;
const cooldown = createCooldown({ now: () => clock() });

// Tests swap the clock and start from an empty cooldown table
export function useClock(fn = Date.now) {
  clock = fn;
  cooldown.reset();
}

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const noMentions = { parse: [] };

export const isStaff = (member, settings) => isAdmin(member) || Boolean(settings.staffRoleId && member.roles?.cache?.has(settings.staffRoleId));

async function log(guild, settings, content) {
  if (!settings.logChannelId) return;
  try {
    await guild.channels.cache.get(settings.logChannelId)?.send({ content, allowedMentions: noMentions });
  } catch (error) {
    console.error(`Ticket log failed in ${guild.id}:`, error.message);
  }
}

// Why a person cannot open a ticket right now, or null
function openRefusal(guildId, userId, settings, typeKey) {
  const gate = gateFeature(guildId, "tickets");
  if (gate) return gate;
  if (!settings.enabled || !settings.staffRoleId) return lines.disabled;
  if (!settings.types.some((t) => t.key === typeKey)) return lines.noType;
  const wait = cooldown.remaining(userId);
  if (wait > 0) return lines.cooldown(Math.ceil(wait / 1000));
  if (countActive(guildId, userId) >= settings.maxOpenPerUser) return lines.tooMany(settings.maxOpenPerUser);
  return null;
}

// Panel button: check the cheap limits, then ask for the reason
export async function startOpen(interaction, typeKey) {
  const settings = getSection(interaction.guildId, "tickets");
  const refusal = openRefusal(interaction.guildId, interaction.user.id, settings, typeKey);
  if (refusal) return interaction.reply(ephemeral(refusal));
  const type = settings.types.find((t) => t.key === typeKey);
  const modal = new ModalBuilder()
    .setCustomId(`ticket:modal:${typeKey}`)
    .setTitle(lines.openModalTitle(type.label))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel(lines.reasonLabel).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(REASON_MAX),
      ),
    );
  return interaction.showModal(modal);
}

export async function submitOpen(interaction, typeKey) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { guild, guildId, user } = interaction;
  const settings = getSection(guildId, "tickets");
  const refusal = openRefusal(guildId, user.id, settings, typeKey);
  if (refusal) return interaction.editReply(refusal);
  const reason = validateReason(interaction.fields.getTextInputValue("reason"));
  if (!reason.ok) return interaction.editReply(lines.badReason);

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels) || !me.permissions.has(PermissionFlagsBits.ManageRoles)) return interaction.editReply(lines.noPerms);

  const type = settings.types.find((t) => t.key === typeKey);
  const staffRole = guild.roles.cache.get(settings.staffRoleId);
  const category = settings.categoryId ? guild.channels.cache.get(settings.categoryId) : null;
  const now = clock();
  cooldown.mark(user.id);
  const { id, number } = reserveTicket({ guildId, userId: user.id, type: type.key, now });

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName(number, interaction.member?.displayName ?? user.username),
      type: ChannelType.GuildText,
      parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
      topic: `Ticket #${number}: ${type.label}`.slice(0, 1024),
      permissionOverwrites: buildOverwrites({ guildId, openerId: user.id, staffRoleId: checkStaffRole(staffRole, guildId) ? staffRole.id : null, botId: me.id }),
      reason: `Ticket #${number}`,
    });
  } catch (error) {
    console.error(`Ticket channel failed in ${guildId}:`, error.message);
    discardTicket(id);
    return interaction.editReply(error?.code === 50013 ? lines.noPerms : lines.createFailed);
  }
  attachChannel(id, channel.id);

  try {
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`🎫 Ticket #${number}`)
      .setDescription(reason.value)
      .addFields({ name: "Loại", value: `${type.emoji} ${type.label}`.trim(), inline: true }, { name: "Người mở", value: `<@${user.id}>`, inline: true })
      .setFooter({ text: lines.ticketFooter(number) });
    await channel.send({
      content: lines.welcome(user.id, checkStaffRole(staffRole, guildId) ? staffRole.id : null),
      embeds: [embed],
      components: [ticketRow(id)],
      allowedMentions: { users: [user.id], roles: checkStaffRole(staffRole, guildId) ? [staffRole.id] : [] },
    });
  } catch (error) {
    console.error(`Ticket first message failed in ${guildId}:`, error.message);
  }
  await log(guild, settings, lines.logOpened(number, type.label, user.id));
  return interaction.editReply(lines.opened(channel.id));
}

// The row for this button, only when it exists, belongs to this server and this channel, and the presser may do the action
async function verified(interaction, idText, action) {
  const ticket = getTicket(Number(idText));
  if (!ticket || ticket.guild_id !== interaction.guildId || ticket.channel_id !== interaction.channelId) {
    await interaction.reply(ephemeral(lines.stale));
    return null;
  }
  const settings = getSection(interaction.guildId, "tickets");
  const staff = isStaff(interaction.member, settings);
  const refusal = permit(action, { ticket, userId: interaction.user.id, staff });
  if (refusal) {
    await interaction.reply(ephemeral(refusal === "alreadyClaimed" ? lines.alreadyClaimed(ticket.claimed_by) : lines[refusal]));
    return null;
  }
  return { ticket, settings };
}

// Shared by the buttons, the modal and the auto-close job. Returns false when the ticket was not open any more.
export async function closeTicket(guild, channel, ticket, { by, reason = null, settings = getSection(guild.id, "tickets") } = {}) {
  if (!closeRow(ticket.id, clock(), reason).changes) return false;
  try {
    await channel.permissionOverwrites.delete(ticket.user_id, "Ticket đã đóng");
  } catch (error) {
    console.error(`Removing opener access failed in ${guild.id}:`, error.message);
  }
  try {
    await channel.send({ content: lines.closedNotice(by, reason), components: [closedRow(ticket.id)], allowedMentions: noMentions });
  } catch (error) {
    console.error(`Close notice failed in ${guild.id}:`, error.message);
  }
  await log(guild, settings, lines.logClosed(ticket.id, by));
  return true;
}

export async function claim(interaction, idText) {
  const ok = await verified(interaction, idText, "claim");
  if (!ok) return;
  claimRow(ok.ticket.id, interaction.user.id);
  await interaction.update({ components: [ticketRow(ok.ticket.id, { claimed: true })] });
  await interaction.followUp({ content: lines.claimed(interaction.user.id), allowedMentions: noMentions });
  await log(interaction.guild, ok.settings, lines.logClaimed(ok.ticket.id, interaction.user.id));
}

export async function closeNow(interaction, idText, reason = null) {
  const ok = await verified(interaction, idText, "close");
  if (!ok) return;
  const closed = await closeTicket(interaction.guild, interaction.channel, ok.ticket, { by: interaction.user.id, reason, settings: ok.settings });
  return interaction.reply(ephemeral(closed ? lines.closedReply : lines.alreadyClosed));
}

export async function askCloseReason(interaction, idText) {
  const ok = await verified(interaction, idText, "close");
  if (!ok) return;
  const modal = new ModalBuilder()
    .setCustomId(`ticket:closemodal:${ok.ticket.id}`)
    .setTitle(lines.closeModalTitle)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId("reason").setLabel(lines.closeReasonLabel).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(REASON_MAX),
      ),
    );
  return interaction.showModal(modal);
}

export async function submitClose(interaction, idText) {
  const reason = validateReason(interaction.fields.getTextInputValue("reason"));
  if (!reason.ok) return interaction.reply(ephemeral(lines.badReason));
  return closeNow(interaction, idText, reason.value);
}

export async function reopen(interaction, idText) {
  const ok = await verified(interaction, idText, "reopen");
  if (!ok) return;
  if (!reopenRow(ok.ticket.id).changes) return interaction.reply(ephemeral(lines.notClosed));
  let restored = true;
  try {
    await interaction.channel.permissionOverwrites.edit(ok.ticket.user_id, openerAccess, { reason: "Ticket mở lại" });
  } catch (error) {
    restored = false;
  }
  await interaction.update({ components: [] });
  await interaction.channel.send({ content: lines.reopened(interaction.user.id), components: [ticketRow(ok.ticket.id)], allowedMentions: noMentions });
  if (!restored) await interaction.followUp(ephemeral(lines.reopenFailed));
  await log(interaction.guild, ok.settings, lines.logReopened(ok.ticket.id, interaction.user.id));
}

export async function deleteChannel(interaction, idText) {
  const ok = await verified(interaction, idText, "delete");
  if (!ok) return;
  await log(interaction.guild, ok.settings, lines.logDeleted(ok.ticket.id, interaction.user.id));
  await interaction.reply(ephemeral(lines.deleting));
  // The row stays as history
  await interaction.channel.delete(`Ticket #${ok.ticket.id} đã xoá`);
}

// Rows reserved by a crash are not worth keeping after ten minutes
export const cleanPending = () => dropStalePending(clock() - 10 * 60_000);
