import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { PLANS, getPlan, getUsage } from "../license.js";
import { config } from "../config.js";

const cap = (n) => (n === Infinity ? "không giới hạn" : String(n));
const yes = (flag) => (flag ? "có" : "không");

export default {
  data: new SlashCommandBuilder().setName("goi").setDescription("Xem gói của server và cách nâng cấp").setDMPermission(false),

  async execute(interaction) {
    const plan = getPlan(interaction.guildId);
    const built = getUsage(interaction.guildId, "build", { lifetime: true });
    const lines = [
      `Gói hiện tại: **${plan.label}**${plan.expiresAt ? `, hạn đến <t:${Math.floor(plan.expiresAt / 1000)}:D>` : plan.unlocked ? ", mở hết mọi tính năng, không giới hạn thời gian" : ""}`,
      `Đã xây: ${built} lần${plan.buildsTotal === Infinity ? "" : ` trên ${plan.buildsTotal}`}`,
    ];
    const table = Object.values(PLANS)
      .map(
        (p) =>
          `**${p.label}**: ${p.mix ? "trộn nhiều theme" : "1 theme"}, xây ${cap(p.buildsTotal)} lần, AI ${cap(p.aiPerMonth)} lượt/tháng, chọn mức hài: ${yes(p.humor)}, backup ${p.backups}, theme riêng ${p.customThemes}, mini-game: ${yes(p.games)}, sự kiện định kỳ ${p.recurringEvents}`,
      )
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle("🏗️ Gói dịch vụ của thầu")
      .setDescription(`${lines.join("\n")}\n\n${table}\n\n${config.contactText}\nMua nhanh bằng \`/mua\` (thanh toán xong gói tự bật), hoặc gõ \`/kichhoat\` nếu đã có mã.`);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
