import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { checkIn, levelFor } from "../games/points.js";
import { applyLevelRoles } from "../games/levelroles.js";
import { gateFeature } from "../utils/gate.js";
import * as lines from "../humor/games.js";

export default {
  data: new SlashCommandBuilder().setName("diemdanh").setDescription("Điểm danh mỗi ngày để lấy điểm vui và giữ chuỗi").setDMPermission(false),

  async execute(interaction) {
    const blocked = gateFeature(interaction.guildId, "games");
    if (blocked) return interaction.reply({ content: blocked, flags: MessageFlags.Ephemeral });

    const result = checkIn(interaction.guildId, interaction.user.id);
    if (result.status === "already") {
      return interaction.reply({ content: lines.pick(lines.checkinAlready), flags: MessageFlags.Ephemeral });
    }

    const before = levelFor(result.before);
    const after = levelFor(result.after);
    const text = [
      lines.checkinDone(result.points, result.bonus, result.streak),
      lines.totalLine(result.after, after.name, after.next),
      after.index > before.index || result.before === 0 ? lines.levelUp(after.name) : null,
    ]
      .filter(Boolean)
      .join("\n");
    await interaction.reply({ content: text, allowedMentions: { parse: [] } });
    await applyLevelRoles(interaction.guild, interaction.member, result.after);
  },
};
