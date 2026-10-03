import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "review-test-"));

const { SNOWFLAKE, patchSection, getSection, setSection } = await import("../src/settings.js");
const { isSnowflake } = await import("../src/web/validate.js");
const { createOrder, recentOrders } = await import("../src/pay/orders.js");
const { attachChannel, getTicket, reserveTicket } = await import("../src/tickets/store.js");
const { runTickets } = await import("../src/jobs/tickets.js");
const { postTicketPanel } = await import("../src/tickets/panel.js");
const { welcomeMember, verifyMember } = await import("../src/onboarding/join.js");

const BOT = "400000000000000001";
let counter = 0;
const gid = () => `9100000000000${String(++counter).padStart(4, "0")}`;
const HOUR = 3_600_000;

// ---------- shared pieces ----------

test("settings exports the snowflake pattern the web layer uses", () => {
  assert.ok(SNOWFLAKE instanceof RegExp);
  assert.equal(SNOWFLAKE.test("123456789012345678"), true);
  assert.equal(SNOWFLAKE.test("12345"), false);
  assert.equal(isSnowflake("123456789012345678"), true);
  assert.equal(isSnowflake(123456789012345678), false);
});

test("recentOrders can be limited to one server and still lists everything without a filter", () => {
  const a = gid();
  const b = gid();
  createOrder({ orderCode: 910001, guildId: a, userId: "u", plan: "pro", days: 30, amount: 1, now: 1000 });
  createOrder({ orderCode: 910002, guildId: b, userId: "u", plan: "plus", days: 90, amount: 2, now: 2000 });
  createOrder({ orderCode: 910003, guildId: a, userId: "u", plan: "pro", days: 90, amount: 3, now: 3000 });
  assert.deepEqual(recentOrders(10, a).map((o) => o.order_code), [910003, 910001]);
  assert.deepEqual(recentOrders(10, b).map((o) => o.order_code), [910002]);
  assert.equal(recentOrders(1, a).length, 1);
  assert.deepEqual(recentOrders(10, "999999999999999999"), []);
  const all = recentOrders(10).map((o) => o.order_code);
  assert.ok(all.includes(910001) && all.includes(910002));
  assert.ok("paid_at" in recentOrders(1, a)[0]);
});

function panelGuild(settings = {}) {
  const id = gid();
  const sent = [];
  const channel = {
    id: "600000000000000001",
    type: ChannelType.GuildText,
    messages: { fetch: async () => Promise.reject(new Error("Unknown Message")) },
    send: async (payload) => {
      sent.push(payload);
      return { id: "800000000000000001", edit: async () => {} };
    },
  };
  const guild = { id, channels: { cache: new Collection([[channel.id, channel]]) } };
  patchSection(id, "tickets", { panelChannelId: channel.id, staffRoleId: "300000000000000001", ...settings });
  return { guild, sent, channel };
}

test("postTicketPanel posts once, records the message and turns tickets on", async () => {
  const { guild, sent } = panelGuild();
  const posted = await postTicketPanel(guild);
  assert.equal(posted.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].components[0].components[0].data.custom_id, "ticket:open:ho-tro");
  const stored = getSection(guild.id, "tickets");
  assert.equal(stored.enabled, true);
  assert.equal(stored.panelMessageId, "800000000000000001");
});

test("postTicketPanel names what is missing and never throws", async () => {
  const noRole = panelGuild({ staffRoleId: null });
  assert.deepEqual(await postTicketPanel(noRole.guild), { ok: false, reason: "setup" });
  const gone = panelGuild();
  gone.guild.channels.cache.clear();
  assert.deepEqual(await postTicketPanel(gone.guild), { ok: false, reason: "channel" });
  const broken = panelGuild();
  broken.channel.send = async () => {
    throw new Error("Missing Access");
  };
  assert.deepEqual(await postTicketPanel(broken.guild), { ok: false, reason: "failed" });
  assert.equal(getSection(broken.guild.id, "tickets").enabled, false);
});

