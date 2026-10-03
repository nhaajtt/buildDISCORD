import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { countCases, listCases } from "../modlog/cases.js";
import { modLines as lines } from "../humor/modlog.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hoso")
    .setDescription("Xem hồ sơ vi phạm của một thành viên (10 dòng gần nhất)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName("nguoi").setDescription("Thành viên cần xem").setRequired(true)),

  async execute(interaction) {
    const reply = (payload) => interaction.reply({ allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral, ...payload });
    if (!interaction.guildId) return reply({ content: lines.noGuild });
    if (!interaction.member?.permissions?.has(PermissionFlagsBits.ModerateMembers)) return reply({ content: lines.noPermission("ModerateMembers") });
    const target = interaction.options.getUser("nguoi");
    if (!target) return reply({ content: lines.notMember });

    const rows = listCases(interaction.guildId, target.id, 10);
    if (!rows.length) return reply({ content: lines.hosoEmpty(target.id) });
    const embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`${lines.hosoTitle}`)
      .setDescription(`<@${target.id}>\n${rows.map(lines.hosoLine).join("\n")}`.slice(0, 4000))
      .setFooter({ text: lines.hosoFooter(rows.length, countCases(interaction.guildId, target.id)) });
    return reply({ embeds: [embed] });
  },
};
