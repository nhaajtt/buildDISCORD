import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PermissionFlagsBits } from "discord.js";

const dataDir = mkdtempSync(path.join(tmpdir(), "stripe-test-"));
process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = dataDir;
process.env.STRIPE_SECRET_KEY = "sk_test_secret";
process.env.PAYOS_CLIENT_ID = "client-id";
process.env.PAYOS_API_KEY = "api-key";
process.env.PAYOS_CHECKSUM_KEY = "checksum-key";

// A database written before the provider columns existed, holding one payOS order
mkdirSync(dataDir, { recursive: true });
const old = new DatabaseSync(path.join(dataDir, "thauxaydung.db"));
old.exec(
  "CREATE TABLE orders (order_code INTEGER PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT, plan TEXT NOT NULL, days INTEGER NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, checkout_url TEXT, created_at INTEGER NOT NULL, paid_at INTEGER)",
);
old.prepare("INSERT INTO orders (order_code, guild_id, user_id, plan, days, amount, status, created_at) VALUES (1, 'g-old', 'u', 'pro', 30, 260000, 'PAID', 1)").run();
old.close();

const stripe = await import("../src/pay/stripe.js");
const orders = await import("../src/pay/orders.js");
const { checkPayments } = await import("../src/jobs/payments.js");
const { getPlan } = await import("../src/license.js");
const mua = (await import("../src/commands/mua.js")).default;

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

function stubFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    const result = await handler(String(url), init);
    return { ok: (result.status ?? 200) < 400, status: result.status ?? 200, json: async () => result.body };
  };
}

function stripeOrder(code, guildId, plan = "pro", days = 30, ref = `cs_${code}`) {
  orders.createOrder({ orderCode: code, guildId, userId: "u1", channelId: "c1", plan, days, amount: orders.amountCents(plan, days), provider: "stripe", now: NOW });
  orders.setProviderRef(code, ref);
}

const session = (code, extra = {}) => ({ id: `cs_${code}`, client_reference_id: String(code), amount_total: 399, currency: "usd", status: "open", payment_status: "unpaid", ...extra });

beforeEach(() => {
  globalThis.fetch = undefined;
});

test("an old database gets the provider columns and keeps its payOS order", () => {
  const rows = orders.recentOrders(10);
  assert.equal(rows.find((o) => o.order_code === 1).provider, "payos");
});

test("Stripe prices are the list prices in cents", () => {
  assert.equal(orders.amountCents("pro", 30), 399);
  assert.equal(orders.amountCents("plus", 30), 799);
  assert.equal(orders.amountCents("pro", 90), 1197);
  assert.equal(orders.amountCents("plus", 180), 4794);
  assert.equal(orders.amountCents("pro", 365), 3990, "a year is ten months");
  assert.equal(orders.amountCents("dungiup", 7), 499, "the one-off build-for-me price");
  assert.throws(() => orders.amountCents("free", 30));
  assert.throws(() => orders.amountCents("pro", 45));
  assert.ok(stripe.stripeEnabled());
});

