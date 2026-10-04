import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createGateway, textOf } from "./gateway.js";

const gw = await createGateway({ env: { UNLOCKED_GUILD_IDS: null, OWNER_IDS: null, TIMEZONE: "Asia/Ho_Chi_Minh" } });
after(() => gw.close());

const { getDb } = await import("../../src/db.js");

const MIN = 60_000;
const HOUR = 60 * MIN;
const dmsTo = (member) => gw.find("dm", (r) => r.userId === member.id);

// The clock starts at 19:00 in Ho Chi Minh, so "21:30" is later today and "07:00" is tomorrow
test("a reminder is created, listed, and delivered by DM exactly once, on a free server", async () => {
  const guild = gw.createGuild();
  const member = gw.addPerson(guild, "an");
  const made = await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: "uống thuốc", saunua: 10 } });
  assert.match(made.text, /Ghi sổ lời nhắc/);
  assert.equal(made.replies[0].ephemeral, true);

  const listed = await gw.slash("nhacviec", { guild, member, sub: "danhsach" });
  assert.match(listed.text, /uống thuốc/);
  assert.equal(listed.replies[0].ephemeral, true);

  await gw.advance(5 * MIN, { jobs: ["reminders"] });
  assert.equal(dmsTo(member).length, 0, "not yet due");
  const ran = await gw.advance(6 * MIN, { jobs: ["reminders"] });
  assert.deepEqual(ran, ["reminders"]);
  assert.equal(dmsTo(member).length, 1);
  assert.match(textOf(dmsTo(member)[0].payload), /uống thuốc/);
  await gw.advance(HOUR, { jobs: ["reminders"] });
  await gw.runJob("reminders");
  assert.equal(dmsTo(member).length, 1, "never sent twice");

  const after = await gw.slash("nhacviec", { guild, member, sub: "danhsach" });
  assert.match(after.text, /chưa có lời nhắc/);
});

test("HH:mm today and tomorrow, with clear errors for bad input", async () => {
  const guild = gw.createGuild();
  const member = gw.addPerson(guild, "binh");
  const today = await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: "tối nay", luc: "21:30" } });
  assert.doesNotMatch(today.text, /ngày mai/);
  const tomorrow = await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: "sáng mai", luc: "07:00" } });
  assert.match(tomorrow.text, /ngày mai/);
  const rows = getDb().prepare("SELECT body, due_at FROM reminders WHERE user_id = ? ORDER BY id").all(member.id);
  const start = gw.clock.now();
  const d = new Date(start);
  const today2130 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 14, 30);
  const tomorrow0700 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0);
  assert.ok(start < today2130, "the test clock is before 21:30 local");
  assert.equal(rows[0].due_at, today2130);
  assert.equal(rows[1].due_at, tomorrow0700);

  for (const [options, pattern] of [
    [{ noidung: "x", luc: "25:99" }, /từ 00:00 đến 23:59/],
    [{ noidung: "x", luc: "abc" }, /HH:mm/],
    [{ noidung: "x" }, /saunua/],
    [{ noidung: "x", saunua: 10, luc: "10:00" }, /một thôi/],
    [{ noidung: "   " }, /trống trơn/],
  ]) {
    const refused = await gw.slash("nhacviec", { guild, member, sub: "tao", options });
    assert.match(refused.text, pattern);
  }
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?").get(member.id).n, 2, "refusals stored nothing");

  // tomorrow's reminder fires the next morning, not before
  await gw.advance(today2130 - start + MIN, { jobs: ["reminders"] });
  assert.equal(dmsTo(member).length, 1);
  assert.match(textOf(dmsTo(member)[0].payload), /tối nay/);
  await gw.advance(tomorrow0700 - gw.clock.now() + MIN, { jobs: ["reminders"] });
  assert.equal(dmsTo(member).length, 2);
});

test("closed DMs fall back to the channel, mentioning only that person", async () => {
  const guild = gw.createGuild();
  const channel = guild.textChannels()[0];
  const member = guild.addMember({ name: "chi", dmOpen: false });
  const bystander = gw.addPerson(guild, "khac");
  await gw.slash("nhacviec", { guild, member, channel, sub: "tao", options: { noidung: `họp @everyone <@${bystander.id}> <@&${guild.roles.everyone.id}>`, saunua: 10 } });
  await gw.advance(11 * MIN, { jobs: ["reminders"] });
  assert.equal(dmsTo(member).length, 0);
  const posts = gw.sentTo(channel, (r) => /Nhắc việc/.test(textOf(r.payload)));
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].payload.allowedMentions, { parse: [], users: [member.id] });
  const text = posts[0].payload.content;
  assert.ok(text.startsWith(`<@${member.id}>`));
  assert.ok(!text.includes(`<@${bystander.id}>`), "the pasted mention is defused");
  assert.ok(!/@everyone(?!​)/.test(text));
  await gw.runJob("reminders");
  assert.equal(gw.sentTo(channel, (r) => /Nhắc việc/.test(textOf(r.payload))).length, 1);
});

