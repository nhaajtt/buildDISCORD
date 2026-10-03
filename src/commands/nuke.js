import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { nukeServer } from "../builder.js";
import { loadRecord } from "../store.js";
import { isAdmin, lock } from "../utils/guards.js";
import * as humor from "../humor/lines.js";

export default {
  data: new SlashCommandBuilder()
    .setName("nuke")
    .setDescription("Đập những gì thầu đã xây (chỉ đụng đồ do bot tạo)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: humor.pick(humor.noPermissionLines), flags: MessageFlags.Ephemeral });
    }
    const record = loadRecord(interaction.guildId);
    const total = record.channels.length + record.categories.length + record.roles.length;
    if (!total) {
      return interaction.reply({ content: humor.nothingToNukeLine, flags: MessageFlags.Ephemeral });
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`nuke:go:${interaction.user.id}`).setLabel("Đập đi").setStyle(ButtonStyle.Danger).setEmoji("💣"),
      new ButtonBuilder().setCustomId(`nuke:no:${interaction.user.id}`).setLabel("Thôi tha cho nó").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content: `💣 Sắp đập **${total}** hạng mục tui đã xây (kênh, danh mục, role). Đồ không phải của tui thì tui không đụng. Chắc chưa?`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleButton(interaction, [action, userId]) {
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: "Nút này của người khác, đừng bấm bậy.", flags: MessageFlags.Ephemeral });
    }
    if (action === "no") {
      return interaction.update({ content: humor.cancelLine, components: [] });
    }
    if (!isAdmin(interaction.member)) {
      return interaction.update({ content: humor.pick(humor.noPermissionLines), components: [] });
    }
    if (!lock.tryAcquire(interaction.guildId)) {
      return interaction.reply({ content: humor.busyLine, flags: MessageFlags.Ephemeral });
    }
    await interaction.update({ content: "💣 Đang đập, tránh xa công trường...", components: [] });
    try {
      // The channel the command ran in is kept: deleting it would cut off this very reply
      const removed = await nukeServer(interaction.guild, interaction.channelId);
      await interaction.editReply({ content: humor.nukeDoneLine(removed) });
    } catch (error) {
      console.error("Nuke failed:", error);
      await interaction.editReply({ content: `💥 Đập không nổi: ${error.message}` });
    } finally {
      lock.release(interaction.guildId);
    }
  },
};
