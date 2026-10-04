import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "suggest-test-"));

const logic = await import("../src/suggest/logic.js");
const store = await import("../src/suggest/store.js");
const { buildSuggestionPayload } = await import("../src/suggest/view.js");
const gopy = (await import("../src/commands/gopy.js")).default;
const { patchSection, getSection } = await import("../src/settings.js");
const { getDb, closeDb } = await import("../src/db.js");

after(() => closeDb());

let n = 0;
const newId = () => `95000000000000${String(++n).padStart(4, "0")}`;
const T0 = Date.UTC(2026, 5, 10, 8, 0, 0);
const BOT = "950000000000000099";

const memberWith = (perms = [], roleIds = []) => ({
  id: newId(),
  permissions: { has: (f) => perms.includes(f) },
  roles: { cache: { has: (r) => roleIds.includes(r) } },
});

function fakeGuild({ perms = true } = {}) {
  const id = newId();
  const posts = [];
  const channel = {
    id: newId(),
    type: 0,
    messages: { fetch: async () => Promise.reject(new Error("unknown")) },
    permissionsFor: () => ({ has: (f) => perms || f === "ViewChannel" }),
    send: async (p) => {
      const m = { id: newId(), payload: p };
      posts.push(m);
      return m;
    },
  };
  return { id, posts, channel, channels: { cache: new Map([[channel.id, channel]]) }, members: { me: { id: BOT } } };
}

function fakeInteraction({ guild, sub, options = {}, member, userId = member?.id ?? newId() }) {
  const sent = [];
  return {
    sent,
    guild,
    guildId: guild.id,
    member,
    user: { id: userId },
    client: { user: { id: BOT } },
    options: {
      getSubcommand: () => sub,
      getString: (k) => options[k] ?? null,
      getInteger: (k) => options[k] ?? null,
      getBoolean: (k) => (k in options ? options[k] : null),
      getChannel: (k) => options[k] ?? null,
      getRole: (k) => options[k] ?? null,
    },
    reply: async (p) => sent.push(p),
  };
}

const admin = () => memberWith([P.ManageGuild]);

