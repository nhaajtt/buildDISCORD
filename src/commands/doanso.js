import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { WIN_POINTS, guess, startRound } from "../games/doanso.js";
import { awardGamePoints, levelFor } from "../games/points.js";
import { applyLevelRoles } from "../games/levelroles.js";
import { gateFeature } from "../utils/gate.js";
import * as lines from "../humor/games.js";

export default {
  data: new SlashCommandBuilder()
    .setName("doanso")
    .setDescription("Đoán số từ 1 đến 100: gõ không kèm số để mở vòng mới, kèm số để đoán")
    .setDMPermission(false)
    .addIntegerOption((option) => option.setName("so").setDescription("Số bạn đoán, từ 1 đến 100").setMinValue(1).setMaxValue(100)),

  async execute(interaction) {
    const blocked = gateFeature(interaction.guildId, "games");
    if (blocked) return interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });

    const number = interaction.options.getInteger("so");
    if (number === null) {
      const round = startRound(interaction.guildId);
      return interaction.reply({ content: round.started ? lines.guessStart(round.expiresAt) : lines.guessRunning(round.attempts) });
    }

    const result = guess(interaction.guildId, number);
    if (result.status === "none") return interaction.reply({ content: lines.guessNone, flags: MessageFlags.Ephemeral });
    if (result.status === "expired") return interaction.reply({ content: lines.guessExpired(result.secret) });
    if (result.status === "higher") return interaction.reply({ content: lines.guessHigher(result.attempts) });
    if (result.status === "lower") return interaction.reply({ content: lines.guessLower(result.attempts) });

    const award = awardGamePoints(interaction.guildId, interaction.user.id, WIN_POINTS);
    const extra = award.capped && !award.granted ? `\n${lines.capped}` : "";
    await interaction.reply({ content: lines.guessWin(interaction.user.id, result.attempts, award.granted) + extra, allowedMentions: { parse: [] } });
    if (award.granted && levelFor(award.after).index !== levelFor(award.before).index) {
      await applyLevelRoles(interaction.guild, interaction.member, award.after);
    }
  },
};