test("hostile input: long text is capped, mentions are defused in the DM", async () => {
  const guild = gw.createGuild();
  const member = gw.addPerson(guild, "doc");
  const victim = gw.addPerson(guild, "nan");
  const body = `@everyone @here <@${victim.id}> ${"a".repeat(1000)}`.slice(0, 300);
  await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: body, saunua: 10 } });
  assert.ok(getDb().prepare("SELECT body FROM reminders WHERE user_id = ?").get(member.id).body.length <= 300);
  await gw.advance(11 * MIN, { jobs: ["reminders"] });
  const dm = dmsTo(member)[0].payload;
  assert.deepEqual(dm.allowedMentions, { parse: [] });
  assert.ok(!dm.content.includes(`<@${victim.id}>`));
  assert.equal(dmsTo(victim).length, 0);
  await assert.rejects(() => gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: "x".repeat(301), saunua: 10 } }), /over 300/);
});

test("limits: 10 pending per person, and others are unaffected", async () => {
  const guild = gw.createGuild();
  const member = gw.addPerson(guild, "nhieu");
  for (let i = 1; i <= 10; i += 1) await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: `việc ${i}`, saunua: 1440 } });
  const eleventh = await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: "việc 11", saunua: 10 } });
  assert.match(eleventh.text, /10 lời nhắc/);
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND status = 'pending'").get(member.id).n, 10);
  const other = gw.addPerson(guild, "it");
  assert.match((await gw.slash("nhacviec", { guild, member: other, sub: "tao", options: { noidung: "ok", saunua: 10 } })).text, /Ghi sổ/);
  // freeing a slot lets the person add again
  const listed = getDb().prepare("SELECT id FROM reminders WHERE user_id = ? ORDER BY id").get(member.id);
  await gw.slash("nhacviec", { guild, member, sub: "xoa", options: { so: listed.id } });
  assert.match((await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: "việc 12", saunua: 10 } })).text, /Ghi sổ/);
});

test("autocomplete and delete only touch your own reminders", async () => {
  const guild = gw.createGuild();
  const a = gw.addPerson(guild, "a1");
  const b = gw.addPerson(guild, "b1");
  await gw.slash("nhacviec", { guild, member: a, sub: "tao", options: { noidung: "của a", saunua: 60 } });
  const id = getDb().prepare("SELECT id FROM reminders WHERE user_id = ?").get(a.id).id;
  const seenByB = await gw.autocomplete("nhacviec", { guild, member: b, sub: "xoa", focused: { name: "so", value: "" } });
  assert.deepEqual(seenByB.choices, []);
  const seenByA = await gw.autocomplete("nhacviec", { guild, member: a, sub: "xoa", focused: { name: "so", value: "" } });
  assert.equal(seenByA.choices.length, 1);
  const stolen = await gw.slash("nhacviec", { guild, member: b, sub: "xoa", options: { so: id } });
  assert.match(stolen.text, /Không thấy/);
  assert.equal(getDb().prepare("SELECT status FROM reminders WHERE id = ?").get(id).status, "pending");
  const own = await gw.slash("nhacviec", { guild, member: a, sub: "xoa", options: { so: id } });
  assert.match(own.text, /Đã xoá/);
  await gw.advance(2 * HOUR, { jobs: ["reminders"] });
  assert.equal(dmsTo(a).length, 0, "a deleted reminder is never sent");
});

test("restart safety: what came due while the bot was down is sent once on the first run", async () => {
  const guild = gw.createGuild();
  const member = gw.addPerson(guild, "ngu");
  for (const text of ["một", "hai", "ba"]) await gw.slash("nhacviec", { guild, member, sub: "tao", options: { noidung: text, saunua: 30 } });
  // the bot is "down" for three days: no job runs while the clock moves
  await gw.advance(3 * 24 * HOUR);
  assert.equal(dmsTo(member).length, 0);
  await gw.runJob("reminders");
  const sent = dmsTo(member);
  assert.equal(sent.length, 3);
  assert.ok(sent.every((r) => /trễ/.test(textOf(r.payload))));
  await gw.runJob("reminders");
  assert.equal(dmsTo(member).length, 3);
  assert.equal(gw.jobs.get("reminders").job.everyMs, 30_000);
});

test("the job never delivers more than 100 per run", async () => {
  const guild = gw.createGuild();
  const people = Array.from({ length: 120 }, (_, i) => gw.addPerson(guild, `bulk${i}`));
  for (const p of people) await gw.slash("nhacviec", { guild, member: p, sub: "tao", options: { noidung: "hàng loạt", saunua: 10 } });
  await gw.advance(11 * MIN);
  const before = gw.find("dm").length;
  await gw.runJob("reminders");
  assert.equal(gw.find("dm").length - before, 100);
  await gw.runJob("reminders");
  assert.equal(gw.find("dm").length - before, 120);
});
