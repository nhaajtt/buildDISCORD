import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { clearRecord } from "../store.js";
import { clearSettings, getSection } from "../settings.js";
import { purgeGuildData } from "../purge.js";
import { stopLockdown } from "../security/guard.js";
import { removeAutomod } from "../automod/index.js";
import { isAdmin } from "../utils/guards.js";
import * as humor from "../humor/lines.js";

export default {
  data: new SlashCommandBuilder()
    .setName("xoadulieu")
    .setDescription("Xoá dữ liệu bot lưu về server này (không xoá kênh hay role trên Discord)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: humor.pick(humor.noPermissionLines), flags: MessageFlags.Ephemeral });
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`xoadulieu:go:${interaction.user.id}`).setLabel("Xoá dữ liệu").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`xoadulieu:no:${interaction.user.id}`).setLabel("Thôi giữ lại").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content:
        "Thầu sẽ quên danh sách kênh và role đã xây (nên `/nuke` sẽ không còn biết đập gì), cài đặt, điểm và cấp độ, hồ sơ cảnh cáo, giveaway, bình chọn, menu role, ticket, backup và theme riêng. Kênh và role trên Discord vẫn còn. Giấy phép, số lần dùng và đơn thanh toán vẫn được giữ để tính gói. Chắc chưa?",
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleButton(interaction, [action, userId]) {
    if (interaction.user.id !== userId) {
      return interaction.reply({ content: "Nút này của người khác, đừng bấm bậy.", flags: MessageFlags.Ephemeral });
    }
    if (action === "no") return interaction.update({ content: humor.cancelLine, components: [] });
    if (!isAdmin(interaction.member)) {
      return interaction.update({ content: humor.pick(humor.noPermissionLines), components: [] });
    }
    // The AutoMod rules the bot made are removed first, because clearing the settings drops the ids that say which rules are its own
    const automod = await removeAutomod(interaction.guild);
    // an active lockdown is lifted first, because the record of what it changed is about to be erased
    if (getSection(interaction.guildId, "security").lockdown.active) await stopLockdown(interaction.guild, { reason: "Xoá dữ liệu" }).catch(() => {});
    clearSettings(interaction.guildId);
    clearRecord(interaction.guildId);
    purgeGuildData(interaction.guildId);
    const leftover = automod.left > 0 ? ` Còn ${automod.left} luật AutoMod chưa xoá được, vào cài đặt server để xoá tay.` : "";
    await interaction.update({ content: `Đã quên sạch. Thầu giờ không biết gì về server này nữa.${leftover}`, components: [] });
  },
};
