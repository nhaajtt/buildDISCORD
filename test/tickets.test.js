import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection, OverwriteType, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "tickets-test-"));

const logic = await import("../src/tickets/logic.js");
const { getTicket, listOpen } = await import("../src/tickets/store.js");
const { useClock } = await import("../src/tickets/index.js");
const { getSection, patchSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");
const { getDb } = await import("../src/db.js");
const command = (await import("../src/commands/ticket.js")).default;
const job = (await import("../src/jobs/tickets.js")).default;
const { runTickets } = await import("../src/jobs/tickets.js");

const { buildOverwrites, selectStale, snowflakeTime, permit, channelName, panelRows, createCooldown, validateReason, checkStaffRole } = logic;

let counter = 0;
const gid = () => `8200000000000${String(++counter).padStart(4, "0")}`;
const STAFF = "300000000000000001";
const BOT = "400000000000000001";
const LOG = "500000000000000001";
const PANEL = "600000000000000001";
const CATEGORY = "700000000000000001";
let nextId = 800000000000000000n;
const newId = () => String(nextId++);

// ---------- pure helpers ----------

test("channel names are clean and numbered", () => {
  assert.equal(channelName(7, "Nguyễn Văn Đạt"), "ticket-7-nguyen-van-dat");
  assert.equal(channelName(8, "@@@"), "ticket-8-khach");
  assert.ok(channelName(1, "x".repeat(200)).length <= 100);
});

test("the overwrite set lets nobody else see the channel", () => {
  const guildId = "100000000000000001";
  const set = buildOverwrites({ guildId, openerId: "200000000000000001", staffRoleId: STAFF, botId: BOT });
  assert.deepEqual(set.map((o) => o.id), [guildId, "200000000000000001", STAFF, BOT]);
  const everyone = set[0];
  assert.deepEqual(everyone.deny, [P.ViewChannel]);
  assert.equal(everyone.allow, undefined);
  assert.equal(everyone.type, OverwriteType.Role);

  const opener = set[1];
  assert.equal(opener.type, OverwriteType.Member);
  assert.deepEqual(opener.allow.sort(), [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory].sort());
  assert.equal(opener.allow.includes(P.ManageMessages), false);

  const staff = set[2];
  assert.ok(staff.allow.includes(P.ManageMessages));
  // No server-wide powers are ever handed out through a ticket
  for (const o of set.slice(1, 3)) for (const bad of [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.MentionEveryone]) assert.equal(o.allow.includes(bad), false);

  // Everyone with access is listed, nobody else holds an allow
  assert.equal(set.filter((o) => o.allow?.includes(P.ViewChannel)).length, 3);
  assert.equal(buildOverwrites({ guildId, openerId: "2", staffRoleId: null, botId: BOT }).length, 3);
});

test("a staff role must be a real team role", () => {
  assert.equal(checkStaffRole({ id: "g", managed: false }, "g"), false);
  assert.equal(checkStaffRole({ id: "r", managed: true }, "g"), false);
  assert.equal(checkStaffRole(null, "g"), false);
  assert.equal(checkStaffRole({ id: "r", managed: false }, "g"), true);
});

test("permit: who may claim, close, reopen and delete", () => {
  const open = { status: "OPEN", user_id: "u1", claimed_by: null };
  const closed = { ...open, status: "CLOSED" };
  assert.equal(permit("claim", { ticket: open, userId: "s", staff: true }), null);
  assert.equal(permit("claim", { ticket: open, userId: "u1", staff: false }), "notStaff");
  assert.equal(permit("claim", { ticket: { ...open, claimed_by: "other" }, userId: "s", staff: true }), "alreadyClaimed");
  assert.equal(permit("close", { ticket: open, userId: "u1", staff: false }), null);
  assert.equal(permit("close", { ticket: open, userId: "stranger", staff: false }), "notAllowed");
  assert.equal(permit("close", { ticket: open, userId: "s", staff: true }), null);
  assert.equal(permit("close", { ticket: closed, userId: "u1", staff: false }), "alreadyClosed");
  assert.equal(permit("reopen", { ticket: closed, userId: "u1", staff: false }), "notStaff");
  assert.equal(permit("reopen", { ticket: closed, userId: "s", staff: true }), null);
  assert.equal(permit("reopen", { ticket: open, userId: "s", staff: true }), "notClosed");
  assert.equal(permit("delete", { ticket: open, userId: "s", staff: true }), "notClosed");
  assert.equal(permit("delete", { ticket: closed, userId: "s", staff: true }), null);
  assert.equal(permit("nonsense", { ticket: open, userId: "s", staff: true }), "notAllowed");
});

test("reason validation", () => {
  assert.deepEqual(validateReason("  cần giúp  "), { ok: true, value: "cần giúp" });
  assert.equal(validateReason("").ok, false);
  assert.equal(validateReason("   ").ok, false);
  assert.equal(validateReason("x".repeat(301)).ok, false);
  assert.equal(validateReason("x".repeat(300)).ok, true);
  assert.equal(validateReason(null).ok, false);
});

test("cooldown follows an injected clock", () => {
  let t = 1000;
  const c = createCooldown({ now: () => t });
  assert.equal(c.remaining("u"), 0);
  c.mark("u");
  assert.equal(c.remaining("u"), 30000);
  t += 29000;
  assert.equal(c.remaining("u"), 1000);
  t += 1000;
  assert.equal(c.remaining("u"), 0);
  assert.equal(c.remaining("other"), 0);
});

test("selectStale picks old open tickets only, and 0 hours disables it", () => {
  const now = 10 * 3_600_000;
  const tickets = [
    { id: 1, status: "OPEN", created_at: 0 },
    { id: 2, status: "OPEN", created_at: 9 * 3_600_000 },
    { id: 3, status: "CLOSED", created_at: 0 },
    { id: 4, status: "OPEN", created_at: 0 },
  ];
  const last = (t) => (t.id === 4 ? now - 1000 : t.created_at);
  assert.deepEqual(selectStale(tickets, now, 2, last).map((t) => t.id), [1]);
  assert.deepEqual(selectStale(tickets, now, 0, last), []);
  assert.deepEqual(selectStale([], now, 5, last), []);
});

test("snowflakeTime reads the time inside an id", () => {
  const ms = Date.UTC(2026, 0, 1);
  const id = String((BigInt(ms) - 1420070400000n) << 22n);
  assert.equal(snowflakeTime(id), ms);
});

test("the panel stays inside Discord's limits", () => {
  const types = Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, label: `Loại ${i}`, emoji: "🛟" }));
  const rows = panelRows(types);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].components.length, 5);
  assert.equal(rows[0].components[0].data.custom_id, "ticket:open:k0");
  const many = panelRows(Array.from({ length: 40 }, (_, i) => ({ key: `k${i}`, label: "x", emoji: "" })));
  assert.ok(many.length <= 5);
  assert.ok(many.every((r) => r.components.length <= 5));
  assert.equal(panelRows([{ key: "a", label: "A", emoji: "khong-phai-emoji" }])[0].components[0].data.emoji, undefined);
});

