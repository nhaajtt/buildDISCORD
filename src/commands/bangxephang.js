import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { leaderboard, levelFor } from "../games/points.js";
import { gateFeature } from "../utils/gate.js";
import * as lines from "../humor/games.js";

const medals = ["🥇", "🥈", "🥉"];

export default {
  data: new SlashCommandBuilder().setName("bangxephang").setDescription("Xem 10 người nhiều điểm vui nhất server").setDMPermission(false),

  async execute(interaction) {
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
