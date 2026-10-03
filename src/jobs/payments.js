import { EmbedBuilder } from "discord.js";
import { getPayment as getPayosPayment, payosEnabled } from "../pay/payos.js";
import { getPayment as getStripePayment, stripeEnabled } from "../pay/stripe.js";
import { ONE_OFF, closeOrder, expireStaleOrders, pendingOrders, settleOrder } from "../pay/orders.js";
import { PLANS } from "../license.js";

// There is no public address for the gateways to call, so the bot asks about its own open orders instead. That keeps every secret on this machine.
async function announce(client, settled) {
  const { order, expiresAt } = settled;
  const channel = order.channel_id ? await client.channels.fetch(order.channel_id).catch(() => null) : null;
  if (!channel?.send) return;
  const embed = new EmbedBuilder()
    .setColor(0x12c79a)
    .setTitle("✅ Thanh toán thành công")
    .setDescription(`Server đã lên gói **${PLANS[ONE_OFF[order.plan]?.grants ?? order.plan].label}**, hạn đến <t:${Math.floor(expiresAt / 1000)}:D>. Cảm ơn đại ca đã ủng hộ thầu, tiền này sẽ biến thành điện cho Raspberry Pi.`);
  await channel.send({ content: `<@${order.user_id}>`, embeds: [embed], allowedMentions: { users: [order.user_id] } }).catch(() => {});
}

// Each order is asked about at the gateway that made it. An order whose gateway has since been switched off is left alone.
async function lookup(order) {
  if (order.provider === "stripe") {
    if (!stripeEnabled() || !order.provider_ref) throw new Error("Stripe is off or the order has no session");
    return getStripePayment(order.provider_ref, { orderCode: order.order_code, amountCents: order.amount });
  }
  if (!payosEnabled()) throw new Error("payOS is off");
  return getPayosPayment(order.order_code);
}

export async function checkPayments(client, now = Date.now()) {
  if (!payosEnabled() && !stripeEnabled()) return { checked: 0, paid: 0 };
  let paid = 0;
  const orders = pendingOrders(now);
  for (const order of orders) {
    try {
      const payment = await lookup(order);
      if (payment.paid) {
        const settled = settleOrder(order.order_code, now);
        if (settled) {
          paid += 1;
          await announce(client, settled);
        }
      } else if (payment.closed) {
        closeOrder(order.order_code, payment.status);
      }
    } catch (error) {
      // One order that cannot be read right now must not stop the others; it is tried again on the next round
      console.error(`Payment check for ${order.order_code} failed:`, error.message);
    }
  }
  expireStaleOrders(now);
  return { checked: orders.length, paid };
}

export default {
  name: "payments",
  everyMs: 30_000,
  run: (client) => checkPayments(client),
};