test("the command JSON is valid", () => {
  const json = command.data.toJSON();
  assert.ok(json.description.length <= 100);
  const walk = (list) => {
    for (const o of list) {
      assert.match(o.name, /^[a-z]+$/);
      assert.ok(o.description.length <= 100);
      assert.ok((o.choices ?? []).length <= 25);
      walk(o.options ?? []);
    }
  };
  walk(json.options);
});

// ---------- fakes ----------

function fakeChannel(guild, { id = newId(), type = ChannelType.GuildText, lastMessageId = null, extra = {} } = {}) {
  const sent = [];
  const overwrites = new Map();
  const channel = {
    id,
    type,
    guild,
    sent,
    lastMessageId,
    deleted: false,
    overwrites,
    send: async (payload) => {
      sent.push(payload);
      return { id: newId(), edit: async () => {} };
    },
    permissionOverwrites: {
      delete: async (target) => {
        if (channel.failOverwrite) throw new Error("no");
        overwrites.delete(target);
      },
      edit: async (target, perms) => {
        if (channel.failOverwrite) throw new Error("no");
        overwrites.set(target, perms);
      },
    },
    delete: async () => {
      channel.deleted = true;
      guild.channels.cache.delete(id);
    },
    ...extra,
  };
  guild.channels.cache.set(id, channel);
  return channel;
}

