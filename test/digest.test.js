import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AutoModerationActionType, ChannelType, MessageType } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "digest-test-"));

const { getDb } = await import("../src/db.js");
const { getSection, setSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");
const { countEvents } = await import("../src/analytics.js");
const { isDue, lastSlot, auditDue, droppedBy, DAY, WEEK } = await import("../src/digest/schedule.js");
const { buildDigest, buildDropAlert, healthLine, suggest } = await import("../src/digest/build.js");
const { collectStats } = await import("../src/digest/stats.js");
const { sendDigest, sendDropAlert, fixRows } = await import("../src/digest/index.js");
const { runDigestJob } = await import("../src/jobs/digest.js");
const { runAuditJob } = await import("../src/jobs/audit.js");
const { runExpiryJob } = await import("../src/jobs/expiry.js");
const { countJoin } = await import("../src/events/digestJoins.js");
const { countBlock } = await import("../src/events/digestAutomod.js");
const vietgiup = (await import("../src/commands/vietgiup.js")).default;

const TZ = "Asia/Ho_Chi_Minh";
// Monday 2026-10-05, 09:30 in Ho Chi Minh City
const MON = Date.UTC(2026, 9, 5, 2, 30);
const CH = "400000000000000001";
const CH2 = "400000000000000002";

let n = 0;
const gid = () => `5${String((n += 1)).padStart(17, "0")}`;

function channel(id, { perms = true } = {}) {
  const sent = [];
  return { id, type: ChannelType.GuildText, sent, permissionsFor: () => ({ has: () => perms }), send: async (payload) => (sent.push(payload), { id: `m${sent.length}` }) };
}

function fakeGuild({ channels = [channel(CH)], system = null, filter = 0, verification = 0 } = {}) {
  const guild = {
    id: gid(),
    name: "Công Trình Thử",
    verificationLevel: verification,
    explicitContentFilter: filter,
    roles: { everyone: { permissions: 0n } },
    channels: { cache: new Map(channels.map((c) => [c.id, c])) },
    systemChannel: system,
    members: { me: { id: "1" } },
    filterCalls: [],
    setExplicitContentFilter: async (level) => {
      guild.filterCalls.push(level);
      guild.explicitContentFilter = level;
    },
    setVerificationLevel: async (level) => {
      guild.verificationLevel = level;
    },
  };
  return guild;
}
const clientOf = (...guilds) => ({ guilds: { cache: new Map(guilds.map((g) => [g.id, g])) } });
const report = (score, fixIds = [], createdAt = Date.now()) => ({
  score,
  grade: "ổn",
  createdAt,
  stats: {},
  findings: fixIds.map((fixId) => ({ severity: "cao", title: `Lỗi ${fixId}`, detail: "chi tiết", fixId })),
});
const fields = (embed) => Object.fromEntries(embed.fields.map((f) => [f.name, f.value]));
const dataOf = (message) => message.embeds[0].data;
const insertReport = (guildId, score, createdAt) =>
  getDb().prepare("INSERT INTO audit_reports (guild_id, score, report, created_at) VALUES (?, ?, ?, ?)").run(guildId, score, JSON.stringify(report(score, [], createdAt)), createdAt);

// ---------------------------------------------------------------- schedule

test("the slot is the latest weekday and hour in the configured time zone", () => {
  const slot = lastSlot(MON, { weekday: 1, hour: 9 }, TZ);
  assert.equal(slot.hoursSince, 0);
  assert.equal(slot.start, Date.UTC(2026, 9, 5, 2, 0));
  assert.equal(lastSlot(MON + 3 * DAY, { weekday: 1, hour: 9 }, TZ).hoursSince, 72);
  // the same instant is still Sunday evening in a zone far behind
  assert.equal(lastSlot(Date.UTC(2026, 9, 5, 2, 30), { weekday: 0, hour: 20 }, "America/Los_Angeles").hoursSince, 167);
  // a time zone nobody knows falls back to UTC instead of throwing
  assert.doesNotThrow(() => lastSlot(MON, { weekday: 1, hour: 9 }, "Not/AZone"));
});

test("the report is due once per week, inside the catch-up window, and never without a channel", () => {
  const s = { enabled: true, channelId: CH, weekday: 1, hour: 9, lastSentAt: 0 };
  assert.equal(isDue(s, MON, TZ), true);
  assert.equal(isDue(s, MON - 31 * 60_000, TZ), false, "08:59 is before the slot");
  assert.equal(isDue(s, MON + 20 * 60 * 60 * 1000, TZ), true, "still inside the 24 hour catch-up window");
  assert.equal(isDue(s, MON + 30 * 60 * 60 * 1000, TZ), false, "missed by more than a day, wait for next week");
  assert.equal(isDue({ ...s, lastSentAt: MON }, MON + 10 * 60_000, TZ), false, "already sent this week");
  assert.equal(isDue({ ...s, lastSentAt: MON }, MON + WEEK, TZ), true, "next week it is due again");
  assert.equal(isDue({ ...s, enabled: false }, MON, TZ), false);
  assert.equal(isDue({ ...s, channelId: null }, MON, TZ), false);
});

test("the weekly check waits a week and drops are counted from ten points", () => {
  const s = { enabled: true, auditWeekly: true, lastAuditAt: MON };
  assert.equal(auditDue(s, MON + DAY), false);
  assert.equal(auditDue(s, MON + WEEK), true);
  assert.equal(auditDue({ ...s, auditWeekly: false }, MON + WEEK), false);
  assert.equal(auditDue({ ...s, enabled: false }, MON + WEEK), false);
  assert.equal(droppedBy(80, 70), true);
  assert.equal(droppedBy(80, 71), false);
  assert.equal(droppedBy(null, 10), false);
  assert.equal(droppedBy(80, undefined), false);
});

// ---------------------------------------------------------------- the pure embed

test("the digest embed shows the week's numbers, the health trend and at most three suggestions", () => {
  const stats = {
    joins: 12,
    ticketsOpened: 4,
    ticketsClosed: 3,
    automodBlocks: 9,
    score: 62,
    previousScore: 70,
    openTickets: 6,
    automodOn: false,
    fixes: [
      { id: "content-filter", title: "Bật quét nội dung", change: "Bật quét cho mọi thành viên" },
      { id: "verification-medium", title: "Nâng xác minh", change: "Lên mức Trung bình" },
    ],
  };
  const built = buildDigest(stats, { guildName: "Quán Thầu" });
  const f = fields(built.embed);
  assert.equal(f["Người mới vào"], "12");
  assert.equal(f["Ticket đã mở"], "4");
  assert.equal(f["Ticket đã đóng"], "3");
  assert.equal(f["Tin bị AutoMod chặn"], "9");
  assert.match(f["Sức khoẻ server"], /62\/100.*tụt 8 điểm/);
  assert.equal(built.suggestions.length, 3, "two fixes plus the first tip, no more than three");
  assert.deepEqual(built.fixIds, ["content-filter", "verification-medium"]);
  assert.match(built.embed.description, /Quán Thầu/);
  assert.match(built.embed.footer, /không đọc|Chỉnh lịch/);
  for (const field of built.embed.fields) assert.ok(field.value.length <= 1024);
});

test("the health line covers rise, fall, flat, first time and no data", () => {
  assert.match(healthLine(80, 70), /tăng 10/);
  assert.match(healthLine(60, 70), /tụt 10/);
  assert.match(healthLine(70, 70), /y như/);
  assert.match(healthLine(70, null), /lần đầu/);
  assert.match(healthLine(null, 70), /Chưa khám/);
});

test("a quiet server gets the all good line and a hostile name or title cannot grow the embed", () => {
  const quiet = buildDigest({ joins: 0, ticketsOpened: 0, ticketsClosed: 0, automodBlocks: 0, score: 90, previousScore: 90, automodOn: true, fixes: [] });
  assert.match(fields(quiet.embed)["Thầu đề xuất"], /Thầu ngồi uống trà/);
  assert.deepEqual(quiet.fixIds, []);
  const hostile = buildDigest({ joins: "9e99", ticketsOpened: -5, ticketsClosed: NaN, automodBlocks: 1, score: 50, fixes: [{ id: "content-filter", title: "x".repeat(500), change: "y".repeat(500) }] }, { guildName: "z".repeat(5000) });
  assert.ok(hostile.embed.description.length <= 400);
  assert.equal(fields(hostile.embed)["Ticket đã mở"], "0");
  assert.equal(fields(hostile.embed)["Ticket đã đóng"], "0");
  assert.ok(fields(hostile.embed)["Thầu đề xuất"].length <= 1000);
  assert.equal(suggest({ fixes: Array.from({ length: 9 }, (_, i) => ({ id: `f${i}`, title: "t", change: "c" })) }).length, 3);
});

test("the drop alert names the worst findings first and offers the fixes", () => {
  const built = buildDropAlert({
    before: 80,
    after: 60,
    findings: [
      { severity: "thap", title: "Nhẹ", detail: "" },
      { severity: "cao", title: "Nặng nhất", detail: "" },
      { severity: "vua", title: "Vừa vừa", detail: "" },
      { severity: "thap", title: "Nhẹ hai", detail: "" },
    ],
    fixes: [{ id: "content-filter" }],
  });
  assert.match(built.embed.description, /80\/100.*60\/100/s);
  assert.ok(built.embed.description.indexOf("Nặng nhất") < built.embed.description.indexOf("Vừa vừa"));
  assert.ok(!built.embed.description.includes("Nhẹ hai"), "only the top three");
  assert.deepEqual(built.fixIds, ["content-filter"]);
  assert.match(buildDropAlert({ before: 80, after: 60, findings: [], fixes: [] }).embed.description, /khamsuckhoe/);
});

test("fix buttons are owned by /vietgiup, capped at three and only built from fix ids", () => {
  const rows = fixRows(["content-filter", "content-filter", "verification-medium", "strip-everyone", "extra"], { "content-filter": "Quét nội dung" });
  assert.equal(rows.length, 1);
  const buttons = rows[0].toJSON().components;
  assert.equal(buttons.length, 3);
  for (const b of buttons) assert.match(b.custom_id, /^vietgiup:fix:[a-z-]+$/);
  assert.deepEqual(fixRows([]), []);
});

// ---------------------------------------------------------------- counting events and the stats

test("joins are counted from the join notice once, bots and other messages are not", () => {
  const g = gid();
  const notice = (id, extra = {}) => ({ id, type: MessageType.UserJoin, guildId: g, author: { bot: false }, ...extra });
  assert.equal(countJoin(notice("1001")), true);
  assert.equal(countJoin(notice("1001")), false, "the same notice twice counts once");
  assert.equal(countJoin(notice("1002", { author: { bot: true } })), false);
  assert.equal(countJoin({ id: "1003", type: MessageType.Default, guildId: g, author: { bot: false } }), false);
  assert.equal(countJoin({ id: "1004", type: MessageType.UserJoin, author: { bot: false } }), false, "no server, nothing to count");
  assert.equal(countEvents(g, "join"), 1);
});

test("only the block action of an AutoMod hit is counted, and only the server id is kept", () => {
  const g = gid();
  assert.equal(countBlock({ guild: { id: g }, action: { type: AutoModerationActionType.BlockMessage }, content: "secret", userId: "77" }), true);
  assert.equal(countBlock({ guild: { id: g }, action: { type: AutoModerationActionType.SendAlertMessage } }), false);
  assert.equal(countBlock({ guild: { id: g }, action: { type: AutoModerationActionType.Timeout } }), false);
  assert.equal(countBlock({ action: { type: AutoModerationActionType.BlockMessage } }), false);
  assert.equal(countEvents(g, "automod_block"), 1);
  const row = getDb().prepare("SELECT * FROM events_log WHERE guild_id = ? AND kind = 'automod_block'").get(g);
  assert.deepEqual(Object.keys(row).sort(), ["at", "guild_id", "id", "kind"]);
});

test("the stats count this week only and compare with the check from a week ago", async () => {
  const guild = fakeGuild({ filter: 0 });
  const g = guild.id;
  const db = getDb();
  const track = (kind, at) => db.prepare("INSERT INTO events_log (guild_id, kind, at) VALUES (?, ?, ?)").run(g, kind, at);
  track("join", MON - DAY);
  track("join", MON - 2 * DAY);
  track("join", MON - 8 * DAY);
  track("automod_block", MON - 3 * DAY);
  track("automod_block", MON - 9 * DAY);
  const ticket = (created, closed) =>
    db.prepare("INSERT INTO tickets (guild_id, channel_id, user_id, type, status, created_at, closed_at) VALUES (?, ?, ?, 'ho-tro', ?, ?, ?)").run(g, `c${Math.random()}`, "u", closed ? "closed" : "open", created, closed);
  ticket(MON - DAY, MON - 12 * 60 * 60 * 1000);
  ticket(MON - 2 * DAY, null);
  ticket(MON - 20 * DAY, MON - 2 * DAY);
  ticket(MON - 20 * DAY, MON - 19 * DAY);
  insertReport(g, 72, MON - 7 * DAY);
  insertReport(g, 90, MON - DAY);

  const stats = await collectStats(guild, { now: MON, audit: async () => report(65, ["content-filter"], MON) });
  assert.equal(stats.joins, 2);
  assert.equal(stats.automodBlocks, 1);
  assert.equal(stats.ticketsOpened, 2);
  assert.equal(stats.ticketsClosed, 2);
  assert.equal(stats.openTickets, 1);
  assert.equal(stats.score, 65);
  assert.equal(stats.previousScore, 72, "the newest check that is at least five days old");
  assert.deepEqual(stats.fixes.map((f) => f.id), ["content-filter"]);

  const noAudit = await collectStats(guild, { now: MON, freshAudit: false });
  assert.equal(noAudit.score, 90, "without a fresh check the latest stored one is used");
  const broken = await collectStats(guild, { now: MON, audit: async () => { throw new Error("boom"); } });
  assert.equal(broken.score, 90, "a failing check falls back to the stored one");
});

// ---------------------------------------------------------------- posting

test("sendDigest posts one embed with no mentions and remembers the score, a preview leaves the schedule alone", async () => {
  const c = channel(CH);
  const guild = fakeGuild({ channels: [c], filter: 0 });
  setSection(guild.id, "digest", { enabled: true, channelId: CH });
  const audit = async () => report(66, ["content-filter"], MON);
  const real = await sendDigest(guild, { settings: getSection(guild.id, "digest"), now: MON, audit });
  assert.equal(real.ok, true);
  assert.equal(c.sent.length, 1);
  assert.deepEqual(c.sent[0].allowedMentions, { parse: [] });
  assert.equal(dataOf(c.sent[0]).title, "📋 Báo cáo tuần của thầu");
  assert.equal(c.sent[0].components[0].toJSON().components[0].custom_id, "vietgiup:fix:content-filter");
  assert.equal(getSection(guild.id, "digest").lastScore, 66);

  const preview = await sendDigest(guild, { settings: getSection(guild.id, "digest"), preview: true, now: MON });
  assert.equal(preview.ok, true);
  assert.match(dataOf(c.sent[1]).title, /gửi thử/);
  assert.equal(getSection(guild.id, "digest").lastSentAt, 0);
});

test("sendDigest never posts to a guess: no channel, or a channel without permission, posts nothing and says why", async () => {
  const sys = channel("400000000000000009");
  const guild = fakeGuild({ channels: [], system: sys });
  const none = await sendDigest(guild, { settings: { channelId: CH }, now: MON, audit: async () => report(70) });
  assert.deepEqual([none.ok, none.reason], [false, "channel"]);
  assert.equal(sys.sent.length, 0, "the system channel is not a fallback for the report");

  const locked = channel(CH, { perms: false });
  const g2 = fakeGuild({ channels: [locked] });
  const denied = await sendDigest(g2, { settings: { channelId: CH }, now: MON, audit: async () => report(70) });
  assert.deepEqual([denied.ok, denied.reason], [false, "perms"]);
  assert.deepEqual(denied.missing, ["Xem kênh", "Gửi tin nhắn", "Nhúng liên kết"]);
  assert.equal(locked.sent.length, 0);

  const failing = channel(CH);
  failing.send = async () => {
    throw new Error("Unknown Channel");
  };
  const g3 = fakeGuild({ channels: [failing] });
  const failed = await sendDigest(g3, { settings: { channelId: CH }, now: MON, audit: async () => report(70) });
  assert.deepEqual([failed.ok, failed.reason], [false, "failed"]);
});

// ---------------------------------------------------------------- the weekly job

test("the digest job sends once per week, survives a restart, and one failing server does not stop the others", async () => {
  const a = fakeGuild();
  const b = fakeGuild();
  const off = fakeGuild();
  for (const g of [a, b]) setSection(g.id, "digest", { enabled: true, channelId: CH, weekday: 1, hour: 9 });
  setSection(off.id, "digest", { enabled: false, channelId: CH, weekday: 1, hour: 9 });
  const client = clientOf(a, b, off);
  const calls = [];
  const send = async (guild, o) => {
    calls.push(guild.id);
    if (guild.id === a.id) throw new Error("Discord is down");
    return { ok: true };
  };
  const first = await runDigestJob(client, { now: MON, timeZone: TZ, send });
  assert.deepEqual(first, [b.id]);
  assert.deepEqual(calls.sort(), [a.id, b.id].sort());

  // ten minutes later, and again after a "restart" (nothing is kept in memory): nobody is sent twice, not even the one that failed
  assert.deepEqual(await runDigestJob(client, { now: MON + 10 * 60_000, timeZone: TZ, send }), []);
  assert.deepEqual(await runDigestJob(client, { now: MON + 20 * 60_000, timeZone: TZ, send }), []);
  assert.equal(calls.length, 2);
  assert.equal(getSection(b.id, "digest").lastSentAt, MON);
  assert.equal(getSection(off.id, "digest").lastSentAt, 0);

  // next week both are due again
  assert.deepEqual((await runDigestJob(client, { now: MON + WEEK, timeZone: TZ, send })).sort(), [b.id]);
  assert.equal(calls.length, 4);
});

test("the digest job posts the real report end to end", async () => {
  const c = channel(CH);
  const guild = fakeGuild({ channels: [c] });
  setSection(guild.id, "digest", { enabled: true, channelId: CH, weekday: 1, hour: 9 });
  const send = (g, o) => sendDigest(g, { ...o, audit: async () => report(88) });
  assert.deepEqual(await runDigestJob(clientOf(guild), { now: MON, timeZone: TZ, send }), [guild.id]);
  assert.equal(c.sent.length, 1);
  assert.ok(dataOf(c.sent[0]).fields.find((f) => f.name === "Sức khoẻ server").value.startsWith("**88/100**"));
  assert.deepEqual(await runDigestJob(clientOf(guild), { now: MON + 60_000, timeZone: TZ, send }), []);
  assert.equal(c.sent.length, 1);
});

// ---------------------------------------------------------------- the weekly health check

test("a drop of ten points or more is posted once with the safe fix button, a smaller one is not", async () => {
  const c = channel(CH);
  const guild = fakeGuild({ channels: [c], filter: 0 });
  setSection(guild.id, "digest", { enabled: true, channelId: CH, auditWeekly: true, lastScore: 80 });
  const client = clientOf(guild);
  let calls = 0;
  const audit = async () => (calls += 1, report(65, ["content-filter"], MON));
  const alerted = await runAuditJob(client, { now: MON, audit });
  assert.deepEqual(alerted, [guild.id]);
  assert.equal(c.sent.length, 1);
  assert.equal(dataOf(c.sent[0]).title, "🚨 Điểm sức khoẻ server tụt mạnh");
  assert.match(dataOf(c.sent[0]).description, /80\/100/);
  assert.deepEqual(c.sent[0].allowedMentions, { parse: [] });
  assert.equal(c.sent[0].components[0].toJSON().components[0].custom_id, "vietgiup:fix:content-filter");
  assert.equal(getSection(guild.id, "digest").lastScore, 65);
  assert.equal(getSection(guild.id, "digest").lastAuditAt, MON);

  // the same week again: no second check, no second alert
  assert.deepEqual(await runAuditJob(client, { now: MON + 2 * DAY, audit }), []);
  assert.equal(calls, 1);

  // next week the score falls only 9 points: checked, stored, not alerted
  const small = await runAuditJob(client, { now: MON + WEEK, audit: async () => report(56) });
  assert.deepEqual(small, []);
  assert.equal(getSection(guild.id, "digest").lastScore, 56);
  assert.equal(c.sent.length, 1);
});

test("the weekly check skips servers that did not opt in and a failing check is retried next week, not every hour", async () => {
  const off = fakeGuild();
  setSection(off.id, "digest", { enabled: true, channelId: CH, auditWeekly: false, lastScore: 90 });
  const disabled = fakeGuild();
  setSection(disabled.id, "digest", { enabled: false, channelId: CH, auditWeekly: true, lastScore: 90 });
  const failing = fakeGuild();
  setSection(failing.id, "digest", { enabled: true, channelId: CH, auditWeekly: true, lastScore: 90 });
  let seen = [];
  const audit = async (g) => {
    seen.push(g.id);
    throw new Error("no access");
  };
  const client = clientOf(off, disabled, failing);
  assert.deepEqual(await runAuditJob(client, { now: MON, audit }), []);
  assert.deepEqual(seen, [failing.id]);
  assert.equal(getSection(failing.id, "digest").lastAuditAt, MON);
  assert.equal(getSection(failing.id, "digest").lastScore, 90, "a failed check keeps the old score");
  seen = [];
  await runAuditJob(client, { now: MON + 60 * 60_000, audit });
  assert.deepEqual(seen, []);
});

test("a first check has nothing to compare with, so it never alerts", async () => {
  const c = channel(CH);
  const guild = fakeGuild({ channels: [c] });
  setSection(guild.id, "digest", { enabled: true, channelId: CH, auditWeekly: true });
  assert.deepEqual(await runAuditJob(clientOf(guild), { now: MON, audit: async () => report(10) }), []);
  assert.equal(c.sent.length, 0);
  assert.equal(getSection(guild.id, "digest").lastScore, 10);
});

test("a drop alert that cannot be posted is reported as not sent, without throwing", async () => {
  const locked = channel(CH, { perms: false });
  const guild = fakeGuild({ channels: [locked] });
  const result = await sendDropAlert(guild, { settings: { channelId: CH }, before: 90, after: 50, report: report(50) });
  assert.equal(result.ok, false);
  assert.equal(locked.sent.length, 0);
});

// ---------------------------------------------------------------- plan expiry reminders

test("a plan reminder goes out once, three days before the end", async () => {
  const c = channel(CH);
  const guild = fakeGuild({ channels: [c] });
  setSection(guild.id, "digest", { channelId: CH });
  grant(guild.id, "pro", 30, MON);
  const client = clientOf(guild);
  assert.deepEqual(await runExpiryJob(client, { now: MON + 20 * DAY }), []);
  assert.equal(c.sent.length, 0);
  const soon = await runExpiryJob(client, { now: MON + 27.5 * DAY });
  assert.deepEqual(soon, [{ guildId: guild.id, kind: "soon" }]);
  assert.match(dataOf(c.sent[0]).title, /Pro sắp hết hạn/);
  assert.match(dataOf(c.sent[0]).description, /\/mua/);
  assert.match(dataOf(c.sent[0]).description, /<t:\d+:F>/);
  assert.deepEqual(c.sent[0].allowedMentions, { parse: [] });
  assert.deepEqual(await runExpiryJob(client, { now: MON + 28 * DAY }), []);
  assert.deepEqual(await runExpiryJob(client, { now: MON + 29.9 * DAY }), []);
  assert.equal(c.sent.length, 1);
});

test("an ended plan is announced once, only while it is still fresh news", async () => {
  const c = channel(CH);
  const guild = fakeGuild({ channels: [c] });
  setSection(guild.id, "digest", { channelId: CH });
  grant(guild.id, "plus", 10, MON);
  const client = clientOf(guild);
  const ended = await runExpiryJob(client, { now: MON + 10 * DAY + 60_000 });
  assert.deepEqual(ended, [{ guildId: guild.id, kind: "ended" }]);
  assert.match(dataOf(c.sent[0]).title, /Plus đã hết hạn/);
  assert.deepEqual(await runExpiryJob(client, { now: MON + 11 * DAY }), []);
  assert.equal(c.sent.length, 1);

  const old = channel(CH);
  const stale = fakeGuild({ channels: [old] });
  setSection(stale.id, "digest", { channelId: CH });
  grant(stale.id, "pro", 5, MON);
  assert.deepEqual(await runExpiryJob(clientOf(stale), { now: MON + 40 * DAY }), []);
  assert.equal(old.sent.length, 0, "a plan that ended a month ago is not announced");
});

test("a renewed plan gets no ended notice and its new end gets its own reminder", async () => {
  const c = channel(CH);
  const guild = fakeGuild({ channels: [c] });
  setSection(guild.id, "digest", { channelId: CH });
  grant(guild.id, "pro", 10, MON);
  const client = clientOf(guild);
  await runExpiryJob(client, { now: MON + 8 * DAY });
  assert.equal(c.sent.length, 1);
  grant(guild.id, "pro", 30, MON + 9 * DAY);
  assert.deepEqual(await runExpiryJob(client, { now: MON + 10 * DAY + 1000 }), [], "renewed, so nothing ended");
  assert.equal(c.sent.length, 1);
  assert.equal((await runExpiryJob(client, { now: MON + 38 * DAY })).length, 1, "the new end is announced once");
  assert.equal(c.sent.length, 2);
});

test("the reminder falls back to the system channel and stays quiet when nothing can be posted", async () => {
  const sys = channel("400000000000000009");
  const guild = fakeGuild({ channels: [], system: sys });
  grant(guild.id, "pro", 10, MON);
  await runExpiryJob(clientOf(guild), { now: MON + 8 * DAY });
  assert.equal(sys.sent.length, 1);

  const locked = channel(CH, { perms: false });
  const quiet = fakeGuild({ channels: [locked] });
  setSection(quiet.id, "digest", { channelId: CH });
  grant(quiet.id, "pro", 10, MON);
  const client = clientOf(quiet);
  assert.deepEqual(await runExpiryJob(client, { now: MON + 8 * DAY }), []);
  assert.deepEqual(await runExpiryJob(client, { now: MON + 8.5 * DAY }), []);
  assert.equal(locked.sent.length, 0);
  const none = fakeGuild({ channels: [] });
  grant(none.id, "pro", 10, MON);
  assert.deepEqual(await runExpiryJob(clientOf(none), { now: MON + 8 * DAY }), []);
});

test("servers that never had a paid plan, or the bot has left, get no reminder", async () => {
  const c = channel(CH);
  const free = fakeGuild({ channels: [c] });
  setSection(free.id, "digest", { channelId: CH });
  const gone = gid();
  grant(gone, "pro", 10, MON);
  assert.deepEqual(await runExpiryJob(clientOf(free), { now: MON + 9 * DAY }), []);
  assert.equal(c.sent.length, 0);
});

// ---------------------------------------------------------------- the fix buttons on a report

function press(guild, { admin = true, userId = "u1" } = {}) {
  const out = [];
  return {
    out,
    guild,
    guildId: guild.id,
    user: { id: userId },
    member: { permissions: { has: () => admin } },
    reply: async (p) => out.push(["reply", p]),
    update: async (p) => out.push(["update", p]),
    deferUpdate: async () => out.push(["defer"]),
    editReply: async (p) => out.push(["edit", p]),
  };
}

test("a fix button asks an admin to confirm, and nothing changes until the confirm button is used by the same person", async () => {
  const guild = fakeGuild({ filter: 0 });
  const ask = press(guild);
  await vietgiup.handleComponent(ask, ["fix", "content-filter"]);
  const [kind, payload] = ask.out[0];
  assert.equal(kind, "reply");
  assert.match(payload.content, /không cấp thêm quyền/);
  const go = payload.components[0].toJSON().components[0].custom_id;
  assert.equal(go, "vietgiup:go:u1:content-filter");
  assert.deepEqual(guild.filterCalls, [], "asking changed nothing");

  const stranger = press(guild, { userId: "u2" });
  await vietgiup.handleComponent(stranger, ["go", "u1", "content-filter"]);
  assert.deepEqual(guild.filterCalls, []);

  const confirm = press(guild);
  await vietgiup.handleComponent(confirm, ["go", "u1", "content-filter"]);
  assert.equal(guild.filterCalls.length, 1);
  assert.ok(confirm.out.some(([k, p]) => k === "edit" && /Điểm sức khoẻ/.test(p.content)));
});

test("fix buttons refuse non admins and ids that are not safe fixes", async () => {
  const guild = fakeGuild({ filter: 0 });
  const plain = press(guild, { admin: false });
  await vietgiup.handleComponent(plain, ["fix", "content-filter"]);
  assert.match(plain.out[0][1].content, /admin/);
  await vietgiup.handleComponent(plain, ["go", "u1", "content-filter"]);
  assert.deepEqual(guild.filterCalls, []);

  const admin = press(guild);
  await vietgiup.handleComponent(admin, ["fix", "constructor"]);
  await vietgiup.handleComponent(admin, ["fix", "__proto__"]);
  await vietgiup.handleComponent(admin, ["go", "u1", "ban-everyone"]);
  assert.equal(admin.out.length, 3);
  assert.deepEqual(guild.filterCalls, []);

  const fixed = fakeGuild({ filter: 2 });
  const already = press(fixed);
  await vietgiup.handleComponent(already, ["fix", "content-filter"]);
  assert.match(already.out[0][1].content, /không còn gì/);

  const dm = press({ ...guild });
  dm.guild = null;
  await vietgiup.handleComponent(dm, ["fix", "content-filter"]);
  assert.match(dm.out[0][1].content, /chỉ chạy trong server/);
});

test("cancelling a fix touches nothing", async () => {
  const guild = fakeGuild({ filter: 0 });
  const i = press(guild);
  await vietgiup.handleComponent(i, ["no", "u1"]);
  assert.equal(i.out[0][0], "update");
  assert.deepEqual(guild.filterCalls, []);
});

// ---------------------------------------------------------------- hygiene

test("the new files have no em dash and never mention a tool or vendor", () => {
  const dash = String.fromCharCode(0x2014);
  const banned = [["cla", "ude"], ["anthro", "pic"], ["co", "pilot"], ["chat", "gpt"], ["open", "ai"]].map((p) => p.join(""));
  const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "src");
  const files = ["jobs/digest.js", "jobs/audit.js", "jobs/expiry.js", "digest/schedule.js", "digest/build.js", "digest/stats.js", "digest/channel.js", "digest/index.js", "events/digestJoins.js", "events/digestAutomod.js", "humor/digest.js", "humor/helper.js", "ai/helper.js", "commands/vietgiup.js"];
  for (const file of files) {
    const code = readFileSync(path.join(root, file), "utf8");
    assert.ok(!code.includes(dash), `${file} has an em dash`);
    for (const word of banned) assert.ok(!code.toLowerCase().includes(word), `${file} mentions ${word}`);
  }
});
