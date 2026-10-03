import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PermissionFlagsBits } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "review-platform-"));
process.env.PAYOS_CLIENT_ID = "client-id";
process.env.PAYOS_API_KEY = "api-key";
process.env.PAYOS_CHECKSUM_KEY = "checksum-key";
process.env.USD_VND_RATE = "26000";

const { createPaymentLink } = await import("../src/pay/payos.js");
const orders = await import("../src/pay/orders.js");
const { getPlan } = await import("../src/license.js");
const { getDb } = await import("../src/db.js");
const mua = (await import("../src/commands/mua.js")).default;

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function stubFetch(handler) {
  globalThis.fetch = async (url, init = {}) => {
    const result = await handler(String(url), init);
    return { ok: (result.status ?? 200) < 400, status: result.status ?? 200, json: async () => result.body };
  };
}

beforeEach(() => {
  globalThis.fetch = undefined;
});

const rawOrder = (code, guildId, plan, days, amount = 1000) => orders.createOrder({ orderCode: code, guildId, userId: "u1", channelId: "c1", plan, days, amount, now: NOW });

test("a payment that cannot be turned into a plan stays pending instead of being marked paid with nothing granted", () => {
  rawOrder(9001, "g-rv-1", "pro", 0);
  assert.throws(() => orders.settleOrder(9001, NOW + 1000));
  assert.equal(orders.getOrder(9001).status, "PENDING", "the paid mark is rolled back with the failed grant");
  assert.equal(orders.getOrder(9001).paid_at, null);
  assert.equal(getPlan("g-rv-1", NOW + 2000).plan, "free");
  assert.equal(Number(getDb().prepare("SELECT COUNT(*) AS n FROM licenses WHERE guild_id = ?").get("g-rv-1").n), 0);
});

test("the one-off product always grants its own seven days, whatever days the order row carries", () => {
  rawOrder(9002, "g-rv-2", "dungiup", 365);
  const settled = orders.settleOrder(9002, NOW);
  assert.equal(settled.expiresAt, NOW + 7 * DAY);
  assert.equal(getPlan("g-rv-2", NOW + 1).plan, "pro");
});

test("payOS links are created with an expiry inside the order's polling window", async () => {
  let body;
  stubFetch((url, init) => {
    body = JSON.parse(init.body);
    return { body: { code: "00", data: { checkoutUrl: "https://pay.payos.vn/web/x", paymentLinkId: "x" } } };
  });
  await createPaymentLink({ orderCode: 5, amount: 2000, description: "THAU00005", returnUrl: "https://x.test/ok", cancelUrl: "https://x.test/huy", now: NOW });
  assert.equal(body.expiredAt, Math.floor(NOW / 1000) + 30 * 60);
  assert.ok(body.expiredAt * 1000 - NOW < orders.ORDER_TTL_MS, "a link cannot be paid after the bot stopped watching its order");
});

function fakeInteraction(options, guildId) {
  const replies = [];
  return {
    replies,
    guildId,
    channelId: "c1",
    user: { id: "u1" },
    member: { permissions: { has: (flag) => flag === PermissionFlagsBits.Administrator } },
    options: { getString: (n) => options[n] ?? null, getInteger: (n) => options[n] ?? null },
    reply: async (p) => replies.push(p),
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
  };
}

test("/mua picks another order code when two buyers collide in the same second", async () => {
  const realNow = Date.now;
  const realRandom = Math.random;
  const answers = [0.5, 0.5, 0.7];
  Date.now = () => NOW;
  Math.random = () => answers.shift() ?? 0.9;
  try {
    const taken = orders.newOrderCode(NOW, () => 0.5);
    rawOrder(taken, "g-rv-other", "pro", 30);
    stubFetch(() => ({ body: { code: "00", data: { checkoutUrl: "https://pay.payos.vn/web/y", paymentLinkId: "y" } } }));
    const i = fakeInteraction({ goi: "pro", ngay: 30, cach: "payos" }, "g-rv-3");
    await mua.execute(i);
    const sent = i.replies.at(-1);
    assert.ok(sent.embeds, "the buyer gets a payment button, not a stuck reply");
    const code = Number(sent.embeds[0].data.footer.text.replace(/\D/g, ""));
    assert.notEqual(code, taken);
    assert.equal(orders.getOrder(code).guild_id, "g-rv-3");
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
});

test("/mua stops one server from piling up open payment links", async () => {
  stubFetch(() => ({ body: { code: "00", data: { checkoutUrl: "https://pay.payos.vn/web/z", paymentLinkId: "z" } } }));
  const guild = "g-rv-4";
  let last;
  for (let n = 0; n < orders.MAX_PENDING_PER_GUILD + 1; n += 1) {
    last = fakeInteraction({ goi: "pro", ngay: 30, cach: "payos" }, guild);
    await mua.execute(last);
  }
  assert.ok(!last.replies.at(-1).embeds, "the last one is refused");
  assert.match(last.replies.at(-1).content, /đơn/);
  const open = orders.recentOrders(50, guild).filter((o) => o.status === "PENDING");
  assert.equal(open.length, orders.MAX_PENDING_PER_GUILD);
});