function fakeGuild({ id = gid(), manage = true, failCreate = false, withStaff = true } = {}) {
  const guild = { id, created: [] };
  guild.roles = { cache: new Collection() };
  if (withStaff) guild.roles.cache.set(STAFF, { id: STAFF, managed: false });
  guild.channels = {
    cache: new Collection(),
    create: async (options) => {
      if (failCreate) throw new Error("Discord said no");
      guild.created.push(options);
      return fakeChannel(guild, { extra: { name: options.name } });
    },
  };
  guild.members = { me: { id: BOT, permissions: { has: () => manage } } };
  fakeChannel(guild, { id: LOG });
  fakeChannel(guild, { id: PANEL });
  fakeChannel(guild, { id: CATEGORY, type: ChannelType.GuildCategory });
  return guild;
}

function proGuild(opts) {
  const guild = fakeGuild(opts);
  grant(guild.id, "pro", 30);
  patchSection(guild.id, "tickets", { enabled: true, panelChannelId: PANEL, staffRoleId: STAFF, categoryId: CATEGORY, logChannelId: LOG, maxOpenPerUser: 1, autoCloseHours: 48 });
  return guild;
}

function member({ staff = false, admin = false } = {}) {
  return { displayName: "Khách Hàng", permissions: { has: () => admin }, roles: { cache: new Set(staff ? [STAFF] : []) } };
}

function click(guild, channel, { user = "u1", staff = false, admin = false } = {}) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild.id,
    channel,
    channelId: channel?.id,
    user: { id: user, username: "khach" },
    member: member({ staff, admin }),
    fields: { getTextInputValue: () => "" },
    reply: async (p) => replies.push(p),
    update: async (p) => replies.push({ update: p }),
    followUp: async (p) => replies.push({ followUp: p }),
    showModal: async (m) => replies.push({ modal: m }),
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
  };
}
const say = (i) => i.replies.map((r) => (typeof r === "string" ? r : r.content ?? r.followUp?.content ?? "")).join("\n");

async function openTicket(guild, { user = "u1", reason = "Cần giúp gấp", type = "ho-tro" } = {}) {
  const i = click(guild, null, { user });
  i.fields.getTextInputValue = () => reason;
  await command.handleComponent(i, ["modal", type]);
  return i;
}

// ---------- opening ----------

test("a panel button opens a modal capped at 300 characters", async () => {
  useClock(() => 1_000_000);
  const guild = proGuild();
  const i = click(guild, null);
  await command.handleComponent(i, ["open", "ho-tro"]);
  const modal = i.replies[0].modal.toJSON();
  assert.equal(modal.custom_id, "ticket:modal:ho-tro");
  assert.equal(modal.components[0].components[0].max_length, 300);
});

test("opening creates a private channel, stores the row and logs without content", async () => {
  useClock(() => 1_000_000);
  const guild = proGuild();
  const i = await openTicket(guild, { reason: "Bí mật của tôi" });
  assert.match(say(i), /Ticket của bạn/);

  const options = guild.created[0];
  assert.match(options.name, /^ticket-1-khach-hang$/);
  assert.equal(options.parent, CATEGORY);
  assert.deepEqual(options.permissionOverwrites.map((o) => o.id), [guild.id, "u1", STAFF, BOT]);

  const rows = listOpen(guild.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, "u1");
  assert.equal(rows[0].status, "OPEN");
  assert.equal(rows[0].channel_id, [...guild.channels.cache.values()].find((c) => c.name === options.name).id);

  const channel = guild.channels.cache.get(rows[0].channel_id);
  const first = channel.sent[0];
  assert.match(first.embeds[0].data.description, /Bí mật của tôi/);
  const ids = first.components[0].components.map((b) => b.data.custom_id);
  assert.deepEqual(ids, [`ticket:claim:${rows[0].id}`, `ticket:close:${rows[0].id}`, `ticket:closewhy:${rows[0].id}`]);

  const logged = guild.channels.cache.get(LOG).sent;
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0].content, /Bí mật/);
});

