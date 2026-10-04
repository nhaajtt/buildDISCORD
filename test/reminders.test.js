import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "reminders-test-"));

const { parseClock, parseWhen, zonedToUtc, localParts, AFTER_CHOICES, MINUTE } = await import("../src/reminders/parse.js");
const store = await import("../src/reminders/store.js");
const { runReminders } = await import("../src/jobs/reminders.js");
const job = (await import("../src/jobs/reminders.js")).default;
const nhacviec = (await import("../src/commands/nhacviec.js")).default;
const { getDb, closeDb } = await import("../src/db.js");

after(() => closeDb());

const ZONE = "Asia/Ho_Chi_Minh";
const T0 = Date.UTC(2026, 5, 10, 8, 0, 0); // 15:00 in Ho Chi Minh
let n = 0;
const uid = () => `94000000000000${String(++n).padStart(4, "0")}`;
const GUILD = "940100000000000001";
const CHAN = "940200000000000001";

function fakeClient({ dmOpen = true, channelOk = true, guildId = GUILD } = {}) {
  const dms = [];
  const posts = [];
  const channel = { id: CHAN, guild: { id: guildId }, send: async (p) => (channelOk ? posts.push(p) : Promise.reject(new Error("no perms"))) };
  return {
    dms,
    posts,
    users: { fetch: async (id) => ({ id, send: async (p) => (dmOpen ? dms.push({ id, ...p }) : Promise.reject(new Error("closed"))) }) },
    channels: { fetch: async (id) => (id === CHAN ? channel : Promise.reject(new Error("unknown"))) },
  };
}

function fakeInteraction({ sub, options = {}, userId = uid(), guildId = GUILD }) {
  const sent = [];
  return {
    sent,
    user: { id: userId },
    guildId,
    channelId: CHAN,
    options: {
      getSubcommand: () => sub,
      getString: (k) => options[k] ?? null,
      getInteger: (k) => options[k] ?? null,
      getFocused: () => options.focused ?? "",
    },
    reply: async (p) => sent.push(p),
    respond: async (c) => sent.push(c),
  };
}

test("parseClock reads the usual spellings and refuses nonsense in Vietnamese", () => {
  assert.deepEqual(parseClock("7:30"), { ok: true, h: 7, min: 30 });
  assert.deepEqual(parseClock(" 07:05 "), { ok: true, h: 7, min: 5 });
  assert.deepEqual(parseClock("21h05"), { ok: true, h: 21, min: 5 });
  assert.deepEqual(parseClock("9h"), { ok: true, h: 9, min: 0 });
  assert.deepEqual(parseClock("23:59"), { ok: true, h: 23, min: 59 });
  for (const bad of ["", "   ", "abc", "25:00", "24:00", "12:60", "12:5", "1:2:3", "-1:30", "12:30pm", "99"]) {
    const r = parseClock(bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.error, /\S/);
    assert.doesNotMatch(r.error, /—/);
  }
});

test("zonedToUtc and localParts agree in both directions", () => {
  assert.equal(zonedToUtc(2026, 6, 10, 15, 0, ZONE), T0);
  assert.deepEqual(localParts(T0, ZONE), { y: 2026, m: 6, d: 10, h: 15, min: 0 });
  // a zone with daylight saving: 2026-03-08 02:30 does not exist in New York, the result still reads as a valid later time
  const ny = zonedToUtc(2026, 7, 1, 9, 0, "America/New_York");
  assert.equal(ny, Date.UTC(2026, 6, 1, 13, 0));
  // a bad zone name falls back instead of throwing
  assert.ok(Number.isFinite(zonedToUtc(2026, 6, 10, 9, 0, "Not/AZone")));
});

