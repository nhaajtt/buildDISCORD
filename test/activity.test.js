import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MessageFlags, PermissionFlagsBits } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "activity-test-"));

const level = await import("../src/activity/level.js");
const xp = await import("../src/activity/xp.js");
const { createVoiceTracker } = await import("../src/activity/voice.js");
const { handleMessageXp } = await import("../src/events/activityXp.js");
const { handleVoiceUpdate } = await import("../src/events/voiceXp.js");
const { patchSection, getSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");
const { getDb } = await import("../src/db.js");
const hang = (await import("../src/commands/hang.js")).default;
const board = (await import("../src/commands/bangxephang.js")).default;
const { cleanText, defang } = await import("../src/activity/text.js");

const { levelForXp, xpForLevel, progressFor, progressBar, tierForLevel, MAX_LEVEL } = level;

let counter = 0;
const gid = () => `9100000000000${String(++counter).padStart(4, "0")}`;
const U1 = "910000000000000001";
const U2 = "910000000000000002";
const U3 = "910000000000000003";
const SETTINGS = { enabled: true, xpPerMessage: 5, cooldownSec: 60, dailyCap: 20, voiceEnabled: true, voiceXpPerMin: 2, announceChannelId: null };
const T0 = Date.UTC(2026, 5, 10, 8, 0, 0);

function proGuild(extra = {}) {
  const id = gid();
  grant(id, "pro", 30);
  patchSection(id, "activity", { enabled: true, ...extra });
  xp.clearActivityCache(id);
  return id;
}

// ---------- level curve ----------

test("the level curve is monotone and inverts exactly", () => {
  assert.equal(xpForLevel(0), 0);
  assert.equal(xpForLevel(1), 75);
  assert.equal(xpForLevel(10), 2100);
  let previous = -1;
  for (let n = 0; n <= MAX_LEVEL; n += 1) {
    const needed = xpForLevel(n);
    assert.ok(needed > previous);
    previous = needed;
    assert.equal(levelForXp(needed), n, `level ${n} at its own threshold`);
    if (n > 0) assert.equal(levelForXp(needed - 1), n - 1, `one xp short of level ${n}`);
  }
});

test("the level curve survives junk input", () => {
  for (const bad of [NaN, undefined, null, -5, "abc", Infinity]) assert.ok(levelForXp(bad) >= 0 && levelForXp(bad) <= MAX_LEVEL);
  assert.equal(levelForXp(-100), 0);
  assert.equal(levelForXp(1e12), MAX_LEVEL);
  assert.equal(xpForLevel(-3), 0);
  assert.equal(xpForLevel(99999), xpForLevel(MAX_LEVEL));
});

test("progress and bar", () => {
  const p = progressFor(100);
  assert.equal(p.level, 1);
  assert.equal(p.into, 25);
  assert.equal(p.nextAt, xpForLevel(2));
  assert.equal(progressFor(xpForLevel(MAX_LEVEL) + 50).nextAt, null);
  assert.equal(progressBar(0.5, 10), "▰▰▰▰▰▱▱▱▱▱");
  assert.equal(progressBar(-4, 4), "▱▱▱▱");
  assert.equal(progressBar(9, 4), "▰▰▰▰");
  assert.equal(tierForLevel(0), 0);
  assert.equal(tierForLevel(5), 1);
  assert.equal(tierForLevel(49), 4);
  assert.equal(tierForLevel(50), 5);
});

test("text cleaning removes control and direction characters", () => {
  assert.equal(cleanText("  a\n\nb‮​c  ", 50), "a bc");
  assert.equal(cleanText(42, 5), "");
  assert.equal(cleanText("x".repeat(500), 10).length, 10);
  assert.ok(!defang("@everyone @here <@123>").includes("@everyone"));
});

// ---------- xp grants ----------

test("message xp respects the cooldown", () => {
  xp.resetXpCache();
  const g = gid();
  assert.equal(xp.grantMessageXp(g, U1, SETTINGS, { now: T0 }).granted, 5);
  assert.deepEqual(xp.grantMessageXp(g, U1, SETTINGS, { now: T0 + 59_000 }), { granted: 0, reason: "cooldown" });
  assert.equal(xp.grantMessageXp(g, U1, SETTINGS, { now: T0 + 60_000 }).granted, 5);
  // another person has their own cooldown
  assert.equal(xp.grantMessageXp(g, U2, SETTINGS, { now: T0 + 1000 }).granted, 5);
  // a clock that goes backwards never grants extra
  assert.equal(xp.grantMessageXp(g, U1, SETTINGS, { now: T0 - 10_000_000 }).granted, 0);
});

test("the daily cap stops xp and resets on the next day", () => {
  xp.resetXpCache();
  const g = gid();
  let total = 0;
  for (let i = 0; i < 10; i += 1) total += xp.grantMessageXp(g, U1, SETTINGS, { now: T0 + i * 61_000 }).granted;
  assert.equal(total, 20);
  assert.equal(xp.grantMessageXp(g, U1, SETTINGS, { now: T0 + 11 * 61_000 }).reason, "cap");
  const tomorrow = T0 + 26 * 3_600_000;
  assert.equal(xp.grantMessageXp(g, U1, SETTINGS, { now: tomorrow }).granted, 5);
});

test("a partial cap grants only what is left", () => {
  xp.resetXpCache();
  const g = gid();
  const tight = { ...SETTINGS, xpPerMessage: 15, dailyCap: 20 };
  assert.equal(xp.grantMessageXp(g, U1, tight, { now: T0 }).granted, 15);
  assert.equal(xp.grantMessageXp(g, U1, tight, { now: T0 + 61_000 }).granted, 5);
  assert.equal(xp.grantMessageXp(g, U1, tight, { now: T0 + 122_000 }).granted, 0);
});

test("xp is batched, then saved, and survives a restart with its cooldown and cap", () => {
  xp.resetXpCache();
  const g = gid();
  xp.grantMessageXp(g, U1, SETTINGS, { now: T0 });
  // nothing written yet: the write is batched
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM xp WHERE guild_id = ?").get(g).n, 0);
  xp.flushXp();
  const row = getDb().prepare("SELECT * FROM xp WHERE guild_id = ?").get(g);
  assert.equal(row.xp, 5);
  assert.equal(row.msgs, 1);
  // a restart forgets memory, the database remembers the cooldown and the day total
  xp.resetXpCache();
  assert.equal(xp.grantMessageXp(g, U1, SETTINGS, { now: T0 + 10_000 }).reason, "cooldown");
  assert.equal(xp.grantMessageXp(g, U1, SETTINGS, { now: T0 + 61_000 }).granted, 5);
  assert.equal(xp.getStats(g, U1).xp, 10);
});

test("flushing twice never double counts", () => {
  xp.resetXpCache();
  const g = gid();
  xp.grantMessageXp(g, U1, SETTINGS, { now: T0 });
  xp.flushXp();
  xp.flushXp();
  xp.flushXp();
  assert.equal(xp.getStats(g, U1).xp, 5);
});

test("voice xp counts minutes, caps xp, and ignores nonsense", () => {
  xp.resetXpCache();
  const g = gid();
  const r = xp.grantVoiceXp(g, U1, 5, SETTINGS, { now: T0 });
  assert.equal(r.granted, 10);
  assert.equal(xp.getStats(g, U1).voiceMin, 5);
  const capped = xp.grantVoiceXp(g, U1, 600, SETTINGS, { now: T0 });
  assert.equal(capped.granted, 10);
  assert.equal(capped.reason, null);
  assert.equal(xp.grantVoiceXp(g, U1, 5, SETTINGS, { now: T0 }).reason, "cap");
  for (const bad of [0, -3, NaN, "x", null]) assert.equal(xp.grantVoiceXp(g, U1, bad, SETTINGS, { now: T0 }).granted, 0);
  assert.equal(xp.getStats(g, U1).voiceMin, 5 + 600 + 5);
});

test("rank and leaderboard", () => {
  xp.resetXpCache();
  const g = gid();
  const big = { ...SETTINGS, dailyCap: 5000, xpPerMessage: 50 };
  xp.grantMessageXp(g, U1, big, { now: T0 });
  xp.grantMessageXp(g, U2, big, { now: T0 });
  xp.grantMessageXp(g, U2, big, { now: T0 + 61_000 });
  assert.equal(xp.rankOf(g, U2), 1);
  assert.equal(xp.rankOf(g, U1), 2);
  assert.equal(xp.rankOf(g, U3), null);
  assert.deepEqual(xp.xpLeaderboard(g, 5).map((r) => r.userId), [U2, U1]);
});

// ---------- the message listener ----------

const fakeMessage = (guildId, over = {}) => ({
  content: "",
  author: { id: U1, bot: false, system: false },
  guild: { id: guildId, members: { me: null }, channels: { cache: new Map() } },
  member: null,
  webhookId: null,
  system: false,
  ...over,
});

test("xp works with empty content, so it needs no message content intent", async () => {
  xp.resetXpCache();
  const g = proGuild();
  const result = await handleMessageXp(fakeMessage(g), { now: T0 });
  assert.equal(result.granted, 5);
  // the text is never looked at: a hostile content value changes nothing
  const other = await handleMessageXp(fakeMessage(g, { author: { id: U2, bot: false }, content: "@everyone <script>" }), { now: T0 });
  assert.equal(other.granted, 5);
});

test("bots, webhooks, system messages and DMs earn nothing", async () => {
  xp.resetXpCache();
  const g = proGuild();
  assert.equal(await handleMessageXp(fakeMessage(g, { author: { id: U1, bot: true } }), { now: T0 }), null);
  assert.equal(await handleMessageXp(fakeMessage(g, { webhookId: "123" }), { now: T0 }), null);
  assert.equal(await handleMessageXp(fakeMessage(g, { system: true }), { now: T0 }), null);
  assert.equal(await handleMessageXp(fakeMessage(g, { author: { id: U1, system: true } }), { now: T0 }), null);
  assert.equal(await handleMessageXp(fakeMessage(g, { guild: null }), { now: T0 }), null);
  assert.equal(await handleMessageXp({}, { now: T0 }), null);
  assert.equal(await handleMessageXp(null, { now: T0 }), null);
  assert.equal(await handleMessageXp(fakeMessage(g, { author: null }), { now: T0 }), null);
  assert.equal(xp.getStats(g, U1).xp, 0);
});

test("a free server or a switched-off server earns no xp, and no database work happens", async () => {
  xp.resetXpCache();
  const free = gid();
  patchSection(free, "activity", { enabled: true });
  xp.clearActivityCache(free);
  assert.equal(await handleMessageXp(fakeMessage(free), { now: T0 }), null);

  const off = gid();
  grant(off, "pro", 30);
  assert.equal(await handleMessageXp(fakeMessage(off), { now: T0 }), null);
  xp.flushXp();
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM xp WHERE guild_id IN (?, ?)").get(free, off).n, 0);
});

test("the listener never touches the database while a cooldown blocks the message", async () => {
  xp.resetXpCache();
  const g = proGuild();
  await handleMessageXp(fakeMessage(g), { now: T0 });
  let reads = 0;
  const counting = { config: (...a) => (reads += 1, xp.activityConfig(...a)), grant: xp.grantMessageXp };
  for (let i = 1; i < 20; i += 1) await handleMessageXp(fakeMessage(g), { now: T0 + i * 1000, ...counting });
  assert.equal(reads, 19);
  xp.flushXp();
  assert.equal(xp.getStats(g, U1).msgs, 1);
});

test("a level-up calls the announcer once with the right levels", async () => {
  xp.resetXpCache();
  const g = proGuild({ xpPerMessage: 50, cooldownSec: 10, dailyCap: 5000 });
  const seen = [];
  const levelUp = async (info) => seen.push([info.levelBefore, info.levelAfter, info.userId]);
  await handleMessageXp(fakeMessage(g), { now: T0, levelUp }); // 50 xp -> level 0
  await handleMessageXp(fakeMessage(g), { now: T0 + 11_000, levelUp }); // 100 xp -> level 1
  await handleMessageXp(fakeMessage(g), { now: T0 + 22_000, levelUp }); // 150 xp -> still 1
  assert.deepEqual(seen, [[0, 1, U1]]);
});

test("a failing announcer does not break xp", async () => {
  xp.resetXpCache();
  const g = proGuild({ xpPerMessage: 50, cooldownSec: 10, dailyCap: 5000 });
  const levelUp = async () => {
    throw new Error("boom");
  };
  await handleMessageXp(fakeMessage(g), { now: T0, levelUp });
  const r = await handleMessageXp(fakeMessage(g), { now: T0 + 11_000, levelUp });
  assert.equal(r.granted, 50);
});

// ---------- voice ----------

function clock(start = T0) {
  const c = { t: start, now: () => c.t, minutes(n) { c.t += n * 60_000; } };
  return c;
}

test("two people talking each earn their minutes when they leave", () => {
  const c = clock();
  const v = createVoiceTracker({ now: c.now });
  v.seed("g", []);
  assert.deepEqual(v.update("g", "a", { channelId: "c1" }), []);
  c.minutes(2);
  assert.deepEqual(v.update("g", "b", { channelId: "c1" }), []);
  c.minutes(10);
  // a was alone for 2 minutes (not counted), then 10 minutes with b
  assert.deepEqual(v.update("g", "a", { channelId: null }), [{ guildId: "g", userId: "a", minutes: 10 }]);
  // b is alone from now on
  c.minutes(30);
  assert.deepEqual(v.update("g", "b", { channelId: null }), [{ guildId: "g", userId: "b", minutes: 10 }]);
});

test("sitting alone, deafened or in the AFK channel earns nothing", () => {
  const c = clock();
  const v = createVoiceTracker({ now: c.now });
  v.seed("g", []);
  v.update("g", "a", { channelId: "c1" });
  c.minutes(60);
  assert.deepEqual(v.update("g", "a", { channelId: null }), []);

  v.update("g", "a", { channelId: "c1" });
  v.update("g", "b", { channelId: "c1", deaf: true });
  c.minutes(30);
  // a has only a deafened listener with them, b is deafened itself
  assert.deepEqual(v.update("g", "b", { channelId: null }), []);
  assert.deepEqual(v.update("g", "a", { channelId: null }), []);

  v.update("g", "a", { channelId: "afk", afk: true });
  v.update("g", "b", { channelId: "afk", afk: true });
  c.minutes(30);
  assert.deepEqual(v.update("g", "a", { channelId: null }), []);
});

test("deafening in the middle pauses the clock", () => {
  const c = clock();
  const v = createVoiceTracker({ now: c.now });
  v.seed("g", []);
  v.update("g", "a", { channelId: "c1" });
  v.update("g", "b", { channelId: "c1" });
  c.minutes(5);
  v.update("g", "a", { channelId: "c1", deaf: true });
  c.minutes(20);
  v.update("g", "a", { channelId: "c1", deaf: false });
  c.minutes(3);
  assert.deepEqual(v.update("g", "a", { channelId: null }), [{ guildId: "g", userId: "a", minutes: 8 }]);
});

test("switching channels settles the first session and starts a new one", () => {
  const c = clock();
  const v = createVoiceTracker({ now: c.now });
  v.seed("g", []);
  v.update("g", "a", { channelId: "c1" });
  v.update("g", "b", { channelId: "c1" });
  v.update("g", "c", { channelId: "c2" });
  c.minutes(7);
  assert.deepEqual(v.update("g", "a", { channelId: "c2" }), [{ guildId: "g", userId: "a", minutes: 7 }]);
  c.minutes(4);
  assert.deepEqual(v.update("g", "a", { channelId: null }), [{ guildId: "g", userId: "a", minutes: 4 }]);
});

test("under a minute earns nothing, and leaving twice is harmless", () => {
  const c = clock();
  const v = createVoiceTracker({ now: c.now });
  v.seed("g", []);
  v.update("g", "a", { channelId: "c1" });
  v.update("g", "b", { channelId: "c1" });
  c.t += 59_000;
  assert.deepEqual(v.update("g", "a", { channelId: null }), []);
  assert.deepEqual(v.update("g", "a", { channelId: null }), []);
});

test("seeding starts the clock for people already in voice, and bots are skipped", () => {
  const c = clock();
  const v = createVoiceTracker({ now: c.now });
  v.seed("g", [{ userId: "a", channelId: "c1" }, { userId: "b", channelId: "c1" }, { userId: "bot", channelId: "c1", bot: true }]);
  c.minutes(6);
  assert.deepEqual(v.update("g", "a", { channelId: null }), [{ guildId: "g", userId: "a", minutes: 6 }]);
  assert.equal(v.size(), 1);
  v.forgetGuild("g");
  assert.equal(v.size(), 0);
  assert.equal(v.isSeeded("g"), false);
});

function voiceState(guild, id, channelId, extra = {}) {
  return { id, guild, channelId, selfDeaf: false, serverDeaf: false, member: { user: { bot: false } }, ...extra };
}

test("the voice listener credits xp on leave, seeds first, and skips bots and unlicensed servers", async () => {
  xp.resetXpCache();
  const g = proGuild({ voiceXpPerMin: 2, dailyCap: 5000 });
  const guild = { id: g, afkChannelId: "afk1", voiceStates: { cache: new Map() } };
  const c = clock();
  const tracker = createVoiceTracker({ now: c.now });
  const run = (o, n) => handleVoiceUpdate(o, n, { tracker, now: c.now });

  // the first event only seeds
  assert.deepEqual(await run(voiceState(guild, U1, null), voiceState(guild, U1, "c1")), []);
  await run(voiceState(guild, U1, null), voiceState(guild, U1, "c1"));
  await run(voiceState(guild, U2, null), voiceState(guild, U2, "c1"));
  c.minutes(10);
  const credits = await run(voiceState(guild, U1, "c1"), voiceState(guild, U1, null));
  assert.deepEqual(credits, [{ guildId: g, userId: U1, minutes: 10 }]);
  assert.equal(xp.getStats(g, U1).xp, 20);
  assert.equal(xp.getStats(g, U1).voiceMin, 10);

  // bots are ignored entirely
  const bot = voiceState(guild, "910000000000000009", "c1", { member: { user: { bot: true } } });
  assert.deepEqual(await run(bot, bot), []);

  // a free server tracks nothing
  const free = gid();
  const freeGuild = { id: free, voiceStates: { cache: new Map() } };
  const t2 = createVoiceTracker({ now: c.now });
  await handleVoiceUpdate(voiceState(freeGuild, U1, null), voiceState(freeGuild, U1, "c1"), { tracker: t2, now: c.now });
  assert.equal(t2.isSeeded(free), false);
  assert.equal(t2.size(), 0);
});

test("voice xp can be switched off on its own", async () => {
  xp.resetXpCache();
  const g = proGuild({ voiceEnabled: false });
  const guild = { id: g, voiceStates: { cache: new Map() } };
  const tracker = createVoiceTracker({ now: () => T0 });
  await handleVoiceUpdate(voiceState(guild, U1, null), voiceState(guild, U1, "c1"), { tracker, now: () => T0 });
  assert.equal(tracker.size(), 0);
});

// ---------- /hang ----------

function interactionFor(guildId, { sub, options = {}, admin = false, userId = U1, target = null } = {}) {
  const replies = [];
  const opt = (name) => (name in options ? options[name] : null);
  return {
    replies,
    guildId,
    guild: { id: guildId, members: { me: { permissions: { has: () => false } } }, channels: { cache: new Map() } },
    user: { id: userId, username: "u", bot: false },
    member: { permissions: { has: (flag) => admin && flag === PermissionFlagsBits.Administrator } },
    options: {
      getSubcommand: () => sub,
      getUser: (n) => (n === "nguoi" ? target : null),
      getBoolean: opt,
      getInteger: opt,
      getChannel: opt,
      getString: opt,
    },
    reply: async (p) => replies.push(p),
  };
}

test("/hang is open to everyone but its settings are not", async () => {
  assert.equal(hang.data.toJSON().default_member_permissions ?? null, null);
  const g = proGuild();
  const i = interactionFor(g, { sub: "caidat", options: { bat: false }, admin: false });
  await hang.execute(i);
  assert.match(i.replies[0].content, /admin/i);
  assert.equal(getSection(g, "activity").enabled, true);
});

test("/hang caidat saves clamped numbers, reports missing permissions and refreshes the cache", async () => {
  xp.resetXpCache();
  const g = proGuild();
  const i = interactionFor(g, { sub: "caidat", options: { xptin: 12, cho: 30, toida: 800, giong: false, xpgiong: 3 }, admin: true });
  await hang.execute(i);
  const s = getSection(g, "activity");
  assert.equal(s.xpPerMessage, 12);
  assert.equal(s.cooldownSec, 30);
  assert.equal(s.dailyCap, 800);
  assert.equal(s.voiceEnabled, false);
  assert.match(i.replies[0].content, /Quản lý role/);
  // the listener sees the new numbers at once
  assert.equal(xp.activityConfig(g).settings.xpPerMessage, 12);
  assert.ok(i.replies[0].flags & MessageFlags.Ephemeral);
});

test("/hang caidat out-of-range values from a forged payload are clamped by the settings", async () => {
  const g = proGuild();
  const i = interactionFor(g, { sub: "caidat", options: { xptin: 9999, cho: -4, toida: 1 }, admin: true });
  await hang.execute(i);
  const s = getSection(g, "activity");
  assert.equal(s.xpPerMessage, 50);
  assert.equal(s.cooldownSec, 10);
  assert.equal(s.dailyCap, 50);
});

test("a free server cannot turn xp on but can still turn it off", async () => {
  const free = gid();
  const on = interactionFor(free, { sub: "caidat", options: { bat: true }, admin: true });
  await hang.execute(on);
  assert.match(on.replies[0].content, /Pro/);
  assert.equal(getSection(free, "activity").enabled, false);

  patchSection(free, "activity", { enabled: true });
  const off = interactionFor(free, { sub: "caidat", options: { bat: false }, admin: true });
  await hang.execute(off);
  assert.equal(getSection(free, "activity").enabled, false);
});

test("/hang xem shows a rank embed, refuses bots and free servers", async () => {
  xp.resetXpCache();
  const g = proGuild({ cooldownSec: 10, dailyCap: 5000 });
  for (let n = 0; n < 5; n += 1) xp.grantMessageXp(g, U1, getSection(g, "activity"), { now: T0 + n * 11_000 });
  const i = interactionFor(g, { sub: "xem" });
  await hang.execute(i);
  const embed = i.replies[0].embeds[0].data;
  assert.match(embed.description, /▰|▱/);
  const names = embed.fields.map((f) => f.name);
  assert.ok(names.includes("Hạng trong server") && names.includes("Phút trong voice"));
  assert.equal(embed.fields.find((f) => f.name === "Hạng trong server").value, "#1");
  assert.deepEqual(i.replies[0].allowedMentions, { parse: [] });

  const bot = interactionFor(g, { sub: "xem", target: { id: U2, bot: true } });
  await hang.execute(bot);
  assert.equal(bot.replies[0].embeds, undefined);

  const free = interactionFor(gid(), { sub: "xem" });
  await hang.execute(free);
  assert.match(free.replies[0].content, /Pro/);

  const nobody = interactionFor(g, { sub: "xem", userId: U3 });
  await hang.execute(nobody);
  assert.equal(nobody.replies[0].embeds, undefined);
});

test("/bangxephang can show the activity board and keeps the default board", async () => {
  xp.resetXpCache();
  const g = proGuild({ cooldownSec: 10 });
  xp.grantMessageXp(g, U1, getSection(g, "activity"), { now: T0 });
  const replies = [];
  const act = { guildId: g, options: { getString: () => "hoatdong" }, reply: async (p) => replies.push(p) };
  await board.execute(act);
  assert.match(replies[0].embeds[0].data.description, new RegExp(U1));
  assert.deepEqual(replies[0].allowedMentions, { parse: [] });

  const empty = [];
  await board.execute({ guildId: proGuild(), options: { getString: () => "hoatdong" }, reply: async (p) => empty.push(p) });
  assert.equal(empty[0].embeds, undefined);

  const free = [];
  await board.execute({ guildId: gid(), options: { getString: () => "hoatdong" }, reply: async (p) => free.push(p) });
  assert.match(free[0].content, /Pro/);

  const plain = [];
  await board.execute({ guildId: g, options: { getString: () => null }, reply: async (p) => plain.push(p) });
  assert.ok(plain[0].content || plain[0].embeds);
});