test("maxOpenPerUser and the 30 second cooldown are enforced", async () => {
  let t = 5_000_000;
  useClock(() => t);
  const guild = proGuild();
  patchSection(guild.id, "tickets", { maxOpenPerUser: 2 });
  await openTicket(guild);
  const tooSoon = await openTicket(guild);
  assert.match(say(tooSoon), /30 giây|giây nữa/);
  assert.equal(listOpen(guild.id).length, 1);

  t += 31_000;
  await openTicket(guild);
  assert.equal(listOpen(guild.id).length, 2);

  t += 31_000;
  const full = await openTicket(guild);
  assert.match(say(full), /đang mở 2 ticket/);
  assert.equal(listOpen(guild.id).length, 2);

  // Another person is not affected
  const other = await openTicket(guild, { user: "u2" });
  assert.match(say(other), /Ticket của bạn/);

  // The button checks the same limits before showing a modal
  const button = click(guild, null, { user: "u1" });
  await command.handleComponent(button, ["open", "ho-tro"]);
  assert.equal(button.replies[0].modal, undefined);
});

test("modal validation, plan gate, disabled tickets and unknown types", async () => {
  useClock(() => 9_000_000);
  const guild = proGuild();
  const empty = await openTicket(guild, { reason: "   " });
  assert.match(say(empty), /trống trơn|dài quá/);
  const long = await openTicket(guild, { user: "u3", reason: "x".repeat(301) });
  assert.match(say(long), /dài quá/);
  const unknown = await openTicket(guild, { user: "u4", type: "khong-co" });
  assert.match(say(unknown), /không còn nữa/);
  assert.equal(listOpen(guild.id).length, 0);

  patchSection(guild.id, "tickets", { enabled: false });
  assert.match(say(await openTicket(guild, { user: "u5" })), /đang tắt/);

  const free = fakeGuild();
  patchSection(free.id, "tickets", { enabled: true, staffRoleId: STAFF });
  assert.match(say(await openTicket(free)), /Pro/);
  assert.equal(free.created.length, 0);
});

