import { config } from "../config.js";
import { getDb } from "../db.js";
import { grant } from "../license.js";
import { track } from "../analytics.js";

// List prices in US dollars per 30 days. The amount charged is in dong, converted at config.usdVndRate.
export const PRICES_USD = { pro: 3.99, plus: 7.99, dungiup: 4.99 };
export const DAY_CHOICES = [30, 90, 180, 365];

// "dungiup" (build for me) is a one-off: a week of Pro, enough to set a server up, paid once instead of subscribing
export const ONE_OFF = { dungiup: { grants: "pro", days: 7, label: "Dựng giúp" } };
export const planLabel = (plan) => ONE_OFF[plan]?.label ?? plan;

// A year costs ten months, so the two months are free. Everything else is priced per 30 days.
export const monthsFor = (days) => (days === 365 ? 10 : days / 30);
export const daysFor = (plan, days) => ONE_OFF[plan]?.days ?? days;
export const PROVIDERS = ["stripe", "payos"];

// What Stripe charges, in cents. Dollar prices are exact, so there is no rate and no rounding to a thousand.
export function amountCents(plan, days) {
  const usd = PRICES_USD[plan];
  if (!usd) throw new Error(`No price for plan ${plan}`);
  if (ONE_OFF[plan]) return Math.round(usd * 100);
  if (!DAY_CHOICES.includes(days)) throw new Error(`Unsupported number of days: ${days}`);
  return Math.round(usd * monthsFor(days) * 100);
}

// How long a payment link stays worth polling
export const ORDER_TTL_MS = 35 * 60 * 1000;

export function amountVnd(plan, days, rate = config.usdVndRate) {
  const usd = PRICES_USD[plan];
  if (!usd) throw new Error(`No price for plan ${plan}`);
  if (!ONE_OFF[plan] && !DAY_CHOICES.includes(days)) throw new Error(`Unsupported number of days: ${days}`);
  const raw = usd * (ONE_OFF[plan] ? 1 : monthsFor(days)) * rate;
  return Math.max(2000, Math.round(raw / 1000) * 1000);
}

// payOS wants a number code that is unique per payment link and fits in 9 characters of description
export function newOrderCode(now = Date.now(), random = Math.random) {
  return Math.floor(now / 1000) * 1000 + Math.floor(random() * 1000);
}
export const describeOrder = (orderCode) => `THAU${String(orderCode % 100000).padStart(5, "0")}`;

// `amount` is in the provider's own unit: dong for payOS, cents for Stripe
export function createOrder({ orderCode, guildId, userId, channelId, plan, days, amount, provider = "payos", now = Date.now() }) {
  if (!PROVIDERS.includes(provider)) throw new Error(`Unknown payment provider: ${provider}`);
  getDb()
    .prepare("INSERT INTO orders (order_code, guild_id, user_id, channel_id, plan, days, amount, provider, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)")
    .run(orderCode, guildId, userId, channelId ?? null, plan, days, amount, provider, now);
}

export function setProviderRef(orderCode, ref) {
  getDb().prepare("UPDATE orders SET provider_ref = ? WHERE order_code = ?").run(ref, orderCode);
}

export function setCheckoutUrl(orderCode, url) {
  getDb().prepare("UPDATE orders SET checkout_url = ? WHERE order_code = ?").run(url, orderCode);
}

export function getOrder(orderCode) {
  return getDb().prepare("SELECT * FROM orders WHERE order_code = ?").get(orderCode) ?? null;
}

export function pendingOrders(now = Date.now()) {
  return getDb().prepare("SELECT * FROM orders WHERE status = 'PENDING' AND created_at > ? ORDER BY created_at").all(now - ORDER_TTL_MS);
}

// Newest first. With a guild id only that server's orders come back; without one, every server's (for the bot owner).
export function recentOrders(limit = 10, guildId = undefined) {
  const columns = "order_code, guild_id, plan, days, amount, provider, status, created_at, paid_at";
  if (guildId === undefined) return getDb().prepare(`SELECT ${columns} FROM orders ORDER BY created_at DESC LIMIT ?`).all(limit);
  return getDb().prepare(`SELECT ${columns} FROM orders WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?`).all(guildId, limit);
}

export function closeOrder(orderCode, status) {
  getDb().prepare("UPDATE orders SET status = ? WHERE order_code = ? AND status = 'PENDING'").run(status, orderCode);
}

// Orders still pending after their time is up can no longer be paid
export function expireStaleOrders(now = Date.now()) {
  return Number(getDb().prepare("UPDATE orders SET status = 'EXPIRED' WHERE status = 'PENDING' AND created_at <= ?").run(now - ORDER_TTL_MS).changes);
}

// Marks an order paid and gives the server its plan. The status change is the guard: only the call that flips PENDING to PAID
// grants the license, so polling the same order twice can never grant it twice.
export function settleOrder(orderCode, now = Date.now()) {
  const order = getOrder(orderCode);
  if (!order) return null;
  const flipped = Number(getDb().prepare("UPDATE orders SET status = 'PAID', paid_at = ? WHERE order_code = ? AND status = 'PENDING'").run(now, orderCode).changes);
  if (!flipped) return null;
  const result = grant(order.guild_id, ONE_OFF[order.plan]?.grants ?? order.plan, order.days, now);
  track(order.guild_id, "paid", now);
  return { order: { ...order, status: "PAID", paid_at: now }, expiresAt: result.expiresAt };
}