// ---------- the ticket job must not trust an empty cache ----------

function openRow(guildId, channelId, user = "u1") {
  const { id } = reserveTicket({ guildId, userId: user, type: "ho-tro", now: 1000 });
  attachChannel(id, channelId);
  return id;
}

test("the job leaves tickets alone while their server is unavailable", async () => {
  const guildId = gid();
  const id = openRow(guildId, "610000000000000001");
  const guild = { id: guildId, available: false, channels: { cache: new Collection() } };
  await runTickets({ user: { id: BOT }, guilds: { cache: new Map([[guildId, guild]]) } }, { now: 1000 + 1000 * HOUR });
  assert.equal(getTicket(id).status, "OPEN");
});

test("a channel missing from the cache is only written off when Discord says it is gone", async () => {
  const guildId = gid();
  const cacheMiss = openRow(guildId, "610000000000000002", "u2");
  const deleted = openRow(guildId, "610000000000000003", "u3");
  const flaky = openRow(guildId, "610000000000000004", "u4");
  const live = { id: "610000000000000002", lastMessageId: null, send: async () => ({}), permissionOverwrites: { delete: async () => {} } };
  const guild = {
    id: guildId,
    channels: {
      cache: new Collection(),
      fetch: async (channelId) => {
        if (channelId === live.id) {
          guild.channels.cache.set(live.id, live);
          return live;
        }
        if (channelId === "610000000000000003") throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
        throw new Error("socket hang up");
      },
    },
  };
  patchSection(guildId, "tickets", { autoCloseHours: 0 });
  await runTickets({ user: { id: BOT }, guilds: { cache: new Map([[guildId, guild]]) } }, { now: 2000 });
  assert.equal(getTicket(cacheMiss).status, "OPEN", "the channel exists, it was just not cached");
  assert.equal(getTicket(deleted).status, "CLOSED");
  assert.equal(getTicket(deleted).close_reason, "Kênh đã bị xoá");
  assert.equal(getTicket(flaky).status, "OPEN", "a failed lookup decides nothing");
});

// ---------- welcome and verify roles ----------

function welcomeGuild() {
  const id = gid();
  const roles = new Collection();
  const role = (rid, position) => {
    const r = { id: rid, name: `role ${rid}`, position, managed: false, guild: { id }, permissions: { bitfield: 0n } };
    roles.set(rid, r);
    return r;
  };
  const cache = new Collection();
  const member = {
    id: "710000000000000001",
    roles: {
      cache,
      add: async (r) => cache.set(r.id, r),
      remove: async (r) => cache.delete(r.id ?? r),
    },
  };
  const guild = {
    id,
    roles: { cache: roles, fetch: async (rid) => roles.get(rid) ?? null },
    members: { me: { roles: { highest: { position: 10 } } }, fetch: async () => member },
  };
  return { guild, member, role };
}

test("using one role for both the new member and the verified step keeps the member verified", async () => {
  const { guild, member, role } = welcomeGuild();
  const shared = role("720000000000000001", 2);
  setSection(guild.id, "welcome", { enabled: true, verifyEnabled: true, verifyRoleId: shared.id, newbieRoleId: shared.id });
  const updates = [];
  await verifyMember({ user: { id: member.id }, guild, member, reply: async () => {}, update: async (p) => updates.push(p) }, member.id);
  assert.equal(updates.length, 1);
  assert.ok(member.roles.cache.has(shared.id), "the verified role must not be taken straight back");
});

test("welcomeMember still gives a separate newbie role", async () => {
  const { guild, member, role } = welcomeGuild();
  const newbie = role("720000000000000002", 2);
  setSection(guild.id, "welcome", { enabled: true, newbieRoleId: newbie.id });
  guild.systemChannel = null;
  const result = await welcomeMember(guild, member.id);
  assert.equal(result.role, "given");
});