test("opening survives a failing channel create and a missing permission", async () => {
  useClock(() => 12_000_000);
  const failing = proGuild({ failCreate: true });
  const i = await openTicket(failing);
  assert.match(say(i), /không cho thầu tạo kênh/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM tickets WHERE guild_id = ?").get(failing.id).n, 0, "the reserved row is dropped");
  useClock(() => 12_100_000);
  assert.equal(listOpen(failing.id).length, 0);

  const noPerm = proGuild({ manage: false });
  const j = await openTicket(noPerm);
  assert.match(say(j), /thiếu quyền/);
  assert.equal(noPerm.created.length, 0);
});

test("a staff role that went missing is left out of the overwrites", async () => {
  useClock(() => 13_000_000);
  const guild = proGuild({ withStaff: false });
  await openTicket(guild);
  assert.deepEqual(guild.created[0].permissionOverwrites.map((o) => o.id), [guild.id, "u1", BOT]);
});

// ---------- claim, close, reopen, delete ----------

async function openedTicket(opts) {
  useClock(() => 20_000_000);
  const guild = proGuild(opts);
  await openTicket(guild);
  const row = listOpen(guild.id)[0];
  return { guild, row, channel: guild.channels.cache.get(row.channel_id) };
}

test("claiming is for staff only and re-checks the row", async () => {
  const { guild, row, channel } = await openedTicket();
  const stranger = click(guild, channel, { user: "u9" });
  await command.handleComponent(stranger, ["claim", String(row.id)]);
  assert.match(say(stranger), /của staff/);
  assert.equal(getTicket(row.id).claimed_by, null);

  const opener = click(guild, channel, { user: "u1" });
  await command.handleComponent(opener, ["claim", String(row.id)]);
  assert.match(say(opener), /của staff/);

  const staff = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(staff, ["claim", String(row.id)]);
  assert.equal(getTicket(row.id).claimed_by, "s1");
  assert.ok(staff.replies[0].update.components[0].components[0].data.disabled);
  assert.match(say(staff), /đã nhận/);

  const second = click(guild, channel, { user: "s2", staff: true });
  await command.handleComponent(second, ["claim", String(row.id)]);
  assert.match(say(second), /nhận ticket này trước/);
  assert.equal(getTicket(row.id).claimed_by, "s1");
  assert.ok(guild.channels.cache.get(LOG).sent.some((m) => /nhận/.test(m.content)));
});

test("buttons never trust the id: wrong channel, wrong server and unknown tickets are refused", async () => {
  const { guild, row, channel } = await openedTicket();
  const otherChannel = fakeChannel(guild);
  const wrongChannel = click(guild, otherChannel, { user: "s1", staff: true });
  await command.handleComponent(wrongChannel, ["close", String(row.id)]);
  assert.match(say(wrongChannel), /không còn hợp lệ/);

  const otherGuild = proGuild();
  const foreign = click(otherGuild, channel, { user: "s1", staff: true });
  await command.handleComponent(foreign, ["close", String(row.id)]);
  assert.match(say(foreign), /không còn hợp lệ/);

  const unknown = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(unknown, ["delete", "99999999"]);
  assert.match(say(unknown), /không còn hợp lệ/);
  const junk = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(junk, ["delete", "abc"]);
  assert.match(say(junk), /không còn hợp lệ/);
  assert.equal(getTicket(row.id).status, "OPEN");
});

test("a stranger cannot close someone else's ticket, the opener and staff can", async () => {
  const { guild, row, channel } = await openedTicket();
  const stranger = click(guild, channel, { user: "u9" });
  await command.handleComponent(stranger, ["close", String(row.id)]);
  assert.match(say(stranger), /người khác/);
  assert.equal(getTicket(row.id).status, "OPEN");

  const strangerModal = click(guild, channel, { user: "u9" });
  await command.handleComponent(strangerModal, ["closewhy", String(row.id)]);
  assert.equal(strangerModal.replies[0].modal, undefined);

  const forged = click(guild, channel, { user: "u9" });
  forged.fields.getTextInputValue = () => "đóng giùm";
  await command.handleComponent(forged, ["closemodal", String(row.id)]);
  assert.equal(getTicket(row.id).status, "OPEN");

  const opener = click(guild, channel, { user: "u1" });
  await command.handleComponent(opener, ["close", String(row.id)]);
  assert.equal(getTicket(row.id).status, "CLOSED");
  assert.equal(getTicket(row.id).close_reason, null);
});

test("close with a reason, then reopen, then delete keeps the row", async () => {
  const { guild, row, channel } = await openedTicket();
  channel.overwrites.set("u1", {});

  const why = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(why, ["closewhy", String(row.id)]);
  assert.equal(why.replies[0].modal.toJSON().custom_id, `ticket:closemodal:${row.id}`);

  const submit = click(guild, channel, { user: "s1", staff: true });
  submit.fields.getTextInputValue = () => "Xong rồi nhé";
  await command.handleComponent(submit, ["closemodal", String(row.id)]);
  const closed = getTicket(row.id);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.close_reason, "Xong rồi nhé");
  assert.ok(closed.closed_at);
  assert.equal(channel.overwrites.has("u1"), false, "the opener lost access");
  const notice = channel.sent.at(-1);
  assert.match(notice.content, /Xong rồi nhé/);
  assert.deepEqual(notice.components[0].components.map((b) => b.data.custom_id), [`ticket:delete:${row.id}`, `ticket:reopen:${row.id}`]);
  assert.deepEqual(notice.allowedMentions, { parse: [] });

  const again = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(again, ["close", String(row.id)]);
  assert.match(say(again), /đóng rồi/);

  const opener = click(guild, channel, { user: "u1" });
  await command.handleComponent(opener, ["reopen", String(row.id)]);
  assert.match(say(opener), /của staff/);
  await command.handleComponent(click(guild, channel, { user: "u1" }), ["delete", String(row.id)]);
  assert.equal(channel.deleted, false);

  const staff = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(staff, ["reopen", String(row.id)]);
  const reopened = getTicket(row.id);
  assert.equal(reopened.status, "OPEN");
  assert.equal(reopened.closed_at, null);
  assert.equal(channel.overwrites.get("u1").ViewChannel, true, "the opener sees the channel again");

  const early = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(early, ["delete", String(row.id)]);
  assert.match(say(early), /còn đang mở/);
  assert.equal(channel.deleted, false);

  await command.handleComponent(click(guild, channel, { user: "s1", staff: true }), ["close", String(row.id)]);
  const del = click(guild, channel, { user: "s1", staff: true });
  await command.handleComponent(del, ["delete", String(row.id)]);
  assert.equal(channel.deleted, true);
  assert.equal(getTicket(row.id).status, "CLOSED", "the row is kept");
  const log = guild.channels.cache.get(LOG).sent.map((m) => m.content).join("\n");
  assert.match(log, /mở lại/);
  assert.match(log, /xoá/);
  assert.doesNotMatch(log, /Xong rồi nhé/);
});

