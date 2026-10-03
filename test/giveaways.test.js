import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "giveaways-test-"));

const gw = await import("../src/activity/giveaways.js");
const polls = await import("../src/activity/polls.js");
const quatang = (await import("../src/commands/quatang.js")).default;
const binhchon = (await import("../src/commands/binhchon.js")).default;
const job = (await import("../src/jobs/giveaways.js")).default;
const { runGiveaways, runPolls } = await import("../src/jobs/giveaways.js");
const { grant } = await import("../src/license.js");
const { getDb, closeDb } = await import("../src/db.js");

const { drawWinners, createGiveaway, getGiveaway, closeGiveaway, toggleEntry, countEntries, rerollGiveaway } = gw;

let counter = 0;
const gid = () => `9300000000000${String(++counter).padStart(4, "0")}`;
let nextId = 930100000000000000n;
const newId = () => String(nextId++);
const HOST = "930000000000000001";
const BOT = "930000000000000099";
const users = (n) => Array.from({ length: n }, (_, i) => `93020000000000${String(i + 1).padStart(4, "0")}`);
const T0 = Date.UTC(2026, 5, 10, 8, 0, 0);
const SOON = { now: T0 + 1000 };

function fakeGuild({ perms = true } = {}) {
  const id = gid();
  const messages = new Map();
  const channel = {
    id: newId(),
    type: 0,
    sent: [],
    messages: { fetch: async (messageId) => messages.get(messageId) ?? Promise.reject(new Error("unknown message")) },
    permissionsFor: () => ({ has: (f) => perms || f === "ViewChannel" }),
    send: async (payload) => {
      const message = { id: newId(), author: { id: BOT }, payload, edits: [], edit: async (p) => message.edits.push(p) };
      messages.set(message.id, message);
      channel.sent.push(message);
      return message;
    },
  };
  const guild = { id, available: true, channels: { cache: new Map([[channel.id, channel]]), fetch: async (c) => (c === channel.id ? channel : null) }, members: { me: { id: BOT } }, channel };
  return guild;
}

const proGuild = (opts) => {
  const guild = fakeGuild(opts);
  grant(guild.id, "pro", 30);
  return guild;
};

const clientFor = (...guilds) => ({ guilds: { cache: new Map(guilds.map((g) => [g.id, g])) } });

function slash(guild, { sub, options = {}, manage = true, userId = HOST } = {}) {
  const replies = [];
  return {
    replies,
    guildId: guild.id,
    guild,
    channel: guild.channel,
    client: { user: { id: BOT } },
    user: { id: userId },
    member: { permissions: { has: (f) => manage && (f === P.ManageGuild || f === P.ManageMessages) } },
    options: { getSubcommand: () => sub, getInteger: (n) => options[n] ?? null, getString: (n) => options[n] ?? null, getRole: (n) => options[n] ?? null },
    reply: async (p) => replies.push(p),
  };
}

function click(guild, { userId, bot = false, roles = [], manage = false } = {}) {
  const replies = [];
  const updates = [];
  return {
    replies,
    updates,
    guildId: guild.id,
    guild,
    user: { id: userId, bot },
    member: { roles: { cache: new Map(roles.map((r) => [r, true])) }, permissions: { has: (f) => manage && f === P.ManageMessages } },
    reply: async (p) => replies.push(p),
    update: async (p) => updates.push(p),
  };
}

// ---------- the draw ----------

test("drawWinners picks different people, honours the count and the injected rng", () => {
  const ids = users(10);
  const picked = drawWinners(ids, 3, () => 0);
  assert.deepEqual(picked, ids.slice(0, 3));
  assert.equal(new Set(drawWinners(ids, 10, Math.random)).size, 10);
  assert.equal(drawWinners(ids, 50, Math.random).length, 10);
  assert.deepEqual(drawWinners(ids, 0), []);
  assert.deepEqual(drawWinners([], 3), []);
  assert.deepEqual(drawWinners(ids, -2), []);
  assert.equal(drawWinners(["a", "a", "a"], 3).length, 1);
  // a misbehaving rng cannot push the draw out of range
  for (const odd of [() => 1, () => 5, () => -1, () => NaN]) {
    const result = drawWinners(ids, 4, odd);
    assert.equal(new Set(result).size, 4);
    assert.ok(result.every((id) => ids.includes(id)));
  }
  // the input is not changed
  assert.deepEqual(ids, users(10));
});

