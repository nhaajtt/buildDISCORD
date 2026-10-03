import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { createLicense, grant, planCounts, revoke, PLANS } from "../license.js";
import { recentOrders } from "../pay/orders.js";
import { funnel } from "../analytics.js";

const DAY = 24 * 60 * 60 * 1000;
const FUNNEL_DAYS = 30;
const FUNNEL_STEPS = [
  ["invite", "Mời bot vào server"],
  ["wizard_done", "Chạy xong /batdau"],
  ["build_done", "Dựng server xong"],
  ["trial", "Dùng thử Pro"],
  ["paid", "Trả tiền"],
];

// Servers that reached each step, and what share of the invited servers that is. Pure: the funnel numbers in, an embed out.
export function funnelEmbed(data, days = FUNNEL_DAYS) {
  const invited = data?.invite?.servers ?? 0;
  const rows = FUNNEL_STEPS.map(([kind, label], index) => {
    const servers = data?.[kind]?.servers ?? 0;
    const percent = index === 0 ? "" : invited > 0 ? `, ${Math.round((servers / invited) * 100)}% số server được mời` : ", chưa có server nào được mời";
    return `**${label}:** ${servers}${percent}`;
  });
  const features = data?.feature_on?.events ?? 0;
  return new EmbedBuilder()
    .setColor(0xf5c518)
    .setTitle(`📈 Phễu ${days} ngày qua`)
    .setDescription(`${rows.join("\n")}\n\nTính năng được bật qua /batdau: ${features} lần`);
}

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
    .addSubcommand((sub) => sub.setName("thongke").setDescription("Số server theo từng gói và phễu 30 ngày"))
    .addSubcommand((sub) => sub.setName("donhang").setDescription("10 đơn thanh toán gần nhất")),

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
    if (sub === "donhang") {
      const rows = recentOrders(10);
      if (!rows.length) return reply("Chưa có đơn thanh toán nào.");
      return reply(rows.map((o) => `\`${o.order_code}\` ${o.plan} ${o.days} ngày, ${o.provider === "stripe" ? `$${(o.amount / 100).toFixed(2)}` : `${o.amount.toLocaleString("vi-VN")}đ`}, ${o.status}, server ${o.guild_id}, <t:${Math.floor(o.created_at / 1000)}:R>`).join("\n"));
    }
    const counts = planCounts(interaction.client.guilds.cache.keys());
    const content = `Bot đang ở ${interaction.client.guilds.cache.size} server: ${counts.free} miễn phí, ${counts.pro} Pro, ${counts.plus} Plus.`;
    return interaction.reply({ content, embeds: [funnelEmbed(funnel(Date.now() - FUNNEL_DAYS * DAY))], flags: MessageFlags.Ephemeral });
  },
};
