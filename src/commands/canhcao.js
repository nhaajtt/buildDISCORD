import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { runModAction } from "../modlog/actions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("canhcao")
    .setDescription("Cảnh cáo một thành viên và ghi vào hồ sơ")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName("nguoi").setDescription("Người bị cảnh cáo").setRequired(true))
    .addStringOption((o) => o.setName("lydo").setDescription("Lý do (tối đa 300 ký tự)").setRequired(true).setMinLength(1).setMaxLength(300)),
  execute: (interaction) => runModAction(interaction, "warn"),
};