test("the draw is fair over many runs", () => {
  const ids = users(4);
  const wins = Object.fromEntries(ids.map((id) => [id, 0]));
  let seed = 12345;
  const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let n = 0; n < 4000; n += 1) wins[drawWinners(ids, 1, rng)[0]] += 1;
  for (const id of ids) assert.ok(wins[id] > 800 && wins[id] < 1200, `${id} won ${wins[id]}`);
});

// ---------- /quatang ----------

test("the command needs Manage Server and is gated by plan", async () => {
  assert.equal(quatang.data.toJSON().default_member_permissions, String(P.ManageGuild));
  const guild = proGuild();
  const denied = slash(guild, { sub: "tao", manage: false, options: { giai: "x", thoigian: 60 } });
  await quatang.execute(denied, { now: T0 });
  assert.equal(guild.channel.sent.length, 0);

  const free = fakeGuild();
  const blocked = slash(free, { sub: "tao", options: { giai: "x", thoigian: 60 } });
  await quatang.execute(blocked, { now: T0 });
  assert.match(blocked.replies[0].content, /Pro/);
  assert.equal(free.channel.sent.length, 0);
  const reroll = slash(free, { sub: "chonlai", options: { so: 1 } });
  await quatang.execute(reroll, { now: T0 });
  assert.match(reroll.replies[0].content, /Pro/);
});

