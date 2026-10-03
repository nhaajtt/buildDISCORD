import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { TRIAL_DAYS, startTrial } from "../license.js";
import { isAdmin } from "../utils/guards.js";
import * as humor from "../humor/lines.js";

const failures = {
  used: "Server này đã dùng thử một lần rồi. Thầu chỉ cho thử một lần, muốn xài tiếp thì gõ `/mua`.",
  paid: "Server đang có gói trả phí rồi, không cần dùng thử.",
  unlocked: "Server này đã mở khoá hết mọi tính năng, không cần dùng thử.",
};

export default {
  data: new SlashCommandBuilder()
    .setName("dungthu")
    .setDescription(`Dùng thử gói Pro ${TRIAL_DAYS} ngày miễn phí, mỗi server một lần`)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: humor.pick(humor.noPermissionLines), flags: MessageFlags.Ephemeral });
    }
    const result = startTrial(interaction.guildId);
    if (!result.ok) return interaction.reply({ content: failures[result.reason], flags: MessageFlags.Ephemeral });
    await interaction.reply({
      content: `🎁 Đã mở gói **Pro** dùng thử ${TRIAL_DAYS} ngày, hạn đến <t:${Math.floor(result.expiresAt / 1000)}:D>. Thử trộn theme, AutoMod mức vừa và gắt, ticket, backup. Hết hạn server tự về gói miễn phí, những gì đã xây vẫn ở lại.`,
    });
  },
};
