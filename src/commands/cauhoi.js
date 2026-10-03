import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder } from "discord.js";
import { ROUND_TTL_MS, WIN_POINTS, answerTrivia, closeRound, isOpen, startTrivia } from "../games/trivia.js";
import { awardGamePoints, levelFor } from "../games/points.js";
import { applyLevelRoles } from "../games/levelroles.js";
import { gateFeature } from "../utils/gate.js";
import * as lines from "../humor/games.js";

const LETTERS = ["A", "B", "C", "D"];

// The four answer buttons. When the round is over they stay on screen, disabled, with the right one in green.
function answerRow(roundId, question, { over = false } = {}) {
  return new ActionRowBuilder().addComponents(
    question.options.map((option, i) => {
      const button = new ButtonBuilder().setCustomId(`cauhoi:${roundId}:${i}`).setLabel(`${LETTERS[i]}. ${option}`).setDisabled(over);
      return button.setStyle(over && i === question.answer ? ButtonStyle.Success : ButtonStyle.Secondary);
    }),
  );
}

export default {
  data: new SlashCommandBuilder().setName("cauhoi").setDescription("Mở một câu hỏi nhanh, ai bấm đúng đầu tiên thì lấy điểm vui").setDMPermission(false),

  async execute(interaction) {
    const blocked = gateFeature(interaction.guildId, "games");
    if (blocked) return interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });

    const round = startTrivia(interaction.guildId);
    if (!round.started) return interaction.reply({ content: lines.triviaRunning, flags: MessageFlags.Ephemeral });

    await interaction.reply({ content: lines.triviaIntro(round.question, round.expiresAt), components: [answerRow(round.roundId, round.question)] });

    // If nobody answers in time, show the answer and take the buttons away
    setTimeout(async () => {
      if (!isOpen(round.roundId)) return;
      closeRound(round.roundId);
      const text = lines.triviaTimeout(round.question.options[round.question.answer]);
      await interaction.editReply({ content: `🧠 ${round.question.q}\n${text}`, components: [answerRow(round.roundId, round.question, { over: true })] }).catch(() => {});
    }, ROUND_TTL_MS + 1000).unref();
  },

  async handleComponent(interaction, [roundId, choice]) {
    const result = answerTrivia(roundId, interaction.user.id, Number(choice));
    const private_ = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (result.status === "missing") return private_(lines.triviaGone);
    if (result.status === "closed") return private_(lines.triviaClosed);
    if (result.status === "tried") return private_(lines.triviaTried);
    if (result.status === "wrong") return private_(lines.pick(lines.triviaWrong));

    const answerText = result.question.options[result.correctIndex];
    const over = answerRow(roundId, result.question, { over: true });
    if (result.status === "expired") {
      return interaction.update({ content: `🧠 ${result.question.q}\n${lines.triviaTimeout(answerText)}`, components: [over] });
    }

    const award = awardGamePoints(interaction.guildId, interaction.user.id, WIN_POINTS);
    await interaction.update({
      content: `🧠 ${result.question.q}\n${lines.triviaCorrect(interaction.user.id, answerText, award.granted)}`,
      components: [over],
      allowedMentions: { parse: [] },
    });
    if (award.granted && levelFor(award.after).index !== levelFor(award.before).index) {
      await applyLevelRoles(interaction.guild, interaction.member, award.after);
    }
  },
};
