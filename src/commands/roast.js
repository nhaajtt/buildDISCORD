import { MessageFlags, SlashCommandBuilder } from "discord.js";
import * as humor from "../humor/lines.js";

export default {
  data: new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Roast nhẹ một thành viên cho vui")
    .setDMPermission(false)
    .addUserOption((option) => option.setName("nguoi").setDescription("Nạn nhân hôm nay").setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser("nguoi");
    if (target.id === interaction.user.id) return interaction.reply({ content: humor.roastSelf, flags: MessageFlags.Ephemeral });
    if (target.bot) return interaction.reply({ content: humor.roastBot, flags: MessageFlags.Ephemeral });
    await interaction.reply({
      content: humor.pick(humor.roasts).replace("{user}", `<@${target.id}>`),
      allowedMentions: { users: [target.id] },
    });
  },
};
