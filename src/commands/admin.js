import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { createLicense, grant, planCounts, revoke, PLANS } from "../license.js";

const planOption = (option) =>
  option
    .setName("goi")
    .setDescription("Gói")
    .setRequired(true)
    .addChoices({ name: "Pro", value: "pro" }, { name: "Plus", value: "plus" });
const daysOption = (option) => option.setName("ngay").setDescription("Số ngày").setRequired(true).setMinValue(1).setMaxValue(3650);
const guildOption = (option) => option.setName("server").setDescription("ID server").setRequired(true);

// Owner-only tools. Everything is answered privately and gated on OWNER_IDS, not on server permissions.
export default {
  data: new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Công cụ của chủ bot")
    .setDefaultMemberPermissions(0n)
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName("taoma").setDescription("Tạo mã kích hoạt dùng một lần").addStringOption(planOption).addIntegerOption(daysOption))
    .addSubcommand((sub) =>
      sub.setName("cap").setDescription("Cấp gói thẳng cho một server").addStringOption(guildOption).addStringOption(planOption).addIntegerOption(daysOption),
    )
    .addSubcommand((sub) => sub.setName("thuhoi").setDescription("Kết thúc gói trả phí của một server").addStringOption(guildOption))
    .addSubcommand((sub) => sub.setName("thongke").setDescription("Số server theo từng gói")),

  async execute(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!config.ownerIds.includes(interaction.user.id)) return reply("Lệnh này chỉ dành cho chủ bot.");

    const sub = interaction.options.getSubcommand();
    if (sub === "taoma") {
      const code = createLicense(interaction.options.getString("goi"), interaction.options.getInteger("ngay"));
      return reply(`Mã mới: \`${code}\``);
    }
    if (sub === "cap") {
      const result = grant(interaction.options.getString("server"), interaction.options.getString("goi"), interaction.options.getInteger("ngay"));
      return reply(`Đã cấp gói **${PLANS[result.plan].label}** đến <t:${Math.floor(result.expiresAt / 1000)}:D>.`);
    }
    if (sub === "thuhoi") {
      return reply(`Đã kết thúc ${revoke(interaction.options.getString("server"))} giấy phép.`);
    }
    const counts = planCounts(interaction.client.guilds.cache.keys());
    return reply(`Bot đang ở ${interaction.client.guilds.cache.size} server: ${counts.free} miễn phí, ${counts.pro} Pro, ${counts.plus} Plus.`);
  },
};