test("closing still works when removing the opener's access fails, and admins count as staff", async () => {
  const { guild, row, channel } = await openedTicket();
  channel.failOverwrite = true;
  const admin = click(guild, channel, { user: "boss", admin: true });
  await command.handleComponent(admin, ["close", String(row.id)]);
  assert.equal(getTicket(row.id).status, "CLOSED");
  const back = click(guild, channel, { user: "boss", admin: true });
  await command.handleComponent(back, ["reopen", String(row.id)]);
  assert.equal(getTicket(row.id).status, "OPEN");
  assert.match(say(back), /không trả quyền xem/);
});

// ---------- the job ----------

const HOUR = 3_600_000;
const idAt = (ms) => String((BigInt(ms) - 1420070400000n) << 22n);

test("the job closes stale tickets, spares active ones, and survives failures", async () => {
  const base = Date.UTC(2026, 5, 1);
  useClock(() => base);
  const guild = proGuild();
  patchSection(guild.id, "tickets", { maxOpenPerUser: 5, autoCloseHours: 24 });
  const made = [];
  for (const user of ["a", "b", "c", "d"]) {
    useClock(() => base + made.length * 40_000);
    await openTicket(guild, { user });
    made.push(listOpen(guild.id).find((t) => t.user_id === user));
  }
  const [stale, active, broken, gone] = made.map((t) => ({ row: t, channel: guild.channels.cache.get(t.channel_id) }));
  stale.channel.lastMessageId = idAt(base + 1 * HOUR);
  active.channel.lastMessageId = idAt(base + 47 * HOUR);
  broken.channel.lastMessageId = idAt(base);
  broken.channel.send = async () => {
    throw new Error("send failed");
  };
  broken.channel.permissionOverwrites.delete = async () => {
    throw new Error("overwrite failed");
  };
  gone.channel.delete();
  // A second server that fails entirely must not stop this one
  const explosive = proGuild();
  useClock(() => base + 500_000);
  await openTicket(explosive, { user: "z" });
  const zRow = listOpen(explosive.id)[0];
  const zChannel = explosive.channels.cache.get(zRow.channel_id);
  zChannel.lastMessageId = "not-a-snowflake";
  // A server whose channel cache blows up must not stop the others either
  const exploding = proGuild();
  await openTicket(exploding, { user: "y" });
  const yRow = listOpen(exploding.id)[0];
  Object.defineProperty(exploding, "channels", {
    get() {
      throw new Error("cache exploded");
    },
  });

  const client = {
    user: { id: BOT },
    guilds: { cache: new Map([[exploding.id, exploding], [explosive.id, explosive], [guild.id, guild]]) },
  };
  const closed = await runTickets(client, { now: base + 50 * HOUR });

  assert.equal(getTicket(stale.row.id).status, "CLOSED");
  assert.equal(getTicket(active.row.id).status, "OPEN", "3 hours of silence is not stale");
  assert.equal(getTicket(broken.row.id).status, "CLOSED", "the row closes even if Discord calls fail");
  assert.equal(getTicket(gone.row.id).status, "CLOSED");
  assert.equal(getTicket(gone.row.id).close_reason, "Kênh đã bị xoá");
  assert.equal(getTicket(yRow.id).status, "OPEN", "the failing server did not take the job down");
  assert.equal(getTicket(zRow.id).status, "CLOSED", "a bad snowflake falls back to the creation time");
  assert.equal(closed, 3);
  assert.match(stale.channel.sent.at(-1).content, /đóng bởi/);
});