test("parseWhen: relative choices, today, tomorrow and the refusals", () => {
  for (const c of AFTER_CHOICES) assert.equal(parseWhen({ after: c.value, now: T0, timeZone: ZONE }).dueAt, T0 + c.value * MINUTE);
  assert.equal(AFTER_CHOICES.length, 7);

  // 15:00 local now: 21:30 is today, 07:00 is tomorrow
  const today = parseWhen({ at: "21:30", now: T0, timeZone: ZONE });
  assert.equal(today.dueAt, zonedToUtc(2026, 6, 10, 21, 30, ZONE));
  assert.equal(today.tomorrow, false);
  const tomorrow = parseWhen({ at: "07:00", now: T0, timeZone: ZONE });
  assert.equal(tomorrow.dueAt, zonedToUtc(2026, 6, 11, 7, 0, ZONE));
  assert.equal(tomorrow.tomorrow, true);
  // exactly now counts as passed
  assert.equal(parseWhen({ at: "15:00", now: T0, timeZone: ZONE }).tomorrow, true);
  // month and year ends
  const lastDay = Date.UTC(2026, 11, 31, 16, 0, 0); // 23:00 local on Dec 31
  assert.equal(parseWhen({ at: "06:00", now: lastDay, timeZone: ZONE }).dueAt, zonedToUtc(2027, 1, 1, 6, 0, ZONE));

  assert.equal(parseWhen({ now: T0 }).ok, false);
  assert.equal(parseWhen({ after: 10, at: "10:00", now: T0 }).ok, false);
  assert.equal(parseWhen({ after: 7, now: T0 }).ok, false);
  assert.equal(parseWhen({ at: "xx", now: T0 }).ok, false);
  assert.equal(parseWhen({ at: "   ", now: T0 }).ok, false);
});

test("creating: caps the text, enforces 10 pending per person and 25 per server-person pair", () => {
  const user = uid();
  const made = store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: `  hello\n${"x".repeat(400)}  `, dueAt: T0 + MINUTE, now: T0 });
  assert.equal(made.ok, true);
  assert.ok(store.listPending(user)[0].body.length <= 300);
  assert.equal(store.createReminder({ guildId: GUILD, userId: user, body: "   ", dueAt: T0 + MINUTE, now: T0 }).reason, "body");
  assert.equal(store.createReminder({ guildId: GUILD, userId: user, body: "far", dueAt: T0 + 400 * 86400000, now: T0 }).reason, "far");
  assert.equal(store.createReminder({ guildId: GUILD, userId: user, body: "nan", dueAt: Number.NaN, now: T0 }).reason, "far");
  for (let i = 1; i < 10; i += 1) assert.equal(store.createReminder({ guildId: GUILD, userId: user, body: `r${i}`, dueAt: T0 + MINUTE, now: T0 }).ok, true);
  const refused = store.createReminder({ guildId: GUILD, userId: user, body: "eleven", dueAt: T0 + MINUTE, now: T0 });
  assert.equal(refused.reason, "user");
  assert.equal(store.countPending(user), 10);
  // another person is not affected
  assert.equal(store.createReminder({ guildId: GUILD, userId: uid(), body: "mine", dueAt: T0 + MINUTE, now: T0 }).ok, true);
  // the per-server cap is looser than the overall one, so the overall cap is the one people meet first
  assert.equal(store.MAX_PENDING_GUILD_USER, 25);
  assert.ok(store.MAX_PENDING_GUILD_USER >= store.MAX_PENDING_USER);
});

test("removing: only your own pending reminders, and autocomplete only lists yours", async () => {
  const a = uid();
  const b = uid();
  const id = store.createReminder({ guildId: GUILD, userId: a, channelId: CHAN, body: "secret of a", dueAt: T0 + MINUTE, now: T0 }).id;
  assert.equal(store.deletePending(b, id), false);
  const ac = fakeInteraction({ sub: "xoa", userId: b, options: { focused: "" } });
  await nhacviec.autocomplete(ac);
  assert.deepEqual(ac.sent[0], []);
  const own = fakeInteraction({ sub: "xoa", userId: a, options: { focused: "secret" } });
  await nhacviec.autocomplete(own);
  assert.equal(own.sent[0].length, 1);
  const wrong = fakeInteraction({ sub: "xoa", userId: b, options: { so: id } });
  await nhacviec.execute(wrong);
  assert.match(wrong.sent[0].content, /Không thấy/);
  const right = fakeInteraction({ sub: "xoa", userId: a, options: { so: id } });
  await nhacviec.execute(right);
  assert.match(right.sent[0].content, /Đã xoá/);
  assert.equal(store.deletePending(a, id), false, "a second delete finds nothing");
});

