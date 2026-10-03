import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { PLANS, getPlan, getUsage } from "../license.js";
import { config } from "../config.js";
import { planFlagLabels, planLines } from "../humor/wizard.js";

const cap = (n) => (n === Infinity ? "không giới hạn" : String(n));
const yes = (flag) => (flag ? "có" : "không");

// One line per plan, including the flags and counts added with security, activity, giveaways, digest, the AI helper and role menus
export function planTable() {
  return Object.values(PLANS)
    .map((p) => {
      const flags = Object.entries(planFlagLabels).map(([key, label]) => `${label}: ${yes(p[key])}`);
      return `**${p.label}**: ${p.mix ? "trộn nhiều theme" : "1 theme"}, xây ${cap(p.buildsTotal)} lần, AI ${cap(p.aiPerMonth)} lượt/tháng, chọn mức hài: ${yes(p.humor)}, backup ${p.backups}, theme riêng ${p.customThemes}, mini-game: ${yes(p.games)}, sự kiện định kỳ ${p.recurringEvents}, menu role ${p.roleMenus}, ${flags.join(", ")}`;
    })
    .join("\n");
}

export default {
  data: new SlashCommandBuilder().setName("goi").setDescription("Xem gói của server và cách nâng cấp").setDMPermission(false),

  async execute(interaction) {
    const plan = getPlan(interaction.guildId);
    const built = getUsage(interaction.guildId, "build", { lifetime: true });
    const lines = [
      `Gói hiện tại: **${plan.label}**${plan.expiresAt ? `, hạn đến <t:${Math.floor(plan.expiresAt / 1000)}:D>` : plan.unlocked ? ", mở hết mọi tính năng, không giới hạn thời gian" : ""}`,
      `Đã xây: ${built} lần${plan.buildsTotal === Infinity ? "" : ` trên ${plan.buildsTotal}`}`,
    ];

    const embed = new EmbedBuilder()
      .setColor(0xf5c518)
      .setTitle(planLines.title)
      .setDescription(`${lines.join("\n")}\n\n${planTable()}\n\n${planLines.prices.join("\n")}\n\n${config.contactText}\n${planLines.buy}`.slice(0, 4000));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