test("tao posts a message with a join button and stores the giveaway", async () => {
  const guild = proGuild();
  const i = slash(guild, { sub: "tao", options: { giai: "  Nitro\n @everyone  ", thoigian: 60, soluong: 2 } });
  await quatang.execute(i, { now: T0 });
  const g = getGiveaway(1);
  assert.equal(g.prize, "Nitro @everyone");
  assert.equal(g.winners, 2);
  assert.equal(g.ends_at, T0 + 3_600_000);
  assert.equal(g.status, "active");
  assert.equal(g.message_id, guild.channel.sent[0].id);
  const payload = guild.channel.sent[0].payload;
  assert.equal(payload.components[0].components[0].data.custom_id, `quatang:join:${g.id}`);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.match(i.replies[0].content, /#1/);
});

test("tao refuses bad durations, empty prizes, too many at once, and missing channel permissions", async () => {
  const guild = proGuild();
  for (const bad of [0, 7, 99999, -1]) {
    const i = slash(guild, { sub: "tao", options: { giai: "x", thoigian: bad } });
    await quatang.execute(i, { now: T0 });
    assert.match(i.replies[0].content, /Thời gian/);
  }
  for (const prize of ["", "   ", "‮​"]) {
    const i = slash(guild, { sub: "tao", options: { giai: prize, thoigian: 60 } });
    await quatang.execute(i, { now: T0 });
    assert.match(i.replies[0].content, /Phần thưởng/);
  }
  assert.equal(guild.channel.sent.length, 0);

  const quiet = proGuild({ perms: false });
  const noPerm = slash(quiet, { sub: "tao", options: { giai: "x", thoigian: 60 } });
  await quatang.execute(noPerm, { now: T0 });
  assert.match(noPerm.replies[0].content, /Gửi tin nhắn/);
  assert.equal(quiet.channel.sent.length, 0);

  const busy = proGuild();
  for (let n = 0; n < 10; n += 1) await quatang.execute(slash(busy, { sub: "tao", options: { giai: `G${n}`, thoigian: 60 } }), { now: T0 });
  const over = slash(busy, { sub: "tao", options: { giai: "one more", thoigian: 60 } });
  await quatang.execute(over, { now: T0 });
  assert.match(over.replies[0].content, /10 giveaway/);
  assert.equal(busy.channel.sent.length, 10);
});

test("a failed post leaves no ghost giveaway behind", async () => {
  const guild = proGuild();
  guild.channel.send = async () => {
    throw new Error("Missing Permissions");
  };
  const i = slash(guild, { sub: "tao", options: { giai: "x", thoigian: 60 } });
  await quatang.execute(i, { now: T0 });
  assert.match(i.replies[0].content, /không cho thầu đăng/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM giveaways WHERE guild_id = ?").get(guild.id).n, 0);
});

// ---------- entries ----------

async function newGiveaway(guild, { roleId = null, winners = 1, duration = 60 } = {}) {
  const i = slash(guild, { sub: "tao", options: { giai: "Prize", thoigian: duration, soluong: winners, yeucau: roleId ? { id: roleId } : null } });
  await quatang.execute(i, { now: T0 });
  return Number(i.replies[0].content.match(/#(\d+)/)[1]);
}

test("pressing joins, pressing again leaves, one entry per person", async () => {
  const guild = proGuild();
  const id = await newGiveaway(guild);
  const a = click(guild, { userId: users(1)[0] });
  await quatang.handleComponent(a, ["join", String(id)], SOON);
  assert.match(a.replies[0].content, /Đã ghi tên/);
  assert.equal(countEntries(id), 1);
  const b = click(guild, { userId: users(2)[1] });
  await quatang.handleComponent(b, ["join", String(id)], SOON);
  assert.equal(countEntries(id), 2);
  const again = click(guild, { userId: users(1)[0] });
  await quatang.handleComponent(again, ["join", String(id)], SOON);
  assert.match(again.replies[0].content, /Đã rút/);
  assert.equal(countEntries(id), 1);
  // the database itself refuses duplicates
  assert.equal(getDb().prepare("INSERT OR IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)").run(id, users(2)[1]).changes, 0);
});

test("bots, other servers, ended giveaways and junk ids cannot join", async () => {
  const guild = proGuild();
  const id = await newGiveaway(guild);
  const bot = click(guild, { userId: users(1)[0], bot: true });
  await quatang.handleComponent(bot, ["join", String(id)], SOON);
  assert.match(bot.replies[0].content, /Bot/);

  const other = proGuild();
  const stranger = click(other, { userId: users(1)[0] });
  await quatang.handleComponent(stranger, ["join", String(id)], SOON);
  assert.match(stranger.replies[0].content, /không còn/);

  for (const junk of ["abc", "-4", "0", "99999", "1.5", ""]) {
    const j = click(guild, { userId: users(1)[0] });
    await quatang.handleComponent(j, ["join", junk], SOON);
    assert.match(j.replies[0].content, /không còn/);
  }
  const late = click(guild, { userId: users(1)[0] });
  await gw.handleGiveawayPress(late, ["join", String(id)], { now: T0 + 3_600_001 });
  assert.match(late.replies[0].content, /kết thúc/);
  assert.equal(countEntries(id), 0);
  const noop = click(guild, { userId: users(1)[0] });
  assert.equal(await quatang.handleComponent(noop, ["leave", String(id)]), undefined);
  assert.equal(noop.replies.length, 0);
});

test("the required role is checked when the button is pressed", async () => {
  const guild = proGuild();
  const roleId = newId();
  const id = await newGiveaway(guild, { roleId });
  assert.equal(getGiveaway(id).roleId, roleId);
  const without = click(guild, { userId: users(1)[0] });
  await quatang.handleComponent(without, ["join", String(id)], SOON);
  assert.match(without.replies[0].content, new RegExp(roleId));
  assert.equal(countEntries(id), 0);
  const withRole = click(guild, { userId: users(2)[1], roles: [roleId] });
  await quatang.handleComponent(withRole, ["join", String(id)], SOON);
  assert.equal(countEntries(id), 1);
  // the @everyone role means no requirement
  const open = proGuild();
  const openId = await newGiveaway(open, { roleId: open.id });
  assert.equal(getGiveaway(openId).roleId, null);
});

// ---------- closing ----------

test("closing is exactly once, draws without replacement and records the winners", () => {
  const guild = proGuild();
  const id = createGiveaway({ guildId: guild.id, channelId: guild.channel.id, hostId: HOST, prize: "P", winners: 3, endsAt: T0, now: T0 - 1000 });
  for (const u of users(5)) toggleEntry(id, u);
  const first = closeGiveaway(id, { rng: () => 0 });
  assert.equal(first.closed, true);
  assert.equal(first.winners.length, 3);
  assert.equal(new Set(first.winners).size, 3);
  const second = closeGiveaway(id, { rng: () => 0.5 });
  assert.deepEqual(second, { closed: false });
  const g = getGiveaway(id);
  assert.equal(g.status, "ended");
  assert.deepEqual(g.winnerIds, first.winners);
});

test("fewer entrants than prizes, and no entrants at all", () => {
  const guild = proGuild();
  const few = createGiveaway({ guildId: guild.id, channelId: "1", hostId: HOST, prize: "P", winners: 5, endsAt: T0 });
  toggleEntry(few, users(1)[0]);
  assert.deepEqual(closeGiveaway(few).winners, [users(1)[0]]);
  const none = createGiveaway({ guildId: guild.id, channelId: "1", hostId: HOST, prize: "P", winners: 2, endsAt: T0 });
  assert.deepEqual(closeGiveaway(none), { closed: true, winners: [], entries: 0 });
});

test("the job closes due giveaways once, edits the message, and pings only the winners", async () => {
  const guild = proGuild();
  const id = await newGiveaway(guild, { winners: 2, duration: 10 });
  const evil = createGiveaway({ guildId: guild.id, channelId: guild.channel.id, hostId: HOST, prize: "@everyone <@&1> free", winners: 1, endsAt: T0 + 5000 });
  for (const u of users(4)) {
    toggleEntry(id, u);
    toggleEntry(evil, u);
  }
  const client = clientFor(guild);
  const before = guild.channel.sent.length;

  assert.equal(await runGiveaways(client, { now: T0 + 1000, rng: () => 0 }), 0);
  assert.equal(await runGiveaways(client, { now: T0 + 11 * 60_000, rng: () => 0 }), 2);
  // a second tick, or an overlapping one, does nothing more
  assert.equal(await runGiveaways(client, { now: T0 + 12 * 60_000, rng: () => 0 }), 0);
  assert.equal(await runGiveaways(client, { now: T0 + 12 * 60_000, rng: () => 0 }), 0);

  const announcements = guild.channel.sent.slice(before);
  assert.equal(announcements.length, 2);
  const real = getGiveaway(id).winnerIds;
  assert.equal(real.length, 2);
  const mine = announcements.find((m) => m.payload.content.includes("Prize"));
  assert.deepEqual(mine.payload.allowedMentions.parse, []);
  assert.deepEqual(mine.payload.allowedMentions.users.sort(), [...real].sort());
  const hostile = announcements.find((m) => m.payload.content.includes("@everyone"));
  assert.deepEqual(hostile.payload.allowedMentions.parse, []);
  assert.equal(hostile.payload.allowedMentions.users.length, 1);

  const original = guild.channel.sent[0];
  assert.equal(original.edits.length, 1);
  assert.deepEqual(original.edits[0].components, []);
  assert.match(original.edits[0].embeds[0].data.title, /đã kết thúc/);
});

test("a giveaway that came due while the bot was off is closed on the next start", async () => {
  const guild = proGuild();
  const id = await newGiveaway(guild, { duration: 10 });
  toggleEntry(id, users(1)[0]);
  // simulate a restart: the database handle is dropped and reopened, only the stored state remains
  closeDb();
  const closed = await runGiveaways(clientFor(guild), { now: T0 + 3 * 24 * 3_600_000 });
  assert.ok(closed >= 1);
  assert.deepEqual(getGiveaway(id).winnerIds, [users(1)[0]]);
});

test("a server that is down or not loaded is retried, and one the bot left is closed quietly after a day", async () => {
  const guild = proGuild();
  const id = createGiveaway({ guildId: guild.id, channelId: guild.channel.id, hostId: HOST, prize: "P", winners: 1, endsAt: T0 });
  toggleEntry(id, users(1)[0]);
  guild.available = false;
  assert.equal(await runGiveaways(clientFor(guild), { now: T0 + 60_000 }), 0);
  assert.equal(getGiveaway(id).status, "active");
  guild.available = true;
  assert.equal(await runGiveaways(clientFor(), { now: T0 + 60_000 }), 0);
  assert.equal(getGiveaway(id).status, "active");
  assert.equal(await runGiveaways(clientFor(), { now: T0 + 25 * 3_600_000 }), 1);
  assert.equal(getGiveaway(id).status, "ended");
});

test("one broken giveaway does not stop the others", async () => {
  const guild = proGuild();
  guild.channel.send = async () => {
    throw new Error("Missing Access");
  };
  const a = createGiveaway({ guildId: guild.id, channelId: guild.channel.id, hostId: HOST, prize: "A", winners: 1, endsAt: T0 });
  const b = createGiveaway({ guildId: guild.id, channelId: guild.channel.id, hostId: HOST, prize: "B", winners: 1, endsAt: T0 });
  assert.equal(await runGiveaways(clientFor(guild), { now: T0 + 1000 }), 2);
  assert.equal(getGiveaway(a).status, "ended");
  assert.equal(getGiveaway(b).status, "ended");
});

test("the job module is shaped like the others", () => {
  assert.equal(job.name, "giveaways");
  assert.equal(job.everyMs, 30_000);
  assert.equal(typeof job.run, "function");
});

// ---------- cancel, reroll, list ----------

test("cancel works once on an active giveaway and the job never closes it", async () => {
  const guild = proGuild();
  const id = await newGiveaway(guild, { duration: 10 });
  const denied = slash(guild, { sub: "huy", manage: false, options: { so: id } });
  await quatang.execute(denied, { now: T0 });
  assert.equal(getGiveaway(id).status, "active");

  const i = slash(guild, { sub: "huy", options: { so: id } });
  await quatang.execute(i, { now: T0 });
  assert.match(i.replies[0].content, /Đã huỷ/);
  assert.equal(getGiveaway(id).status, "cancelled");
  assert.match(guild.channel.sent[0].edits.at(-1).embeds[0].data.title, /đã huỷ/);
  const again = slash(guild, { sub: "huy", options: { so: id } });
  await quatang.execute(again, { now: T0 });
  assert.match(again.replies[0].content, /rồi/);
  assert.equal(await runGiveaways(clientFor(guild), { now: T0 + 3_600_000 }), 0);
  const press = click(guild, { userId: users(1)[0] });
  await quatang.handleComponent(press, ["join", String(id)], SOON);
  assert.match(press.replies[0].content, /kết thúc/);

  const other = proGuild();
  const steal = slash(other, { sub: "huy", options: { so: id } });
  await quatang.execute(steal, { now: T0 });
  assert.match(steal.replies[0].content, /Không thấy/);
});

test("reroll draws new people, never a previous winner, and only after the end", async () => {
  const guild = proGuild();
  const id = await newGiveaway(guild, { winners: 2, duration: 10 });
  for (const u of users(5)) toggleEntry(id, u);

  const early = slash(guild, { sub: "chonlai", options: { so: id } });
  await quatang.execute(early, { now: T0 });
  assert.match(early.replies[0].content, /chưa kết thúc/);

  await runGiveaways(clientFor(guild), { now: T0 + 11 * 60_000, rng: () => 0 });
  const firstWinners = getGiveaway(id).winnerIds;
  const before = guild.channel.sent.length;
  const i = slash(guild, { sub: "chonlai", options: { so: id, soluong: 2 } });
  await quatang.execute(i, { rng: () => 0 });
  const all = getGiveaway(id).winnerIds;
  assert.equal(all.length, 4);
  assert.equal(new Set(all).size, 4);
  assert.deepEqual(all.slice(0, 2), firstWinners);
  const note = guild.channel.sent[before];
  assert.deepEqual(note.payload.allowedMentions.parse, []);
  assert.deepEqual(note.payload.allowedMentions.users, all.slice(2));

  // one person left in the pool, then nobody
  const last = slash(guild, { sub: "chonlai", options: { so: id, soluong: 5 } });
  await quatang.execute(last, { rng: () => 0 });
  assert.equal(getGiveaway(id).winnerIds.length, 5);
  const empty = slash(guild, { sub: "chonlai", options: { so: id } });
  await quatang.execute(empty, { rng: () => 0 });
  assert.match(empty.replies[0].content, /Hết người/);

  assert.deepEqual(rerollGiveaway("other-guild", id, 1), { ok: false, reason: "missing" });
  assert.deepEqual(rerollGiveaway(guild.id, 987654, 1), { ok: false, reason: "missing" });
});

test("danhsach lists recent giveaways with no pings", async () => {
  const guild = proGuild();
  const empty = slash(guild, { sub: "danhsach" });
  await quatang.execute(empty, { now: T0 });
  assert.match(empty.replies[0].content, /Chưa có/);
  await newGiveaway(guild);
  const i = slash(guild, { sub: "danhsach" });
  await quatang.execute(i, { now: T0 });
  assert.match(i.replies[0].embeds[0].data.description, /Prize/);
  assert.deepEqual(i.replies[0].allowedMentions, { parse: [] });
});

// ---------- polls ----------

test("cleanOptions trims, caps, merges repeats and needs two", () => {
  assert.deepEqual(polls.cleanOptions([" A ", "a", "B", null, "", "  "]), ["A", "B"]);
  assert.equal(polls.cleanOptions(["A", "a"]), null);
  assert.equal(polls.cleanOptions([]), null);
  assert.equal(polls.cleanOptions("A,B"), null);
  assert.equal(polls.cleanOptions(Array.from({ length: 9 }, (_, i) => `o${i}`)).length, 5);
  assert.equal(polls.cleanOptions(["x".repeat(500), "y"])[0].length, 80);
  assert.deepEqual(polls.cleanOptions(["‮A", "B\n"]), ["A", "B"]);
});

test("the results render with bars, counts and percentages", () => {
  const text = polls.renderResults(["Có", "Không"], [3, 1]);
  assert.match(text, /75% \(3\)/);
  assert.match(text, /25% \(1\)/);
  assert.match(polls.renderResults(["A", "B"], [0, 0]), /0% \(0\)/);
  assert.equal(polls.percentBar(1, 5), "▰▰▰▰▰");
});

function pollOptions(extra = {}) {
  return { cauhoi: "Ăn gì?", lua1: "Phở", lua2: "Bún", ...extra };
}

test("/binhchon is for staff, works on the free plan, and posts buttons", async () => {
  assert.equal(binhchon.data.toJSON().default_member_permissions, String(P.ManageMessages));
  const guild = fakeGuild();
  const denied = slash(guild, { sub: undefined, manage: false, options: pollOptions() });
  await binhchon.execute(denied, { now: T0 });
  assert.equal(guild.channel.sent.length, 0);

  const i = slash(guild, { options: pollOptions({ lua3: "Cơm", thoigian: 60 }) });
  await binhchon.execute(i, { now: T0 });
  const [row] = getDb().prepare("SELECT * FROM polls WHERE guild_id = ?").all(guild.id);
  assert.equal(row.ends_at, T0 + 3_600_000);
  assert.equal(JSON.parse(row.options).length, 3);
  const payload = guild.channel.sent[0].payload;
  assert.equal(payload.components[0].components.length, 3);
  assert.equal(payload.components[0].components[2].data.custom_id, `binhchon:v:${row.id}:2`);
  assert.equal(payload.components[1].components[0].data.custom_id, `binhchon:c:${row.id}`);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
});

test("/binhchon refuses a single option, junk durations and too many open polls", async () => {
  const guild = fakeGuild();
  const one = slash(guild, { options: { cauhoi: "Q", lua1: "A", lua2: "a" } });
  await binhchon.execute(one, { now: T0 });
  assert.match(one.replies[0].content, /ít nhất 2/);
  const time = slash(guild, { options: pollOptions({ thoigian: 7 }) });
  await binhchon.execute(time, { now: T0 });
  assert.equal(guild.channel.sent.length, 0);
  const blank = slash(guild, { options: pollOptions({ cauhoi: "‮  " }) });
  await binhchon.execute(blank, { now: T0 });
  assert.match(blank.replies[0].content, /Câu hỏi/);

  for (let n = 0; n < 10; n += 1) await binhchon.execute(slash(guild, { options: pollOptions() }), { now: T0 });
  const over = slash(guild, { options: pollOptions() });
  await binhchon.execute(over, { now: T0 });
  assert.match(over.replies[0].content, /10 bình chọn/);
  assert.equal(guild.channel.sent.length, 10);

  const quiet = fakeGuild({ perms: false });
  const noPerm = slash(quiet, { options: pollOptions() });
  await binhchon.execute(noPerm, { now: T0 });
  assert.match(noPerm.replies[0].content, /Gửi tin nhắn/);
});

async function newPoll(guild, extra = {}) {
  await binhchon.execute(slash(guild, { options: pollOptions(extra) }), { now: T0 });
  return getDb().prepare("SELECT id FROM polls WHERE guild_id = ? ORDER BY id DESC LIMIT 1").get(guild.id).id;
}

test("voting: one vote per person, changing is allowed, counts update live", async () => {
  const guild = fakeGuild();
  const id = await newPoll(guild);
  const [a, b, c] = users(3);

  const v1 = click(guild, { userId: a });
  await binhchon.handleComponent(v1, ["v", String(id), "0"], SOON);
  assert.match(v1.updates[0].embeds[0].data.description, /100% \(1\)/);

  await binhchon.handleComponent(click(guild, { userId: b }), ["v", String(id), "0"], SOON);
  const v3 = click(guild, { userId: c });
  await binhchon.handleComponent(v3, ["v", String(id), "1"], SOON);
  assert.match(v3.updates[0].embeds[0].data.description, /67% \(2\)/);
  assert.deepEqual(polls.tally(id, 2), [2, 1]);

  // changing a vote moves it, it never adds one
  const change = click(guild, { userId: a });
  await binhchon.handleComponent(change, ["v", String(id), "1"], SOON);
  assert.deepEqual(polls.tally(id, 2), [1, 2]);
  // pressing the same option again is a no-op
  const same = click(guild, { userId: a });
  await binhchon.handleComponent(same, ["v", String(id), "1"], SOON);
  assert.match(same.replies[0].content, /đã chọn đúng/);
  assert.equal(same.updates.length, 0);
  assert.deepEqual(polls.tally(id, 2), [1, 2]);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM poll_votes WHERE poll_id = ?").get(id).n, 3);
});

test("polls are anonymous: no voter appears in the message", async () => {
  const guild = fakeGuild();
  const id = await newPoll(guild);
  const v = click(guild, { userId: users(1)[0] });
  await binhchon.handleComponent(v, ["v", String(id), "0"], SOON);
  const shown = JSON.stringify(v.updates[0]);
  assert.ok(!shown.includes(users(1)[0]));
});

test("bad votes: bots, out-of-range choices, other servers, closed polls", async () => {
  const guild = fakeGuild();
  const id = await newPoll(guild, { thoigian: 10 });
  const bot = click(guild, { userId: users(1)[0], bot: true });
  await binhchon.handleComponent(bot, ["v", String(id), "0"], SOON);
  assert.match(bot.replies[0].content, /Bot/);
  for (const idx of ["2", "-1", "x", "1.5", "99", ""]) {
    const r = click(guild, { userId: users(2)[1] });
    await binhchon.handleComponent(r, ["v", String(id), idx], SOON);
    assert.match(r.replies[0].content, /không có trong/);
  }
  const other = fakeGuild();
  const stranger = click(other, { userId: users(2)[1] });
  await binhchon.handleComponent(stranger, ["v", String(id), "0"], SOON);
  assert.match(stranger.replies[0].content, /không còn/);
  for (const junk of ["abc", "-4", "0", "99999"]) {
    const r = click(guild, { userId: users(2)[1] });
    await binhchon.handleComponent(r, ["v", junk, "0"], SOON);
    assert.match(r.replies[0].content, /không còn/);
  }
  const late = click(guild, { userId: users(2)[1] });
  await polls.handlePollPress(late, ["v", String(id), "0"], { now: T0 + 11 * 60_000 });
  assert.match(late.replies[0].content, /đóng rồi/);
  assert.deepEqual(polls.tally(id, 2), [0, 0]);
});

test("the close button is for the creator and staff only, and closes once", async () => {
  const guild = fakeGuild();
  const id = await newPoll(guild);
  await binhchon.handleComponent(click(guild, { userId: users(1)[0] }), ["v", String(id), "0"], SOON);
  const nope = click(guild, { userId: users(2)[1] });
  await binhchon.handleComponent(nope, ["c", String(id)], SOON);
  assert.match(nope.replies[0].content, /Chỉ người mở/);
  assert.equal(polls.getPoll(id).status, "active");

  const staff = click(guild, { userId: users(3)[2], manage: true });
  await binhchon.handleComponent(staff, ["c", String(id)], SOON);
  assert.equal(polls.getPoll(id).status, "closed");
  assert.deepEqual(staff.updates[0].components, []);
  assert.match(staff.updates[0].embeds[0].data.title, /đã đóng/);
  const again = click(guild, { userId: users(3)[2], manage: true });
  await binhchon.handleComponent(again, ["c", String(id)], SOON);
  assert.match(again.replies[0].content, /đóng rồi/);
  const vote = click(guild, { userId: users(4)[3] });
  await binhchon.handleComponent(vote, ["v", String(id), "0"], SOON);
  assert.match(vote.replies[0].content, /đóng rồi/);

  const second = await newPoll(guild);
  const creator = click(guild, { userId: HOST });
  await binhchon.handleComponent(creator, ["c", String(second)], SOON);
  assert.equal(polls.getPoll(second).status, "closed");
});

test("the job closes polls at their end time with the final result, and only once", async () => {
  const guild = fakeGuild();
  const id = await newPoll(guild, { thoigian: 10 });
  const open = await newPoll(guild);
  await binhchon.handleComponent(click(guild, { userId: users(1)[0] }), ["v", String(id), "1"], SOON);
  const client = clientFor(guild);
  assert.equal(await runPolls(client, { now: T0 + 60_000 }), 0);
  assert.equal(await runPolls(client, { now: T0 + 11 * 60_000 }), 1);
  assert.equal(await runPolls(client, { now: T0 + 12 * 60_000 }), 0);
  assert.equal(polls.getPoll(id).status, "closed");
  assert.equal(polls.getPoll(open).status, "active");
  const message = guild.channel.sent[0];
  assert.equal(message.edits.length, 1);
  assert.match(message.edits[0].embeds[0].data.description, /100% \(1\)/);
  assert.deepEqual(message.edits[0].components, []);
});

test("hostile text in polls and prizes stays inert", async () => {
  const guild = proGuild();
  await binhchon.execute(slash(guild, { options: { cauhoi: "@everyone [x](http://evil) <@123>", lua1: "@here", lua2: "<#1>" } }), { now: T0 });
  const payload = guild.channel.sent[0].payload;
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.ok(payload.embeds[0].data.title.length <= 256);
  assert.ok(payload.components[0].components.every((b) => b.data.label.length <= 80));
});