test("the job leaves recent tickets and disabled auto-close alone", async () => {
  const base = Date.UTC(2026, 6, 1);
  useClock(() => base);
  const guild = proGuild();
  await openTicket(guild);
  const row = listOpen(guild.id)[0];
  const channel = guild.channels.cache.get(row.channel_id);
  channel.lastMessageId = idAt(base + 10 * HOUR);
  const client = { user: { id: BOT }, guilds: { cache: new Map([[guild.id, guild]]) } };

  await runTickets(client, { now: base + 12 * HOUR });
  assert.equal(getTicket(row.id).status, "OPEN");

  patchSection(guild.id, "tickets", { autoCloseHours: 0 });
  await runTickets(client, { now: base + 1000 * HOUR });
  assert.equal(getTicket(row.id).status, "OPEN");

  // Guilds the bot no longer sees are skipped
  await runTickets({ user: { id: BOT }, guilds: { cache: new Map() } }, { now: base + 1000 * HOUR });
  assert.equal(getTicket(row.id).status, "OPEN");
});

test("the job file follows the registry shape", () => {
  assert.equal(job.name, "tickets");
  assert.equal(job.everyMs, 15 * 60 * 1000);
  assert.equal(typeof job.run, "function");
});

// ---------- admin command ----------

function adminCall(guild, { group = null, sub, options = {}, admin = true }) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild.id,
    user: { id: "admin" },
    member: { permissions: { has: () => admin } },
    options: {
      getSubcommandGroup: () => group,
      getSubcommand: () => sub,
      getString: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
      getRole: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
    },
    reply: async (p) => replies.push(p),
  };
}

test("caidat saves settings and refuses @everyone or a managed role as staff", async () => {
  const guild = fakeGuild();
  grant(guild.id, "pro", 30);
  const bad = adminCall(guild, { sub: "caidat", options: { role: { id: guild.id, managed: false } } });
  await command.execute(bad);
  assert.match(say(bad), /Role staff/);
  const managed = adminCall(guild, { sub: "caidat", options: { role: { id: STAFF, managed: true } } });
  await command.execute(managed);
  assert.match(say(managed), /Role staff/);
  assert.equal(getSection(guild.id, "tickets").staffRoleId, null);

  const ok = adminCall(guild, {
    sub: "caidat",
    options: { role: { id: STAFF, managed: false }, kenh: { id: PANEL }, danhmuc: { id: CATEGORY }, kenhlog: { id: LOG }, tudong: 0, toida: 3 },
  });
  await command.execute(ok);
  const saved = getSection(guild.id, "tickets");
  assert.deepEqual([saved.staffRoleId, saved.panelChannelId, saved.categoryId, saved.logChannelId, saved.autoCloseHours, saved.maxOpenPerUser], [STAFF, PANEL, CATEGORY, LOG, 0, 3]);
});