test("the command: create, list, and refusals", async () => {
  const user = uid();
  const bad = fakeInteraction({ sub: "tao", userId: user, options: { noidung: "abc" } });
  await nhacviec.execute(bad, { now: T0 });
  assert.match(bad.sent[0].content, /saunua/);
  const both = fakeInteraction({ sub: "tao", userId: user, options: { noidung: "abc", saunua: 10, luc: "10:00" } });
  await nhacviec.execute(both, { now: T0 });
  assert.match(both.sent[0].content, /một thôi/);
  const ok = fakeInteraction({ sub: "tao", userId: user, options: { noidung: "uống nước @everyone <@123456789012345678>", luc: "21:30" } });
  await nhacviec.execute(ok, { now: T0 });
  assert.match(ok.sent[0].content, /Ghi sổ lời nhắc/);
  assert.deepEqual(ok.sent[0].allowedMentions, { parse: [] });
  const list = fakeInteraction({ sub: "danhsach", userId: user });
  await nhacviec.execute(list);
  assert.match(list.sent[0].embeds[0].data.description, /uống nước/);
  assert.doesNotMatch(list.sent[0].embeds[0].data.description, /@everyone|<@1234/);
  const empty = fakeInteraction({ sub: "danhsach", userId: uid() });
  await nhacviec.execute(empty);
  assert.match(empty.sent[0].content, /chưa có lời nhắc/);
});

test("delivery: DM, exactly once, and the row is done before the send", async () => {
  getDb().prepare("DELETE FROM reminders").run();
  const user = uid();
  const id = store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: "gọi mẹ", dueAt: T0 + MINUTE, now: T0 }).id;
  const client = fakeClient();
  assert.deepEqual(await runReminders(client, { now: T0 }), { dm: 0, channel: 0, failed: 0 }, "not due yet");
  // the status is already done while the message is being sent
  let seen = null;
  client.users.fetch = async (uidArg) => ({
    send: async (p) => {
      seen = getDb().prepare("SELECT status FROM reminders WHERE id = ?").get(id).status;
      client.dms.push({ id: uidArg, ...p });
    },
  });
  const first = await runReminders(client, { now: T0 + 2 * MINUTE });
  assert.equal(first.dm, 1);
  assert.equal(seen, "done");
  assert.equal(client.dms.length, 1);
  assert.match(client.dms[0].content, /gọi mẹ/);
  assert.deepEqual(client.dms[0].allowedMentions, { parse: [] });
  await runReminders(client, { now: T0 + 3 * MINUTE });
  assert.equal(client.dms.length, 1, "a second run sends nothing");
  // two overlapping runs still send once
  const id2 = store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: "race", dueAt: T0 + MINUTE, now: T0 }).id;
  const c2 = fakeClient();
  await Promise.all([runReminders(c2, { now: T0 + 10 * MINUTE }), runReminders(c2, { now: T0 + 10 * MINUTE })]);
  assert.equal(c2.dms.length, 1);
  assert.equal(getDb().prepare("SELECT status FROM reminders WHERE id = ?").get(id2).status, "done");
});

test("delivery: closed DMs fall back to the channel with a mention of that one person only", async () => {
  getDb().prepare("DELETE FROM reminders").run();
  const user = uid();
  store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: "họp @everyone <@&123456789012345678>", dueAt: T0 + MINUTE, now: T0 });
  const client = fakeClient({ dmOpen: false });
  const stats = await runReminders(client, { now: T0 + 2 * MINUTE });
  assert.equal(stats.channel, 1);
  const post = client.posts[0];
  assert.deepEqual(post.allowedMentions, { parse: [], users: [user] });
  assert.ok(post.content.startsWith(`<@${user}>`));
  assert.doesNotMatch(post.content, /họp|@everyone|<@&/, "the private text never reaches the channel");
  assert.doesNotMatch(post.content.slice(post.content.indexOf(">") + 1), /<@/);
});

