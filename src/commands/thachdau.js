import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder } from "discord.js";
import { DUEL_TTL_MS, MOVES, TIE_POINTS, WIN_POINTS, cancelDuel, chooseMove, createDuel, isPending } from "../games/rps.js";
import { awardGamePoints, levelFor } from "../games/points.js";
import { applyLevelRoles } from "../games/levelroles.js";
import { gateFeature } from "../utils/gate.js";
import * as lines from "../humor/games.js";

const moveRow = (id) =>
  new ActionRowBuilder().addComponents(
    MOVES.map((move) => new ButtonBuilder().setCustomId(`thachdau:${id}:${move}`).setLabel(lines.moveLabel(move)).setStyle(ButtonStyle.Primary)),
  );

// A member may have left by the time the result is in; a missing member just means no level role change
async function rankUp(guild, userId, award) {
  if (!award.granted || levelFor(award.after).index === levelFor(award.before).index) return;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (member) await applyLevelRoles(guild, member, award.after);
}

export default {
  data: new SlashCommandBuilder()
    .setName("thachdau")
    .setDescription("Thách một người đấu kéo búa bao, thắng thì lấy điểm vui")
    .setDMPermission(false)
    .addUserOption((option) => option.setName("nguoi").setDescription("Đối thủ của bạn").setRequired(true)),

  async execute(interaction) {
    const blocked = gateFeature(interaction.guildId, "games");
    if (blocked) return interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser("nguoi");
    if (target.id === interaction.user.id) return interaction.reply({ content: lines.pick(lines.duelSelf), flags: MessageFlags.Ephemeral });
    if (target.bot) return interaction.reply({ content: lines.duelBot, flags: MessageFlags.Ephemeral });

    const id = createDuel({ guildId: interaction.guildId, challengerId: interaction.user.id, targetId: target.id });
    await interaction.reply({
      content: lines.duelStart(interaction.user.id, target.id),
      components: [moveRow(id)],
      allowedMentions: { users: [target.id] },
    });

    // Nobody has to press anything for the duel to end: after two minutes the buttons are taken away
    setTimeout(async () => {
      if (!isPending(id)) return;
      cancelDuel(id);
      await interaction.editReply({ content: lines.duelTimeout, components: [] }).catch(() => {});
    }, DUEL_TTL_MS + 1000).unref();
  },

  async handleComponent(interaction, [id, move]) {
    const result = chooseMove(id, interaction.user.id, move);
    const private_ = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (result.status === "missing") return private_(lines.duelGone);
    if (result.status === "expired") return interaction.update({ content: lines.duelTimeout, components: [] });
    if (result.status === "stranger") return private_(lines.duelStranger);
    if (result.status === "invalid") return private_(lines.duelGone);
    if (result.status === "locked") return private_(lines.duelLocked(result.move));
    if (result.status === "waiting") return private_(lines.duelWaiting(result.move));

    // Both have chosen
    const guildId = interaction.guildId;
    let grants;
    if (result.tie) {
      const a = awardGamePoints(guildId, result.challengerId, TIE_POINTS);
      const b = awardGamePoints(guildId, result.targetId, TIE_POINTS);
      grants = { tie: Math.max(a.granted, b.granted) };
      await interaction.update({ content: lines.duelResult(result, grants), components: [], allowedMentions: { parse: [] } });
      await rankUp(interaction.guild, result.challengerId, a);
      await rankUp(interaction.guild, result.targetId, b);
      return;
    }
    const win = awardGamePoints(guildId, result.winnerId, WIN_POINTS);
    grants = { win: win.granted };
    await interaction.update({ content: lines.duelResult(result, grants), components: [], allowedMentions: { parse: [] } });
    await rankUp(interaction.guild, result.winnerId, win);
  },
};
