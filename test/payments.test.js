import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PermissionFlagsBits } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "pay-test-"));
process.env.PAYOS_CLIENT_ID = "client-id";
process.env.PAYOS_API_KEY = "api-key";
process.env.PAYOS_CHECKSUM_KEY = "checksum-key";
process.env.USD_VND_RATE = "26000";

const { signPaymentRequest, createPaymentLink, getPayment, payosEnabled } = await import("../src/pay/payos.js");
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

function order(code, guildId, plan = "pro", days = 30) {
  orders.createOrder({ orderCode: code, guildId, userId: "u1", channelId: "c1", plan, days, amount: orders.amountVnd(plan, days), now: NOW });
}

function fakeClient() {
  const sent = [];
  return { sent, channels: { fetch: async () => ({ send: async (payload) => sent.push(payload) }) } };
}

beforeEach(() => {
  globalThis.fetch = undefined;
});

test("the request signature is HMAC-SHA256 over the five fields sorted by name", () => {
  const request = { amount: 260000, cancelUrl: "https://x.test/huy", description: "THAU00042", orderCode: 1760000000042, returnUrl: "https://x.test/ok" };
  const expected = createHmac("sha256", "checksum-key")
    .update("amount=260000&cancelUrl=https://x.test/huy&description=THAU00042&orderCode=1760000000042&returnUrl=https://x.test/ok")
    .digest("hex");
  assert.equal(signPaymentRequest(request), expected);
  assert.equal(signPaymentRequest(request, "another-key").length, 64);
  assert.notEqual(signPaymentRequest(request, "another-key"), expected);
});

test("prices turn dollars into dong at the configured rate, rounded to a thousand", () => {
  assert.equal(orders.amountVnd("pro", 30), 260000); // 9.99 x 26000 = 259740
  assert.equal(orders.amountVnd("plus", 30), 520000); // 19.99 x 26000 = 519740
  assert.equal(orders.amountVnd("pro", 90), 779000);
  assert.equal(orders.amountVnd("pro", 30, 100), 2000, "never below the 2,000 dong minimum");
  assert.throws(() => orders.amountVnd("free", 30));
  assert.throws(() => orders.amountVnd("pro", 45));
});

test("order codes are numbers and descriptions stay inside nine characters", () => {
  const code = orders.newOrderCode(NOW, () => 0.5);
  assert.ok(Number.isSafeInteger(code) && code > 0);
  assert.ok(orders.describeOrder(code).length <= 9);
  assert.match(orders.describeOrder(7), /^THAU00007$/);
});

test("createPaymentLink sends the keys in headers and a signed body, and returns the checkout link", async () => {
  let seen;
  stubFetch((url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return { body: { code: "00", desc: "success", data: { checkoutUrl: "https://pay.payos.vn/web/abc", paymentLinkId: "abc" } } };
  });
  const link = await createPaymentLink({ orderCode: 123, amount: 2000, description: "THAU00123", returnUrl: "https://x.test/ok", cancelUrl: "https://x.test/huy" });
  assert.equal(link.checkoutUrl, "https://pay.payos.vn/web/abc");
  assert.equal(seen.url, "https://api-merchant.payos.vn/v2/payment-requests");
  assert.equal(seen.init.headers["x-client-id"], "client-id");
  assert.equal(seen.init.headers["x-api-key"], "api-key");
  assert.equal(seen.body.signature, signPaymentRequest(seen.body));
});

test("a payOS error or a missing link is reported as an error, never as success", async () => {
  stubFetch(() => ({ status: 401, body: { code: "401", desc: "bad key" } }));
  await assert.rejects(createPaymentLink({ orderCode: 1, amount: 2000, description: "T", returnUrl: "a", cancelUrl: "b" }), (e) => e.kind === "api");
  stubFetch(() => ({ body: { code: "00", data: {} } }));
  await assert.rejects(createPaymentLink({ orderCode: 1, amount: 2000, description: "T", returnUrl: "a", cancelUrl: "b" }), (e) => e.kind === "bad");
  assert.ok(payosEnabled());
});

test("getPayment understands paid, pending and closed answers", async () => {
  const answer = (data) => stubFetch(() => ({ body: { code: "00", data } }));
  answer({ status: "PAID", amount: 2000, amountPaid: 2000 });
  assert.deepEqual(await getPayment(1), { status: "PAID", paid: true, closed: false });
  answer({ status: "PENDING", amount: 2000, amountPaid: 0 });
  assert.deepEqual(await getPayment(1), { status: "PENDING", paid: false, closed: false });
  answer({ status: "PROCESSING", amount: 2000, amountPaid: 2000 });
  assert.equal((await getPayment(1)).paid, true, "the full amount arrived even though the status is not PAID yet");
  answer({ status: "CANCELLED", amount: 2000, amountPaid: 0 });
  assert.deepEqual(await getPayment(1), { status: "CANCELLED", paid: false, closed: true });
});

