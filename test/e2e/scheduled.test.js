import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PermissionFlagsBits as P } from "discord.js";
import { BASE_TIME, ChannelType, apiError, createGateway, textOf } from "./gateway.js";

const gw = await createGateway({ env: { STRIPE_SECRET_KEY: "sk_test_e2e", PAYOS_CLIENT_ID: null, PAYOS_API_KEY: null, PAYOS_CHECKSUM_KEY: null, UNLOCKED_GUILD_IDS: null, OWNER_IDS: null, TIMEZONE: "Asia/Ho_Chi_Minh" } });
after(() => gw.close());

const { grant } = await import("../../src/license.js");
const { getDb } = await import("../../src/db.js");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Vietnam is UTC+7 all year
const vn = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour - 7, minute);
const row = (id) => getDb().prepare("SELECT * FROM scheduled_messages WHERE id = ?").get(id);

function setup(options = {}) {
  gw.clock.set(BASE_TIME);
  const guild = gw.createGuild(options);
  const admin = gw.addAdmin(guild);
  const channel = guild.addChannel({ name: "thong-bao", type: ChannelType.GuildText });
  grant(guild.id, "pro", 90, gw.clock.now());
  return { guild, admin, channel };
}

const hengio = (ctx, sub, options = {}, member = ctx.admin, extra = {}) => gw.slash("hengio", { guild: ctx.guild, member, sub, options, ...extra });
const tao = (ctx, options) => hengio(ctx, "tao", { kenh: ctx.channel, noidung: "Chào buổi sáng cả nhà", gio: "08:30", ...options });
const idIn = (text) => Number(/#(\d+)/.exec(text)?.[1]);
const posted = (ctx) => gw.sentTo(ctx.channel);
const runJob = async () => {
  await gw.runJob("scheduled");
};

// ---------------------------------------------------------------- creating, listing, previewing, removing

test("an admin schedules a message, sees it, previews it and removes it", async () => {
  const ctx = setup();
  const made = await tao(ctx, { noidung: "Họp lúc 9h\\nĐừng trễ", gio: "8:05" });
  const id = idIn(made.text);
  assert.ok(id > 0);
  assert.match(made.text, /mỗi ngày lúc 08:05/);
  assert.match(made.text, /không ping/);
  assert.equal(made.last.flags & 64, 64, "private to the admin");
  const saved = row(id);
  assert.equal(saved.hhmm, "08:05");
  assert.equal(saved.weekday, null);
  assert.equal(saved.body, "Họp lúc 9h\nĐừng trễ", "a typed \\n becomes a line break");
  assert.equal(saved.next_at, vn(4, 8, 5), "19:00 on the 3rd in Vietnam: the next 08:05 is the morning of the 4th");
  assert.equal(saved.created_by, ctx.admin.id);

  const list = await hengio(ctx, "danhsach");
  assert.match(textOf(list.last), new RegExp(`#${id}`));
  assert.match(textOf(list.last), /08:05/);

  const preview = await hengio(ctx, "thu", { so: id });
  assert.match(preview.text, /Họp lúc 9h\nĐừng trễ/);
  assert.equal(preview.last.flags & 64, 64);
  const typed = await hengio(ctx, "thu", { noidung: "xem thử cái này" });
  assert.match(typed.text, /xem thử cái này/);
  assert.equal(posted(ctx).length, 0, "a preview posts nothing in the channel");
  assert.match((await hengio(ctx, "thu")).text, /nội dung/);
  assert.match((await hengio(ctx, "thu", { so: id, noidung: "x" })).text, /không phải cả hai/);

  const auto = await gw.autocomplete("hengio", { guild: ctx.guild, member: ctx.admin, sub: "xoa", focused: { name: "so", value: "" } });
  assert.deepEqual(auto.choices.map((c) => c.value), [id]);
  const nobody = await gw.autocomplete("hengio", { guild: ctx.guild, member: gw.addPerson(ctx.guild, "xem"), sub: "xoa", focused: { name: "so", value: "" } });
  assert.deepEqual(nobody.choices, []);

  assert.match((await hengio(ctx, "xoa", { so: id })).text, /Đã xoá/);
  assert.equal(row(id), undefined);
  assert.match((await hengio(ctx, "xoa", { so: id })).text, /Không thấy/);
  assert.match((await hengio(ctx, "danhsach")).text, /Chưa hẹn/);
});

test("a schedule belongs to its own server: another server cannot see, preview or remove it", async () => {
  const one = setup();
  const two = setup();
  const id = idIn((await tao(one)).text);
  assert.match((await hengio(two, "xoa", { so: id })).text, /Không thấy/);
  assert.match((await hengio(two, "thu", { so: id })).text, /Không thấy/);
  assert.ok(row(id), "still there");
  const auto = await gw.autocomplete("hengio", { guild: two.guild, member: two.admin, sub: "xoa", focused: { name: "so", value: "" } });
  assert.deepEqual(auto.choices, []);
});

// ---------------------------------------------------------------- permissions, plan, input

test("only an administrator may schedule, and a free server is asked to upgrade", async () => {
  const ctx = setup();
  const mod = gw.addMod(ctx.guild, "mod");
  const refused = await hengio(ctx, "tao", { kenh: ctx.channel, noidung: "x", gio: "10:00" }, mod, { hidden: true });
  assert.ok(refused.last.content.length > 0);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM scheduled_messages WHERE guild_id = ?").get(ctx.guild.id).n, 0);
  await assert.rejects(() => hengio(ctx, "tao", { kenh: ctx.channel, noidung: "x", gio: "10:00" }, mod), /hide/);

  const free = gw.createGuild();
  const boss = gw.addAdmin(free);
  const chan = free.addChannel({ name: "chung", type: ChannelType.GuildText });
  const res = await gw.slash("hengio", { guild: free, member: boss, sub: "tao", options: { kenh: chan, noidung: "hello", gio: "10:00" } });
  assert.match(res.text, /gói Pro/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM scheduled_messages WHERE guild_id = ?").get(free.id).n, 0);
});

test("Pro holds five scheduled messages, the sixth is refused, and removing one frees a place", async () => {
  const ctx = setup();
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(idIn((await tao(ctx, { noidung: `tin ${i}`, gio: `0${i + 1}:00` })).text));
  assert.ok(ids.every(Boolean));
  assert.match((await tao(ctx, { noidung: "tin thứ sáu" })).text, /hết 5/);
  await hengio(ctx, "xoa", { so: ids[0] });
  assert.ok(idIn((await tao(ctx, { noidung: "tin thay thế" })).text) > 0);
});

test("bad times, empty text, a channel the bot cannot write in and hostile text are handled", async () => {
  const ctx = setup();
  for (const gio of ["25:00", "8h", "12:60", "", "ab:cd", "7:5"]) {
    const res = await tao(ctx, { gio: gio || "x" });
    assert.match(res.text, /HH:mm/, `time ${gio}`);
  }
  assert.match((await tao(ctx, { noidung: "   ‮​  " })).text, /trống trơn/);
  await assert.rejects(() => tao(ctx, { noidung: "x".repeat(1501) }), /over 1500/);
  await assert.rejects(() => tao(ctx, { kenh: ctx.guild.addChannel({ name: "voice", type: ChannelType.GuildVoice }) }), /not allowed/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM scheduled_messages WHERE guild_id = ?").get(ctx.guild.id).n, 0);

  const small = setup({ botPermissions: ["ViewChannel", "SendMessages"] });
  const closed = small.guild.addChannel({ name: "chi-doc", type: ChannelType.GuildText, overwrites: [{ id: small.guild.members.me.id, deny: [P.SendMessages] }] });
  const res = await tao(small, { kenh: closed });
  assert.match(res.text, /Gửi tin nhắn/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM scheduled_messages WHERE guild_id = ?").get(small.guild.id).n, 0);

  // the longest text, with mentions and direction marks in it, is stored cleaned and posted without a single ping
  const body = `@everyone <@&123456789012345678> <@123456789012345678>‮ ${"a".repeat(1400)}`.slice(0, 1500);
  const ok = await tao(ctx, { noidung: body, gio: "07:00" });
  const id = idIn(ok.text);
  assert.ok(row(id).body.length <= 1500);
  assert.doesNotMatch(row(id).body, /‮/);
  gw.clock.set(vn(4, 7, 0));
  await runJob();
  const sent = posted(ctx).at(-1);
  assert.deepEqual(sent.payload.allowedMentions, { parse: [] });
  assert.ok(sent.payload.content.length <= 2000);
});

// ---------------------------------------------------------------- the job: exactly once, midnight, weekly

test("a daily message is posted once per day at the right minute, and never twice", async () => {
  const ctx = setup();
  const id = idIn((await tao(ctx)).text); // 08:30 daily, first on the 4th
  assert.equal(row(id).next_at, vn(4, 8, 30));

  gw.clock.set(vn(4, 8, 29));
  await runJob();
  assert.equal(posted(ctx).length, 0, "a minute early: nothing");

  gw.clock.set(vn(4, 8, 30));
  await runJob();
  await runJob();
  assert.equal(posted(ctx).length, 1, "posted once, a second tick at the same moment adds nothing");
  assert.equal(textOf(posted(ctx)[0].payload), "Chào buổi sáng cả nhà");
  assert.deepEqual(posted(ctx)[0].payload.allowedMentions, { parse: [] });
  assert.equal(row(id).next_at, vn(5, 8, 30));
  assert.equal(row(id).last_sent_at, vn(4, 8, 30));

  gw.clock.set(vn(4, 20, 0));
  await runJob();
  assert.equal(posted(ctx).length, 1);

  gw.clock.set(vn(5, 8, 30) + 15_000);
  await runJob();
  assert.equal(posted(ctx).length, 2);
  assert.equal(row(id).next_at, vn(6, 8, 30));
});

test("two overlapping runs of the job still post one message", async () => {
  const ctx = setup();
  const id = idIn((await tao(ctx, { gio: "09:00" })).text);
  gw.clock.set(vn(4, 9, 0));
  await Promise.all([gw.runJob("scheduled"), gw.runJob("scheduled"), gw.runJob("scheduled")]);
  assert.equal(posted(ctx).length, 1);
  assert.equal(row(id).next_at, vn(5, 9, 0));
});

test("times around midnight in Vietnam roll over to the right day", async () => {
  const ctx = setup();
  // 19:00 on the 3rd: 23:30 is later today, 00:15 is early tomorrow, 00:00 exactly is tomorrow
  const late = idIn((await tao(ctx, { gio: "23:30", noidung: "khuya" })).text);
  const early = idIn((await tao(ctx, { gio: "00:15", noidung: "nửa đêm" })).text);
  assert.equal(row(late).next_at, vn(3, 23, 30));
  assert.equal(row(early).next_at, vn(4, 0, 15));

  gw.clock.set(vn(3, 23, 30));
  await runJob();
  assert.deepEqual(posted(ctx).map((r) => textOf(r.payload)), ["khuya"]);
  assert.equal(row(late).next_at, vn(4, 23, 30));

  gw.clock.set(vn(4, 0, 15) + 1000);
  await runJob();
  assert.deepEqual(posted(ctx).map((r) => textOf(r.payload)), ["khuya", "nửa đêm"]);
  assert.equal(row(early).next_at, vn(5, 0, 15), "00:15 stays 00:15 the next night, not 24 hours of drift");
});

test("a weekly message waits for its weekday and then for the next week", async () => {
  const ctx = setup();
  // 2026-10-03 is a Saturday; Sunday is 0, Monday is 1
  const sunday = idIn((await tao(ctx, { thu: 0, gio: "09:00", noidung: "chủ nhật" })).text);
  const saturday = idIn((await tao(ctx, { thu: 6, gio: "20:00", noidung: "thứ bảy" })).text);
  assert.match((await hengio(ctx, "danhsach")).text, /Chủ Nhật/);
  assert.equal(row(sunday).next_at, vn(4, 9, 0));
  assert.equal(row(saturday).next_at, vn(3, 20, 0), "later today");

  gw.clock.set(vn(3, 20, 0));
  await runJob();
  assert.deepEqual(posted(ctx).map((r) => textOf(r.payload)), ["thứ bảy"]);
  assert.equal(row(saturday).next_at, vn(10, 20, 0), "a week later");

  gw.clock.set(vn(4, 9, 0));
  await runJob();
  assert.deepEqual(posted(ctx).map((r) => textOf(r.payload)), ["thứ bảy", "chủ nhật"]);
  assert.equal(row(sunday).next_at, vn(11, 9, 0));

  gw.clock.set(vn(9, 12, 0));
  await runJob();
  assert.equal(posted(ctx).length, 2, "nothing between the weeks");
});

// ---------------------------------------------------------------- downtime and crashes

test("after downtime one missed occurrence is caught up, older ones are skipped", async () => {
  const ctx = setup();
  const recent = idIn((await tao(ctx, { gio: "08:30", noidung: "vừa lỡ" })).text);
  // the bot was down from the 3rd evening until 14:30 on the 4th: 08:30 was missed by 6 hours, within the catch-up window
  gw.clock.set(vn(4, 14, 30));
  await runJob();
  assert.deepEqual(posted(ctx).map((r) => textOf(r.payload)), ["vừa lỡ"]);
  assert.equal(row(recent).next_at, vn(5, 8, 30));
  await runJob();
  assert.equal(posted(ctx).length, 1);

  // down for four days: the days in between are not posted, and no burst comes later
  gw.clock.set(vn(9, 10, 0));
  await runJob();
  await runJob();
  assert.equal(posted(ctx).length, 1, "four missed mornings, none of them posted late");
  assert.equal(row(recent).next_at, vn(10, 8, 30));

  // a miss of just under 12 hours is posted, over 12 hours is skipped
  const edge = setup();
  const e = idIn((await tao(edge, { gio: "08:30", noidung: "gần" })).text);
  gw.clock.set(vn(4, 20, 29));
  await runJob();
  assert.equal(posted(edge).length, 1);
  const stale = setup();
  const s = idIn((await tao(stale, { gio: "08:30", noidung: "quá muộn" })).text);
  gw.clock.set(vn(4, 20, 31));
  await runJob();
  assert.equal(posted(stale).length, 0);
  assert.equal(row(s).next_at, vn(5, 8, 30));
  assert.equal(row(e).next_at, vn(5, 8, 30));
});

test("a post that fails is never repeated, and the next occurrence is untouched", async () => {
  const ctx = setup();
  const id = idIn((await tao(ctx, { gio: "10:00" })).text);
  const realSend = ctx.channel.send.bind(ctx.channel);
  let calls = 0;
  ctx.channel.send = async (payload) => {
    calls += 1;
    if (calls === 1) throw apiError(500, "Discord is having a bad day", 500);
    return realSend(payload);
  };
  gw.clock.set(vn(4, 10, 0));
  await runJob();
  assert.equal(calls, 1);
  assert.equal(row(id).next_at, vn(5, 10, 0), "the due time moved on before the attempt");
  assert.equal(row(id).last_sent_at, null, "and it is not recorded as sent");
  await gw.advance(30_000);
  await runJob();
  assert.equal(calls, 1, "no second attempt for the same occurrence");
  gw.clock.set(vn(5, 10, 0));
  await runJob();
  assert.equal(calls, 2);
  assert.equal(posted(ctx).length, 1);
  assert.equal(row(id).last_sent_at, vn(5, 10, 0));
});

test("a channel the bot cannot write in is retried, and a deleted channel pauses the schedule", async () => {
  const ctx = setup({ botPermissions: ["ViewChannel", "SendMessages"] });
  const id = idIn((await tao(ctx, { gio: "10:00" })).text);
  // the right to write is taken away after the schedule was made
  await ctx.channel.permissionOverwrites.edit(ctx.guild.members.me.id, { SendMessages: false });
  gw.clock.set(vn(4, 10, 0));
  await runJob();
  assert.equal(posted(ctx).length, 0);
  assert.equal(row(id).next_at, vn(4, 10, 0), "not claimed: it will be tried again");
  // fixed in time: it goes out on the next tick
  await ctx.channel.permissionOverwrites.edit(ctx.guild.members.me.id, { SendMessages: true });
  await gw.advance(30_000);
  await runJob();
  assert.equal(posted(ctx).length, 1);

  await gw.deleteChannel(ctx.channel);
  gw.clock.set(vn(5, 10, 0));
  await runJob();
  assert.equal(row(id).status, "broken");
  const list = await hengio(ctx, "danhsach");
  assert.match(textOf(list.last), /tạm dừng/);
  gw.clock.set(vn(6, 10, 0));
  await runJob();
  assert.equal(gw.find("send", (r) => r.guildId === ctx.guild.id).length, 1);
  assert.match((await hengio(ctx, "xoa", { so: id })).text, /Đã xoá/);
});

test("when the plan ends nothing is posted, and when it comes back old misses are not replayed", async () => {
  const ctx = setup();
  const id = idIn((await tao(ctx, { gio: "08:30" })).text);
  // the 90 days of Pro run out
  gw.clock.set(vn(4, 8, 30) + 100 * DAY);
  await runJob();
  assert.equal(posted(ctx).length, 0, "no plan, no post");
  assert.equal(row(id).status, "active");
  grant(ctx.guild.id, "pro", 30, gw.clock.now());
  await runJob();
  assert.equal(posted(ctx).length, 0, "a hundred days late is far past the catch-up window");
  assert.ok(row(id).next_at > gw.clock.now());
});

test("a server the bot is not in is skipped and its rows survive", async () => {
  const ctx = setup();
  const id = idIn((await tao(ctx)).text);
  await gw.botLeaves(ctx.guild);
  gw.clock.set(vn(4, 8, 30));
  await runJob();
  assert.equal(row(id).next_at, vn(4, 8, 30), "left untouched");
  assert.equal(posted(ctx).length, 0);
});
