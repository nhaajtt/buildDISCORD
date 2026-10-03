import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { PLANS, redeem } from "../license.js";
import { isAdmin } from "../utils/guards.js";
import * as humor from "../humor/lines.js";

const failures = {
  unknown: "Mã này không có trong sổ của thầu. Kiểm tra lại từng ký tự, đừng đoán mò.",
  used: "Mã này đã có server khác xài rồi. Mã chỉ dùng một lần, thầu không phát hai lần cho hai nhà.",
  mine: "Mã này server bạn kích hoạt rồi. Bấm thêm cũng không giàu hơn đâu.",
};

export default {
  data: new SlashCommandBuilder()
    .setName("kichhoat")
    .setDescription("Kích hoạt gói trả phí cho server bằng mã bạn đã mua")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((option) => option.setName("ma").setDescription("Mã kích hoạt, dạng THAU-XXXX-XXXX-XXXX").setRequired(true)),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: humor.pick(humor.noPermissionLines), flags: MessageFlags.Ephemeral });
    }
    const result = redeem(interaction.options.getString("ma"), interaction.guildId);
    if (!result.ok) {
      return interaction.reply({ content: failures[result.reason], flags: MessageFlags.Ephemeral });
    }
    const until = Math.floor(result.expiresAt / 1000);
    await interaction.reply({
      content: `✅ Kích hoạt gói **${PLANS[result.plan].label}** thành công. Hạn dùng đến <t:${until}:D>. Cảm ơn đại ca đã ủng hộ thầu.`,
    });
  },
};