test("a paid order grants the plan once, however many times it is polled, and announces it", async () => {
  order(1001, "g-pay-1");
  stubFetch(() => ({ body: { code: "00", data: { status: "PAID", amount: 260000, amountPaid: 260000 } } }));
  const client = fakeClient();

  assert.deepEqual(await checkPayments(client, NOW + 1000), { checked: 1, paid: 1 });
  const first = getPlan("g-pay-1", NOW + 2000);
  assert.equal(first.plan, "pro");

  assert.deepEqual(await checkPayments(client, NOW + 31_000), { checked: 0, paid: 0 }, "a paid order is no longer polled");
  assert.equal(getPlan("g-pay-1", NOW + 2000).expiresAt, first.expiresAt, "polling again did not add days");
  assert.equal(client.sent.length, 1);
  assert.match(client.sent[0].embeds[0].data.description, /Pro/);
  assert.equal(orders.getOrder(1001).status, "PAID");
});

test("two settle calls for the same order grant it only once", () => {
  order(1002, "g-pay-2", "plus", 30);
  assert.ok(orders.settleOrder(1002, NOW + 5));
  assert.equal(orders.settleOrder(1002, NOW + 6), null);
  assert.equal(getPlan("g-pay-2", NOW + 10).plan, "plus");
});

test("cancelled and expired orders grant nothing, and an unreadable order does not stop the others", async () => {
  order(1003, "g-pay-3");
  order(1004, "g-pay-4");
  order(1005, "g-pay-5");
  stubFetch((url) => {
    if (url.endsWith("/1003")) return { body: { code: "00", data: { status: "CANCELLED", amount: 1, amountPaid: 0 } } };
    if (url.endsWith("/1004")) return { status: 500, body: null };
    return { body: { code: "00", data: { status: "PAID", amount: 260000, amountPaid: 260000 } } };
  });
  const result = await checkPayments(fakeClient(), NOW + 1000);
  assert.equal(result.paid, 1);
  assert.equal(getPlan("g-pay-3", NOW + 2000).plan, "free");
  assert.equal(getPlan("g-pay-4", NOW + 2000).plan, "free");
  assert.equal(getPlan("g-pay-5", NOW + 2000).plan, "pro");
  assert.equal(orders.getOrder(1003).status, "CANCELLED");
  assert.equal(orders.getOrder(1004).status, "PENDING", "tried again on the next round");
});

test("orders left pending past their time expire", async () => {
  order(1006, "g-pay-6");
  stubFetch(() => ({ body: { code: "00", data: { status: "PENDING", amount: 260000, amountPaid: 0 } } }));
  await checkPayments(fakeClient(), NOW + orders.ORDER_TTL_MS + 1000);
  assert.equal(orders.getOrder(1006).status, "EXPIRED");
});

function fakeInteraction(options) {
  const replies = [];
  return {
    replies,
    guildId: "g-cmd",
    channelId: "c1",
    user: { id: "u1" },
    member: { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } },
    options: { getString: (n) => options[n] ?? null, getInteger: (n) => options[n] ?? null },
    reply: async (p) => replies.push(p),
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
  };
}

test("/mua creates a pending order and shows a payment button", async () => {
  stubFetch(() => ({ body: { code: "00", data: { checkoutUrl: "https://pay.payos.vn/web/xyz", paymentLinkId: "xyz" } } }));
  const i = fakeInteraction({ goi: "pro", ngay: 30 });
  await mua.execute(i);
  const sent = i.replies.at(-1);
  assert.match(sent.embeds[0].data.description, /260\.000/);
  assert.equal(sent.components[0].components[0].data.url, "https://pay.payos.vn/web/xyz");
  const code = Number(sent.embeds[0].data.footer.text.replace(/\D/g, ""));
  assert.equal(orders.getOrder(code).status, "PENDING");
  assert.equal(orders.getOrder(code).guild_id, "g-cmd");
});

test("/mua marks the order failed and says so when the gateway is down", async () => {
  stubFetch(() => ({ status: 503, body: null }));
  const i = fakeInteraction({ goi: "plus", ngay: 90 });
  await mua.execute(i);
  assert.match(i.replies.at(-1).content, /trục trặc/);
  const failed = orders.recentOrders(20).find((o) => o.plan === "plus" && o.days === 90);
  assert.equal(failed.status, "FAILED");
});
