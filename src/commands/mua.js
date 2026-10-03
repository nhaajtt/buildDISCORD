import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { PLANS } from "../license.js";
import { alert } from "../alerts.js";
import { PayError, createPaymentLink, payosEnabled } from "../pay/payos.js";
import { DAY_CHOICES, PRICES_USD, amountVnd, closeOrder, createOrder, describeOrder, newOrderCode, setCheckoutUrl } from "../pay/orders.js";
import { isAdmin } from "../utils/guards.js";
import * as humor from "../humor/lines.js";

const vnd = (n) => `${n.toLocaleString("vi-VN")}đ`;

export default {
  data: new SlashCommandBuilder()
    .setName("mua")
    .setDescription("Mua hoặc gia hạn gói Pro, Plus cho server bằng chuyển khoản, gói tự bật khi tiền về")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName("goi").setDescription("Gói muốn mua").setRequired(true).addChoices({ name: "Pro", value: "pro" }, { name: "Plus", value: "plus" }),
    )
    .addIntegerOption((option) =>
      option.setName("ngay").setDescription("Số ngày (mặc định 30)").addChoices(...DAY_CHOICES.map((d) => ({ name: `${d} ngày`, value: d }))),
    ),

  async execute(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    if (!payosEnabled()) {
      return reply(`Thanh toán tự động chưa được bật trên bot này. ${config.contactText} Có mã rồi thì gõ \`/kichhoat\`.`);
    }

    const plan = interaction.options.getString("goi");
    const days = interaction.options.getInteger("ngay") ?? 30;
    const amount = amountVnd(plan, days);
    const orderCode = newOrderCode();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    createOrder({ orderCode, guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, plan, days, amount });
    try {
      const link = await createPaymentLink({
        orderCode,
        amount,
        description: describeOrder(orderCode),
        returnUrl: `${config.siteUrl}/?thanhtoan=ok`,
        cancelUrl: `${config.siteUrl}/?thanhtoan=huy`,
      });
      setCheckoutUrl(orderCode, link.checkoutUrl);
      const usd = PRICES_USD[plan] * (days / 30);
      const embed = new EmbedBuilder()
        .setColor(0xf5c518)
        .setTitle(`💳 Mua gói ${PLANS[plan].label}, ${days} ngày`)
        .setDescription(
          `Số tiền: **${vnd(amount)}** (khoảng ${usd.toFixed(2)} đô, quy đổi theo tỷ giá của thầu).\nBấm nút bên dưới, quét mã QR bằng app ngân hàng. Tiền về là gói tự bật trong chừng một phút, không cần nhập mã. Liên kết sống 30 phút.`,
        )
        .setFooter({ text: `Mã đơn ${orderCode}` });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Thanh toán").setStyle(ButtonStyle.Link).setURL(link.checkoutUrl));
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      closeOrder(orderCode, "FAILED");
      if (!(error instanceof PayError)) console.error("Could not create an order:", error);
      else alert(`Tạo link thanh toán lỗi: ${error.message}`);
      await interaction.editReply({ content: `Cổng thanh toán đang trục trặc, chưa tạo được link. Thử lại sau chút, hoặc ${config.contactText.toLowerCase()}` });
    }
  },
};
