import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { runModAction } from "../modlog/actions.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Cấm một người vào server và ghi vào hồ sơ")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addUserOption((o) => o.setName("nguoi").setDescription("Người bị cấm").setRequired(true))
    .addStringOption((o) => o.setName("lydo").setDescription("Lý do (tối đa 300 ký tự)").setRequired(true).setMinLength(1).setMaxLength(300))
    .addIntegerOption((o) => o.setName("xoatin").setDescription("Xoá tin nhắn của họ trong bao nhiêu ngày gần nhất (0 đến 7)").setMinValue(0).setMaxValue(7)),
  execute: (interaction) => runModAction(interaction, "ban"),
};