test("loai them and xoa respect the limit of 5 and keep at least one", async () => {
  const guild = fakeGuild();
  grant(guild.id, "pro", 30);
  for (const name of ["Mua hàng", "Báo lỗi", "Hợp tác", "Khác"]) {
    const i = adminCall(guild, { group: "loai", sub: "them", options: { ten: name, emoji: "🎁" } });
    await command.execute(i);
    assert.match(say(i), /Đã thêm/);
  }
  assert.equal(getSection(guild.id, "tickets").types.length, 5);
  const sixth = adminCall(guild, { group: "loai", sub: "them", options: { ten: "Thứ sáu" } });
  await command.execute(sixth);
  assert.match(say(sixth), /Tối đa 5/);
  const dup = adminCall(guild, { group: "loai", sub: "xoa", options: { ten: "khong co" } });
  await command.execute(dup);
  assert.match(say(dup), /Không thấy/);
  const removed = adminCall(guild, { group: "loai", sub: "xoa", options: { ten: "mua-hang" } });
  await command.execute(removed);
  assert.equal(getSection(guild.id, "tickets").types.length, 4);

  for (const key of ["bao-loi", "hop-tac", "khac"]) await command.execute(adminCall(guild, { group: "loai", sub: "xoa", options: { ten: key } }));
  const last = adminCall(guild, { group: "loai", sub: "xoa", options: { ten: "Hỗ trợ" } });
  await command.execute(last);
  assert.match(say(last), /ít nhất một/);

  const emoji = adminCall(guild, { group: "loai", sub: "them", options: { ten: "Zed", emoji: "abc" } });
  await command.execute(emoji);
  assert.match(say(emoji), /Emoji/);
});

test("dang posts the panel once, then edits it", async () => {
  const guild = proGuild();
  const panel = guild.channels.cache.get(PANEL);
  const edits = [];
  panel.messages = { fetch: async (id) => (id === panel.lastPosted ? { id, edit: async (p) => edits.push(p) } : Promise.reject(new Error("gone"))) };
  const send = panel.send;
  panel.send = async (p) => {
    const m = await send(p);
    panel.lastPosted = m.id;
    return m;
  };

  await command.execute(adminCall(guild, { sub: "dang" }));
  assert.equal(panel.sent.length, 1);
  assert.equal(panel.sent[0].components[0].components.length, 1);
  const messageId = getSection(guild.id, "tickets").panelMessageId;
  assert.equal(messageId, panel.lastPosted);

  await command.execute(adminCall(guild, { sub: "dang" }));
  assert.equal(panel.sent.length, 1);
  assert.equal(edits.length, 1);
});

test("dang needs the setup first, danhsach lists open tickets, tat turns it off", async () => {
  const bare = fakeGuild();
  grant(bare.id, "pro", 30);
  const need = adminCall(bare, { sub: "dang" });
  await command.execute(need);
  assert.match(say(need), /caidat/);

  const { guild, row } = await openedTicket();
  const list = adminCall(guild, { sub: "danhsach" });
  await command.execute(list);
  assert.match(list.replies[0].embeds[0].data.description, new RegExp(`#${row.id} <#${row.channel_id}>`));

  const empty = adminCall(fakeGuild({ id: bare.id }), { sub: "danhsach" });
  await command.execute(empty);
  assert.match(say(empty), /Chưa có ticket/);

  const off = adminCall(guild, { sub: "tat" });
  await command.execute(off);
  assert.equal(getSection(guild.id, "tickets").enabled, false);
  assert.equal(listOpen(guild.id).length, 1, "open tickets are kept");
});

test("free servers are gated on every admin subcommand except tat, and non administrators are refused", async () => {
  const free = fakeGuild();
  for (const [sub, group] of [["caidat"], ["dang"], ["danhsach"], ["them", "loai"]]) {
    const i = adminCall(free, { sub, group: group ?? null, options: { ten: "x" } });
    await command.execute(i);
    assert.match(say(i), /Pro/);
  }
  const off = adminCall(free, { sub: "tat" });
  await command.execute(off);
  assert.match(say(off), /Đã tắt/);

  const pro = proGuild();
  const nope = adminCall(pro, { sub: "danhsach", admin: false });
  await command.execute(nope);
  assert.equal(nope.replies[0].embeds, undefined);
  assert.ok(say(nope));
});
