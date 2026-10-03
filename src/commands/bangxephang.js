import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { leaderboard, levelFor } from "../games/points.js";
import { gateFeature } from "../utils/gate.js";
import { xpLeaderboard } from "../activity/xp.js";
import { levelForXp } from "../activity/level.js";
import { lines as activityLines } from "../humor/activity.js";
import * as lines from "../humor/games.js";

const medals = ["🥇", "🥈", "🥉"];

export default {
  data: new SlashCommandBuilder()
    .setName("bangxephang")
    .setDescription("Xem 10 người nhiều điểm nhất server")
    .setDMPermission(false)
    .addStringOption((o) =>
      o
        .setName("loai")
        .setDescription("Bảng nào: điểm danh và mini-game, hay điểm hoạt động chat và voice")
        .addChoices({ name: "Điểm danh và mini-game", value: "diem" }, { name: "Hoạt động chat và voice", value: "hoatdong" }),
    ),

  async execute(interaction) {
    if (interaction.options?.getString?.("loai") === "hoatdong") {
      const gated = gateFeature(interaction.guildId, "activity");
      if (gated) return interaction.reply({ content: gated, flags: MessageFlags.Ephemeral });
      const top = xpLeaderboard(interaction.guildId, 10);
      if (!top.length) return interaction.reply({ content: activityLines.nobody, flags: MessageFlags.Ephemeral });
      const text = top.map((row, i) => `${medals[i] ?? `**${i + 1}.**`} <@${row.userId}>: ${row.xp} điểm, cấp ${levelForXp(row.xp)}`).join("\n");
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf5c518).setTitle(activityLines.bangTitle).setDescription(text)], allowedMentions: { parse: [] } });
    }

    const blocked = gateFeature(interaction.guildId, "games");
    if (blocked) return interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });

    const rows = leaderboard(interaction.guildId, 10);
    if (!rows.length) return interaction.reply({ content: lines.boardEmpty, flags: MessageFlags.Ephemeral });

    const body = rows
      .map((row, i) => `${medals[i] ?? `**${i + 1}.**`} <@${row.userId}>: ${row.points} điểm, ${levelFor(row.points).name}`)
      .join("\n");
    // Mentions inside an embed never notify anyone, they only show the name
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf5c518).setTitle(lines.boardTitle).setDescription(body)], allowedMentions: { parse: [] } });
  },
};