test("a checkout session is created with the key, a form body, an expiry and an idempotency key", async () => {
  let seen;
  stubFetch((url, init) => {
    seen = { url, init, form: new URLSearchParams(init.body) };
    return { body: { id: "cs_live_1", url: "https://checkout.stripe.com/c/pay/cs_live_1" } };
  });
  const link = await stripe.createCheckoutSession({ orderCode: 42, guildId: "g1", productName: "Pro", amountCents: 999, successUrl: "https://x.test/ok", cancelUrl: "https://x.test/huy", now: NOW });
  assert.deepEqual(link, { checkoutUrl: "https://checkout.stripe.com/c/pay/cs_live_1", sessionId: "cs_live_1" });
  assert.equal(seen.url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(seen.init.headers.authorization, "Bearer sk_test_secret");
  assert.equal(seen.init.headers["idempotency-key"], "order-42");
  assert.equal(seen.form.get("mode"), "payment");
  assert.equal(seen.form.get("client_reference_id"), "42");
  assert.equal(seen.form.get("metadata[guild_id]"), "g1");
  assert.equal(seen.form.get("line_items[0][price_data][unit_amount]"), "999");
  assert.equal(seen.form.get("line_items[0][price_data][currency]"), "usd");
  assert.equal(Number(seen.form.get("expires_at")), Math.floor(NOW / 1000) + 31 * 60);
});

test("a Stripe error or a missing link is an error, never a success", async () => {
  const args = { orderCode: 1, guildId: "g", productName: "p", amountCents: 999, successUrl: "a", cancelUrl: "b" };
  stubFetch(() => ({ status: 401, body: { error: { type: "invalid_request_error", message: "bad key" } } }));
  await assert.rejects(stripe.createCheckoutSession(args), (e) => e.kind === "api");
  stubFetch(() => ({ body: { id: "cs_1" } }));
  await assert.rejects(stripe.createCheckoutSession(args), (e) => e.kind === "bad");
});

test("getPayment understands paid, unpaid and expired, and refuses a session that is not this order's", async () => {
  const expect = { orderCode: 7, amountCents: 399 };
  stubFetch(() => ({ body: session(7, { status: "complete", payment_status: "paid" }) }));
  assert.deepEqual(await stripe.getPayment("cs_7", expect), { status: "PAID", paid: true, closed: false });
  stubFetch(() => ({ body: session(7) }));
  assert.deepEqual(await stripe.getPayment("cs_7", expect), { status: "UNPAID", paid: false, closed: false });
  stubFetch(() => ({ body: session(7, { status: "expired" }) }));
  assert.deepEqual(await stripe.getPayment("cs_7", expect), { status: "EXPIRED", paid: false, closed: true });

  stubFetch(() => ({ body: session(8, { status: "complete", payment_status: "paid" }) }));
  await assert.rejects(stripe.getPayment("cs_7", expect), (e) => e.kind === "mismatch");
  stubFetch(() => ({ body: session(7, { status: "complete", payment_status: "paid", amount_total: 100 }) }));
  await assert.rejects(stripe.getPayment("cs_7", expect), (e) => e.kind === "mismatch");
  stubFetch(() => ({ body: session(7, { status: "complete", payment_status: "paid", currency: "vnd" }) }));
  await assert.rejects(stripe.getPayment("cs_7", expect), (e) => e.kind === "mismatch");
});

test("a paid Stripe order grants the plan once and asks Stripe about the stored session", async () => {
  stripeOrder(2001, "g-stripe-1");
  const asked = [];
  stubFetch((url) => {
    asked.push(url);
    return { body: session(2001, { status: "complete", payment_status: "paid" }) };
  });
  const sent = [];
  const client = { channels: { fetch: async () => ({ send: async (p) => sent.push(p) }) } };

  assert.deepEqual(await checkPayments(client, NOW + 1000), { checked: 1, paid: 1 });
  const first = getPlan("g-stripe-1", NOW + 2000);
  assert.equal(first.plan, "pro");
  assert.deepEqual(asked, ["https://api.stripe.com/v1/checkout/sessions/cs_2001"]);

  assert.deepEqual(await checkPayments(client, NOW + 31_000), { checked: 0, paid: 0 });
  assert.equal(getPlan("g-stripe-1", NOW + 2000).expiresAt, first.expiresAt);
  assert.equal(sent.length, 1);
});

test("a session that does not match its order grants nothing and does not stop the others", async () => {
  stripeOrder(2002, "g-stripe-2");
  stripeOrder(2003, "g-stripe-3");
  stubFetch((url) => (url.endsWith("cs_2002") ? { body: session(9999, { status: "complete", payment_status: "paid" }) } : { body: session(2003, { status: "complete", payment_status: "paid" }) }));
  const client = { channels: { fetch: async () => null } };
  assert.deepEqual(await checkPayments(client, NOW + 1000), { checked: 2, paid: 1 });
  assert.equal(getPlan("g-stripe-2", NOW + 2000).plan, "free");
  assert.equal(getPlan("g-stripe-3", NOW + 2000).plan, "pro");
});

test("an expired Stripe session closes the order", async () => {
  stripeOrder(2004, "g-stripe-4");
  stubFetch(() => ({ body: session(2004, { status: "expired" }) }));
  await checkPayments({ channels: { fetch: async () => null } }, NOW + 1000);
  assert.equal(orders.getOrder(2004).status, "EXPIRED");
});

function fakeInteraction(options) {
  const replies = [];
  return {
    replies,
    guildId: "g-mua",
    channelId: "c1",
    user: { id: "u1" },
    member: { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } },
    options: { getString: (n) => options[n] ?? null, getInteger: (n) => options[n] ?? null },
    reply: async (p) => replies.push(p),
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
  };
}

test("/mua pays by card through Stripe by default, in dollars", async () => {
  stubFetch(() => ({ body: { id: "cs_mua", url: "https://checkout.stripe.com/c/pay/cs_mua" } }));
  const i = fakeInteraction({ goi: "plus", ngay: 90 });
  await mua.execute(i);
  const sent = i.replies.at(-1);
  assert.match(sent.embeds[0].data.description, /\$23\.97/);
  assert.equal(sent.components[0].components[0].data.url, "https://checkout.stripe.com/c/pay/cs_mua");
  const code = Number(sent.embeds[0].data.footer.text.replace(/\D/g, ""));
  const order = orders.getOrder(code);
  assert.equal(order.provider, "stripe");
  assert.equal(order.amount, 2397);
  assert.equal(order.provider_ref, "cs_mua");
});

test("/mua with cach payos uses payOS, in dong", async () => {
  stubFetch(() => ({ body: { code: "00", data: { checkoutUrl: "https://pay.payos.vn/web/q", paymentLinkId: "q" } } }));
  const i = fakeInteraction({ goi: "pro", cach: "payos" });
  await mua.execute(i);
  const code = Number(i.replies.at(-1).embeds[0].data.footer.text.replace(/\D/g, ""));
  assert.equal(orders.getOrder(code).provider, "payos");
  assert.match(i.replies.at(-1).embeds[0].data.description, /đ/);
});

test("/mua marks a Stripe order failed when Stripe is down", async () => {
  stubFetch(() => ({ status: 503, body: null }));
  const i = fakeInteraction({ goi: "pro" });
  await mua.execute(i);
  assert.match(i.replies.at(-1).content, /trục trặc/);
  const failed = orders.recentOrders(50).find((o) => o.provider === "stripe" && o.status === "FAILED");
  assert.ok(failed);
});

test("checkout accepts cards only, so a payment is confirmed on the spot and never settles after the order stopped being watched", async () => {
  let form;
  stubFetch((url, init) => {
    form = new URLSearchParams(init.body);
    return { body: { id: "cs_live_2", url: "https://checkout.stripe.com/c/pay/cs_live_2" } };
  });
  await stripe.createCheckoutSession({ orderCode: 43, guildId: "g1", productName: "Pro", amountCents: 399, successUrl: "https://x.test/ok", cancelUrl: "https://x.test/huy", now: NOW });
  assert.equal(form.get("payment_method_types[0]"), "card");
  assert.equal(form.get("payment_method_types[1]"), null);
});
