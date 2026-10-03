import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { runModAction } from "../modlog/actions.js";
import { timeoutChoices } from "../humor/modlog.js";

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Bắt một thành viên ngồi im một lúc và ghi vào hồ sơ")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName("nguoi").setDescription("Người bị timeout").setRequired(true))
    .addIntegerOption((o) => o.setName("thoigian").setDescription("Bao lâu").setRequired(true).addChoices(...timeoutChoices))
    .addStringOption((o) => o.setName("lydo").setDescription("Lý do (tối đa 300 ký tự)").setRequired(true).setMinLength(1).setMaxLength(300)),
  execute: (interaction) => runModAction(interaction, "timeout"),
};