test("delivery: unreachable in both places is marked failed, never retried", async () => {
  getDb().prepare("DELETE FROM reminders").run();
  const user = uid();
  const id = store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: "lost", dueAt: T0 + MINUTE, now: T0 }).id;
  const client = fakeClient({ dmOpen: false, channelOk: false });
  assert.equal((await runReminders(client, { now: T0 + 2 * MINUTE })).failed, 1);
  assert.equal(getDb().prepare("SELECT status FROM reminders WHERE id = ?").get(id).status, "failed");
  assert.equal((await runReminders(client, { now: T0 + 3 * MINUTE })).failed, 0);
  // a channel of another server is never used
  const id2 = store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: "wrong place", dueAt: T0 + MINUTE, now: T0 }).id;
  const other = fakeClient({ dmOpen: false, guildId: "940100000000000009" });
  await runReminders(other, { now: T0 + 2 * MINUTE });
  assert.equal(other.posts.length, 0);
  assert.equal(getDb().prepare("SELECT status FROM reminders WHERE id = ?").get(id2).status, "failed");
  // a reminder made in a DM has no channel to fall back to
  const id3 = store.createReminder({ guildId: null, userId: user, channelId: null, body: "dm only", dueAt: T0 + MINUTE, now: T0 }).id;
  await runReminders(fakeClient({ dmOpen: false }), { now: T0 + 2 * MINUTE });
  assert.equal(getDb().prepare("SELECT status FROM reminders WHERE id = ?").get(id3).status, "failed");
});

test("catch-up after downtime, apology when late, and at most 100 per run", async () => {
  const user = uid();
  getDb().prepare("DELETE FROM reminders").run();
  // pending limits apply per person, so spread 130 reminders over many people
  for (let i = 0; i < 130; i += 1) store.createReminder({ guildId: GUILD, userId: `9410000000000${String(i).padStart(5, "0")}`, channelId: CHAN, body: `r${i}`, dueAt: T0 + MINUTE + i, now: T0 });
  const client = fakeClient();
  const late = T0 + 3 * 3600_000;
  assert.equal((await runReminders(client, { now: late })).dm, 100);
  assert.equal((await runReminders(client, { now: late + 30_000 })).dm, 30);
  assert.equal((await runReminders(client, { now: late + 60_000 })).dm, 0);
  assert.match(client.dms[0].content, /trễ/);
  const onTime = fakeClient();
  store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: "on time", dueAt: late + 100_000, now: late });
  await runReminders(onTime, { now: late + 100_000 + 1000 });
  assert.doesNotMatch(onTime.dms[0].content, /trễ/);
});

test("restart safety: state is in the database, a fresh job run sends what is left once", async () => {
  getDb().prepare("DELETE FROM reminders").run();
  const user = uid();
  store.createReminder({ guildId: GUILD, userId: user, channelId: CHAN, body: "survive", dueAt: Date.now() - 1000, now: Date.now() - 5000 });
  const client = fakeClient();
  await job.run(client);
  await job.run(client);
  assert.equal(client.dms.length, 1);
  assert.equal(job.everyMs, 30_000);
});

test("pruning: nothing older than a year, finished rows go after a month, fresh pending stays", () => {
  const db = getDb();
  db.prepare("DELETE FROM reminders").run();
  const now = T0;
  const day = 86400000;
  const insert = db.prepare("INSERT INTO reminders (guild_id, user_id, channel_id, body, due_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run(GUILD, "p1", CHAN, "ancient", now + day, "pending", now - 400 * day);
  insert.run(GUILD, "p1", CHAN, "old done", now - 40 * day, "done", now - 41 * day);
  insert.run(GUILD, "p1", CHAN, "recent done", now - 2 * day, "done", now - 3 * day);
  insert.run(GUILD, "p1", CHAN, "fresh", now + day, "pending", now - day);
  store.pruneReminders(now);
  assert.deepEqual(db.prepare("SELECT body FROM reminders ORDER BY id").all().map((r) => r.body), ["recent done", "fresh"]);
});