test("sanitize strips mentions, masked links and control characters, and caps length", () => {
  const out = logic.cleanSuggestion("hi @everyone @here <@123456789012345678> <@&123456789012345678> <#123456789012345678> [click](http://evil.example) ‮\u0007end");
  assert.doesNotMatch(out, /@everyone|@here|<@|<#|\]\(|‮|\u0007/);
  assert.match(out, /hi/);
  assert.match(out, /end/);
  assert.equal(logic.cleanSuggestion("x".repeat(900)).length, 500);
  assert.equal(logic.cleanSuggestion("   \n\t  "), "");
  assert.equal(logic.cleanSuggestion(null), "");
  assert.equal(logic.cleanNote("n".repeat(900)).length, 300);
});

test("rate limit: one per 60 seconds and five per day", () => {
  assert.equal(logic.checkRate([], T0).ok, true);
  const fast = logic.checkRate([T0 - 20_000], T0);
  assert.deepEqual([fast.ok, fast.reason, fast.waitSec], [false, "fast", 40]);
  assert.equal(logic.checkRate([T0 - 61_000], T0).ok, true);
  const five = [1, 2, 3, 4, 5].map((i) => T0 - i * 3600_000);
  assert.deepEqual([logic.checkRate(five, T0).ok, logic.checkRate(five, T0).reason], [false, "day"]);
  // the oldest one leaving the window frees a slot
  assert.equal(logic.checkRate([T0 - 25 * 3600_000, ...five.slice(1)], T0).ok, true);
});

test("isStaff: Manage Server or the staff role, nothing else", () => {
  const settings = { staffRoleId: "950000000000000777" };
  assert.equal(logic.isStaff(memberWith([P.ManageGuild]), settings), true);
  assert.equal(logic.isStaff(memberWith([], ["950000000000000777"]), settings), true);
  assert.equal(logic.isStaff(memberWith([P.ManageMessages], ["950000000000000778"]), settings), false);
  assert.equal(logic.isStaff(memberWith([], ["950000000000000777"]), { staffRoleId: null }), false);
  assert.equal(logic.isStaff(null, settings), false);
});

test("votes: one per person, changeable, same button takes it back", () => {
  const id = store.createSuggestion({ guildId: newId(), channelId: newId(), userId: newId(), body: "b", now: T0 });
  const [a, b] = [newId(), newId()];
  store.castVote(id, a, 1);
  store.castVote(id, a, 1);
  assert.deepEqual(store.tally(id), { up: 0, down: 0 }, "pressing the same side again withdraws");
  store.castVote(id, a, 1);
  store.castVote(id, b, 1);
  assert.deepEqual(store.tally(id), { up: 2, down: 0 });
  store.castVote(id, a, -1);
  assert.deepEqual(store.tally(id), { up: 1, down: 1 }, "changing sides moves the vote, it does not add one");
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM suggestion_votes WHERE suggestion_id = ?").get(id).n, 2);
});

test("a decision is recorded once, with who and the note", () => {
  const id = store.createSuggestion({ guildId: newId(), channelId: newId(), userId: newId(), body: "b", now: T0 });
  assert.equal(store.decide(id, "ok", "staff1", "hay đó"), true);
  assert.equal(store.decide(id, "no", "staff2", "đổi ý"), false);
  const row = store.getSuggestion(id);
  assert.deepEqual([row.status, row.decided_by, row.note], ["approved", "staff1", "hay đó"]);
  assert.equal(store.decide(id, "bogus", "s", ""), false);
});

test("the posted payload: vote and staff buttons while open, none once decided, nobody pinged", () => {
  const s = { id: 7, user_id: "950000000000000001", body: "thêm kênh meme", status: "open", decided_by: null, note: null };
  const open = buildSuggestionPayload(s, { up: 3, down: 1 });
  assert.deepEqual(open.allowedMentions, { parse: [] });
  const ids = open.components.flatMap((r) => r.toJSON().components.map((c) => c.custom_id));
  assert.deepEqual(ids, ["gopy:up:7", "gopy:down:7", "gopy:ok:7", "gopy:no:7", "gopy:done:7"]);
  const decided = buildSuggestionPayload({ ...s, status: "approved", decided_by: "950000000000000002", note: "ok" }, { up: 3, down: 1 });
  assert.equal(decided.components.length, 0);
  assert.doesNotMatch(JSON.stringify(decided), /—/);
});

test("/gopy gui: needs setup, posts once with no pings, enforces the rate limits and removes nothing on failure", async () => {
  const guild = fakeGuild();
  const user = newId();
  const body = "Thêm kênh @everyone <@123456789012345678>";
  const early = fakeInteraction({ guild, sub: "gui", options: { noidung: body }, userId: user });
  await gopy.execute(early, { now: T0 });
  assert.match(early.sent[0].content, /chưa được mở/);

  patchSection(guild.id, "suggest", { enabled: true, channelId: guild.channel.id });
  const ok = fakeInteraction({ guild, sub: "gui", options: { noidung: body }, userId: user });
  await gopy.execute(ok, { now: T0 });
  assert.match(ok.sent[0].content, /Góp ý #\d+ đã lên bảng/);
  assert.equal(guild.posts.length, 1);
  assert.deepEqual(guild.posts[0].payload.allowedMentions, { parse: [] });
  assert.doesNotMatch(JSON.stringify(guild.posts[0].payload.embeds[0].toJSON().description), /@everyone|<@1234/);

  const fast = fakeInteraction({ guild, sub: "gui", options: { noidung: "again" }, userId: user });
  await gopy.execute(fast, { now: T0 + 10_000 });
  assert.match(fast.sent[0].content, /chờ thêm 50 giây/);
  assert.equal(guild.posts.length, 1);

  for (let i = 1; i <= 4; i += 1) {
    const r = fakeInteraction({ guild, sub: "gui", options: { noidung: `n${i}` }, userId: user });
    await gopy.execute(r, { now: T0 + i * 120_000 });
    assert.match(r.sent[0].content, /đã lên bảng/);
  }
  const sixth = fakeInteraction({ guild, sub: "gui", options: { noidung: "n6" }, userId: user });
  await gopy.execute(sixth, { now: T0 + 700_000 });
  assert.match(sixth.sent[0].content, /5 lần/);
  assert.equal(guild.posts.length, 5);
  // another person is not held back by it
  const other = fakeInteraction({ guild, sub: "gui", options: { noidung: "mine" }, userId: newId() });
  await gopy.execute(other, { now: T0 + 700_000 });
  assert.match(other.sent[0].content, /đã lên bảng/);

  // empty after cleaning
  const empty = fakeInteraction({ guild, sub: "gui", options: { noidung: "@everyone <@123456789012345678>" }, userId: newId() });
  await gopy.execute(empty, { now: T0 });
  assert.match(empty.sent[0].content, /trống trơn/);

  // a failed post leaves nothing behind and does not count against the author
  const broken = fakeGuild();
  broken.channel.send = async () => Promise.reject(new Error("boom"));
  patchSection(broken.id, "suggest", { enabled: true, channelId: broken.channel.id });
  const victim = newId();
  const fail = fakeInteraction({ guild: broken, sub: "gui", options: { noidung: "x" }, userId: victim });
  await gopy.execute(fail, { now: T0 });
  assert.match(fail.sent[0].content, /không cho thầu đăng/);
  assert.equal(store.recentTimes(broken.id, victim, T0).length, 0);

  // missing bot permissions are named
  const mute = fakeGuild({ perms: false });
  patchSection(mute.id, "suggest", { enabled: true, channelId: mute.channel.id });
  const noPerm = fakeInteraction({ guild: mute, sub: "gui", options: { noidung: "x" }, userId: newId() });
  await gopy.execute(noPerm, { now: T0 });
  assert.match(noPerm.sent[0].content, /Gửi tin nhắn/);
});

test("/gopy admin side: caidat, danhsach and xoa re-check Manage Server at runtime", async () => {
  const guild = fakeGuild();
  const stranger = memberWith([P.ManageMessages]);
  for (const sub of ["caidat", "danhsach", "xoa"]) {
    const refused = fakeInteraction({ guild, sub, member: stranger, options: { so: 1, bat: true } });
    await gopy.execute(refused);
    assert.equal(refused.sent.length, 1);
    assert.ok(!refused.sent[0].embeds, `${sub} shows nothing to a stranger`);
  }
  assert.equal(getSection(guild.id, "suggest").enabled, false);

  const boss = admin();
  const noChannel = fakeInteraction({ guild, sub: "caidat", member: boss, options: { bat: true } });
  await gopy.execute(noChannel);
  assert.match(noChannel.sent[0].content, /đặt kênh/);
  const role = { id: "950000000000000555" };
  const saved = fakeInteraction({ guild, sub: "caidat", member: boss, options: { kenh: guild.channel, role, bat: true } });
  await gopy.execute(saved);
  assert.deepEqual(getSection(guild.id, "suggest"), { enabled: true, channelId: guild.channel.id, staffRoleId: role.id });
  const show = fakeInteraction({ guild, sub: "caidat", member: boss });
  await gopy.execute(show);
  assert.match(show.sent[0].content, /đang bật/);
  const off = fakeInteraction({ guild, sub: "caidat", member: boss, options: { bat: false } });
  await gopy.execute(off);
  assert.equal(getSection(guild.id, "suggest").enabled, false);

  const id = store.createSuggestion({ guildId: guild.id, channelId: guild.channel.id, userId: newId(), body: "mở: @everyone", now: T0 });
  const list = fakeInteraction({ guild, sub: "danhsach", member: boss });
  await gopy.execute(list);
  assert.match(list.sent[0].embeds[0].toJSON().description, new RegExp(`#${id}`));
  assert.doesNotMatch(list.sent[0].embeds[0].toJSON().description, /@everyone(?!​)/);

  // a suggestion of another server cannot be removed from here
  const foreign = store.createSuggestion({ guildId: newId(), channelId: newId(), userId: newId(), body: "other", now: T0 });
  const bad = fakeInteraction({ guild, sub: "xoa", member: boss, options: { so: foreign } });
  await gopy.execute(bad);
  assert.match(bad.sent[0].content, /Không thấy/);
  assert.equal(store.getSuggestion(foreign).status, "open");
  const del = fakeInteraction({ guild, sub: "xoa", member: boss, options: { so: id } });
  await gopy.execute(del);
  assert.match(del.sent[0].content, /Đã gỡ/);
  assert.equal(store.listOpen(guild.id).length, 0);
  const again = fakeInteraction({ guild, sub: "xoa", member: boss, options: { so: id } });
  await gopy.execute(again);
  assert.match(again.sent[0].content, /Không thấy/);
});
