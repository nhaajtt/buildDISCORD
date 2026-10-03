import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { PLANS, getPlan } from "../license.js";
import { alert } from "../alerts.js";
import { PayError, createPaymentLink, payosEnabled } from "../pay/payos.js";
import { StripeError, createCheckoutSession, stripeEnabled } from "../pay/stripe.js";
import { DAY_CHOICES, MAX_PENDING_PER_GUILD, ONE_OFF, PRICES_USD, amountCents, amountVnd, closeOrder, createOrder, daysFor, describeOrder, monthsFor, newOrderCode, pendingCount, planLabel, setCheckoutUrl, setProviderRef } from "../pay/orders.js";
import { isAdmin } from "../utils/guards.js";
import * as humor from "../humor/lines.js";

const vnd = (n) => `${n.toLocaleString("vi-VN")}đ`;
const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

const enabled = { stripe: stripeEnabled, payos: payosEnabled };

export default {
  data: new SlashCommandBuilder()
    .setName("mua")
    .setDescription("Mua hoặc gia hạn gói Pro, Plus cho server bằng chuyển khoản, gói tự bật khi tiền về")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("goi")
        .setDescription("Gói muốn mua")
        .setRequired(true)
        .addChoices({ name: "Pro", value: "pro" }, { name: "Plus", value: "plus" }, { name: "Dựng giúp (Pro 7 ngày, trả một lần)", value: "dungiup" }),
    )
    .addIntegerOption((option) =>
      option.setName("ngay").setDescription("Số ngày (mặc định 30, một năm trả 10 tháng, bỏ qua với Dựng giúp)").addChoices(...DAY_CHOICES.map((d) => ({ name: `${d} ngày`, value: d }))),
    )
    .addStringOption((option) =>
      option
        .setName("cach")
        .setDescription("Cách trả tiền (mặc định: thẻ qua Stripe)")
        .addChoices({ name: "Thẻ quốc tế (Stripe, tính bằng đô)", value: "stripe" }, { name: "QR ngân hàng Việt Nam (payOS, tính bằng đồng)", value: "payos" }),
    ),

  async execute(interaction) {
    const reply = (content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    if (!isAdmin(interaction.member)) return reply(humor.pick(humor.noPermissionLines));
    if (!stripeEnabled() && !payosEnabled()) {
      return reply(`Thanh toán tự động chưa được bật trên bot này. ${config.contactText} Có mã rồi thì gõ \`/kichhoat\`.`);
    }
    const asked = interaction.options.getString("cach");
    const provider = asked ?? (stripeEnabled() ? "stripe" : "payos");
    if (!enabled[provider]()) {
      return reply(`Cách trả tiền này chưa được bật trên bot. ${stripeEnabled() || payosEnabled() ? "Chọn cách khác trong ô `cach`." : ""} ${config.contactText}`.trim());
    }

    const plan = interaction.options.getString("goi");
    // the one-off is for servers that are still on the free plan; a server that already pays does not need it
    if (ONE_OFF[plan] && getPlan(interaction.guildId).rank > 0) return reply("Server đang có gói trả phí rồi, không cần mua Dựng giúp. Muốn gia hạn thì chọn Pro hoặc Plus.");
    const days = daysFor(plan, interaction.options.getInteger("ngay") ?? 30);
    const amount = provider === "stripe" ? amountCents(plan, days) : amountVnd(plan, days);
    if (pendingCount(interaction.guildId) >= MAX_PENDING_PER_GUILD) {
      return reply("Server này đang có sẵn vài đơn chờ thanh toán rồi. Trả một đơn cũ, hoặc đợi chừng 35 phút cho đơn cũ hết hạn rồi tạo đơn mới nhé.");
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Two buyers in the same second can draw the same code, so a taken code is simply redrawn
    let orderCode;
    for (let attempt = 0; ; attempt += 1) {
      orderCode = newOrderCode();
      try {
        createOrder({ orderCode, guildId: interaction.guildId, userId: interaction.user.id, channelId: interaction.channelId, plan, days, amount, provider });
        break;
      } catch (error) {
        if (attempt >= 4) {
          console.error("Could not create an order:", error);
          return interaction.editReply({ content: `Thầu chưa tạo được đơn lúc này. Thử lại sau chút, hoặc ${config.contactText.toLowerCase()}` });
        }
      }
    }
    try {
      const urls = { returnUrl: `${config.siteUrl}/?thanhtoan=ok`, cancelUrl: `${config.siteUrl}/?thanhtoan=huy` };
      let link;
      if (provider === "stripe") {
        const session = await createCheckoutSession({
          orderCode,
          guildId: interaction.guildId,
          productName: `Thầu Xây Dựng ${PLANS[plan]?.label ?? planLabel(plan)}, ${days} ngày`,
          amountCents: amount,
          successUrl: urls.returnUrl,
          cancelUrl: urls.cancelUrl,
        });
        setProviderRef(orderCode, session.sessionId);
        link = session;
      } else {
        link = await createPaymentLink({ orderCode, amount, description: describeOrder(orderCode), ...urls });
      }
      setCheckoutUrl(orderCode, link.checkoutUrl);
      const listUsd = ONE_OFF[plan] ? PRICES_USD[plan] : PRICES_USD[plan] * monthsFor(days);
      const embed = new EmbedBuilder()
        .setColor(0xf5c518)
        .setTitle(`💳 Mua gói ${PLANS[plan]?.label ?? planLabel(plan)}, ${days} ngày`)
        .setDescription(
          provider === "stripe"
            ? `Số tiền: **${usd(amount)}**.\nBấm nút bên dưới, nhập thẻ trên trang thanh toán của Stripe (thầu không thấy số thẻ của bạn). Tiền về là gói tự bật trong chừng một phút, không cần nhập mã. Liên kết sống 30 phút.`
            : `Số tiền: **${vnd(amount)}** (khoảng ${listUsd.toFixed(2)} đô, quy đổi theo tỷ giá của thầu).\nBấm nút bên dưới, quét mã QR bằng app ngân hàng. Tiền về là gói tự bật trong chừng một phút, không cần nhập mã. Liên kết sống 30 phút.`,
        )
        .setFooter({ text: `Mã đơn ${orderCode}` });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Thanh toán").setStyle(ButtonStyle.Link).setURL(link.checkoutUrl));
      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      closeOrder(orderCode, "FAILED");
      if (!(error instanceof PayError || error instanceof StripeError)) console.error("Could not create an order:", error);
      else alert(`Tạo link thanh toán lỗi: ${error.message}`);
      await interaction.editReply({ content: `Cổng thanh toán đang trục trặc, chưa tạo được link. Thử lại sau chút, hoặc ${config.contactText.toLowerCase()}` });
    }
  },
};
