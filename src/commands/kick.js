import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { runModAction } from "../modlog/actions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Đuổi một thành viên ra khỏi server và ghi vào hồ sơ")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName("nguoi").setDescription("Người bị đuổi").setRequired(true))
    .addStringOption((o) => o.setName("lydo").setDescription("Lý do (tối đa 300 ký tự)").setRequired(true).setMinLength(1).setMaxLength(300)),
  execute: (interaction) => runModAction(interaction, "kick"),
};
