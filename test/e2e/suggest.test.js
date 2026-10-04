import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createGateway, customIdsOf, textOf } from "./gateway.js";

const gw = await createGateway({ env: { UNLOCKED_GUILD_IDS: null, OWNER_IDS: null } });
after(() => gw.close());

const { getSection } = await import("../../src/settings.js");
const { getDb } = await import("../../src/db.js");

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

// A free server with the box set up in a channel of its own
async function setup({ staffRole = false } = {}) {
  const guild = gw.createGuild();
  const boss = gw.addMod(guild, "boss");
  const channel = guild.addChannel({ name: "gop-y" });
  const role = staffRole ? guild.addRole({ name: "Staff", permissions: 0n, position: 300 }) : null;
  const set = await gw.slash("gopy", { guild, member: boss, channel: guild.textChannels()[0], sub: "caidat", options: { kenh: channel, bat: true, ...(role ? { role } : {}) } });
  assert.match(set.text, /đang bật/);
  return { guild, boss, channel, role };
}

const posted = (channel) => gw.sentTo(channel).at(-1);
const embedOf = (record) => record.payload.embeds[0];
const footerOf = (message) => (message.payload.embeds[0].footer?.text ?? "");

test("send, vote with live counts, change a vote, and nobody is pinged", async () => {
  const { guild, channel } = await setup();
  const author = gw.addPerson(guild, "tac-gia");
  const fan = gw.addPerson(guild, "fan");
  const critic = gw.addPerson(guild, "che");

  const sent = await gw.slash("gopy", { guild, member: author, sub: "gui", options: { noidung: "Thêm kênh meme @everyone <@123456789012345678>" } });
  assert.match(sent.text, /đã lên bảng/);
  assert.equal(sent.replies[0].ephemeral, true);
  const post = posted(channel);
  assert.deepEqual(post.payload.allowedMentions, { parse: [] });
  assert.ok(!/@everyone|<@123/.test(embedOf(post).description));
  assert.ok(embedOf(post).fields.some((f) => f.value === `<@${author.id}>`), "the author is shown as a mention inside the embed");
  const ids = customIdsOf(post.payload);
  assert.equal(ids.length, 5);
  const [up, down] = ids;
  assert.match(up, /^gopy:up:\d+$/);

  const message = gw.messages.find((m) => m.id === post.messageId);
  await gw.click(up, { member: fan, channel, message });
  await gw.click(up, { member: critic, channel, message });
  assert.match(footerOf(message), /👍 2\s+·\s+👎 0/);
  await gw.click(down, { member: critic, channel, message });
  assert.match(footerOf(message), /👍 1\s+·\s+👎 1/, "a changed vote moves, it does not add");
  await gw.click(down, { member: critic, channel, message });
  assert.match(footerOf(message), /👍 1\s+·\s+👎 0/, "the same button again withdraws");
  assert.equal(getDb().prepare("SELECT COUNT(*) AS n FROM suggestion_votes").get().n >= 1, true);
});

test("setup refusals: nothing for a member, disabled boxes refuse, missing permissions are named", async () => {
  const guild = gw.createGuild();
  const person = gw.addPerson(guild, "thuong");
  const early = await gw.slash("gopy", { guild, member: person, sub: "gui", options: { noidung: "x" } });
  assert.match(early.text, /chưa được mở/);

  const denied = await gw.slash("gopy", { guild, member: person, sub: "caidat", options: { bat: true } });
  assert.ok(denied.text.length > 0);
  assert.equal(getSection(guild.id, "suggest").enabled, false);
  assert.match((await gw.slash("gopy", { guild, member: person, sub: "danhsach" })).text, /\S/);
  assert.equal(gw.find("send", (r) => r.guildId === guild.id).length, 0);

  const boss = gw.addMod(guild, "quan");
  const noChannel = await gw.slash("gopy", { guild, member: boss, sub: "caidat", options: { bat: true } });
  assert.match(noChannel.text, /đặt kênh/);

  // a bot that may look at the channel but not write in it
  const botNoAdmin = gw.createGuild({ botPermissions: ["ViewChannel"] });
  const mod2 = gw.addMod(botNoAdmin, "m2");
  const quiet = botNoAdmin.addChannel({ name: "im", overwrites: [{ id: botNoAdmin.id, deny: gw.P.SendMessages }] });
  const saved = await gw.slash("gopy", { guild: botNoAdmin, member: mod2, sub: "caidat", options: { kenh: quiet, bat: true } });
  assert.match(saved.text, /Gửi tin nhắn/);
  const tried = await gw.slash("gopy", { guild: botNoAdmin, member: gw.addPerson(botNoAdmin, "u"), sub: "gui", options: { noidung: "x" } });
  assert.match(tried.text, /Gửi tin nhắn/);
  assert.equal(gw.sentTo(quiet).length, 0);
});

test("rate limits: one per minute and five per day, per person, surviving the clock", async () => {
  const { guild, channel } = await setup();
  const talker = gw.addPerson(guild, "noi-nhieu");
  const first = await gw.slash("gopy", { guild, member: talker, sub: "gui", options: { noidung: "một" } });
  assert.match(first.text, /đã lên bảng/);
  const quick = await gw.slash("gopy", { guild, member: talker, sub: "gui", options: { noidung: "hai" } });
  assert.match(quick.text, /chờ thêm/);
  assert.equal(gw.sentTo(channel).length, 1);

  for (const text of ["hai", "ba", "bốn", "năm"]) {
    await gw.advance(61_000);
    assert.match((await gw.slash("gopy", { guild, member: talker, sub: "gui", options: { noidung: text } })).text, /đã lên bảng/);
  }
  await gw.advance(61_000);
  assert.match((await gw.slash("gopy", { guild, member: talker, sub: "gui", options: { noidung: "sáu" } })).text, /5 lần/);
  assert.equal(gw.sentTo(channel).length, 5);
  assert.match((await gw.slash("gopy", { guild, member: gw.addPerson(guild, "khac"), sub: "gui", options: { noidung: "tôi" } })).text, /đã lên bảng/);

  await gw.advance(DAY);
  assert.match((await gw.slash("gopy", { guild, member: talker, sub: "gui", options: { noidung: "hôm sau" } })).text, /đã lên bảng/);
});

test("staff decide once: permission re-checked at the press and at the modal, note recorded, author told", async () => {
  const { guild, boss, channel } = await setup({ staffRole: true });
  const author = gw.addPerson(guild, "tac-gia-2");
  const closed = guild.addMember({ name: "dm-dong", dmOpen: false });
  const member = gw.addPerson(guild, "dan-thuong");
  const staff = gw.addPerson(guild, "nhan-vien", [guild.roleNamed("Staff")]);
  await gw.slash("gopy", { guild, member: author, sub: "gui", options: { noidung: "Mở kênh âm nhạc" } });
  const post = posted(channel);
  const message = gw.messages.find((m) => m.id === post.messageId);
  const [, , ok, no, done] = customIdsOf(post.payload);
  assert.match(ok, /^gopy:ok:\d+$/);

  // an ordinary member cannot open the decision
  const refused = await gw.click(ok, { member, channel, message });
  assert.match(refused.text, /quản lý hoặc role staff/);
  assert.equal(gw.modals.length, 0);
  assert.equal(getDb().prepare("SELECT status FROM suggestions WHERE message_id = ?").get(post.messageId).status, "open");

  // staff by role gets the modal, and loses the right before submitting: the submit is refused
  await gw.click(no, { member: staff, channel, message });
  const modalId = gw.modals.at(-1).json.custom_id;
  assert.match(modalId, /^gopy:m:no:\d+$/);
  const roleId = guild.roleNamed("Staff").id;
  staff.roles.cache.delete(roleId);
  const late = await gw.submitModal(modalId, { note: "x" }, { member: staff, channel });
  assert.match(late.text, /quản lý hoặc role staff/);
  assert.equal(getDb().prepare("SELECT status FROM suggestions WHERE message_id = ?").get(post.messageId).status, "open");
  staff.roles.cache.set(roleId, guild.roleNamed("Staff"));

  // approve with a note
  await gw.click(ok, { member: staff, channel, message });
  const okModal = gw.modals.at(-1).json.custom_id;
  const decided = await gw.submitModal(okModal, { note: "Sẽ làm tuần sau @everyone" }, { member: staff, channel });
  const row = getDb().prepare("SELECT * FROM suggestions WHERE message_id = ?").get(post.messageId);
  assert.deepEqual([row.status, row.decided_by], ["approved", staff.id]);
  assert.ok(row.note.includes("Sẽ làm tuần sau") && !row.note.includes("@everyone"));
  assert.equal(message.payload.components.length, 0, "no buttons once decided");
  assert.match(textOf(message.payload), /Đã duyệt/);
  assert.match(textOf(message.payload), new RegExp(staff.id));
  assert.match(decided.finalPayload ? textOf(decided.finalPayload) : "", /Đã duyệt/);
  const told = gw.find("dm", (r) => r.userId === author.id);
  assert.equal(told.length, 1);
  assert.match(textOf(told[0].payload), /đã duyệt/);
  assert.deepEqual(told[0].payload.allowedMentions, { parse: [] });

  // a second decision cannot be taken: the buttons are gone, and a forged modal submit changes nothing
  await assert.rejects(() => gw.click(no, { member: boss, channel, message }), /No button|has been posted|not/);
  await gw.click(`gopy:up:${row.id}`, { member: member, channel, message }).catch(() => {});
  await assert.rejects(() => gw.submitModal(`gopy:m:no:${row.id}`, { note: "late" }, { member: boss, channel }), /has not shown modal/);
  assert.equal(getDb().prepare("SELECT status FROM suggestions WHERE id = ?").get(row.id).status, "approved");
  assert.equal(gw.find("dm", (r) => r.userId === author.id).length, 1, "the author was told once");

  // closed DMs are ignored quietly
  await gw.advance(2 * MIN);
  await gw.slash("gopy", { guild, member: closed, sub: "gui", options: { noidung: "DM đóng" } });
  const post2 = posted(channel);
  const message2 = gw.messages.find((m) => m.id === post2.messageId);
  const [, , , reject] = customIdsOf(post2.payload);
  await gw.click(reject, { member: boss, channel, message: message2 });
  await gw.submitModal(gw.modals.at(-1).json.custom_id, { note: "" }, { member: boss, channel });
  const row2 = getDb().prepare("SELECT * FROM suggestions WHERE message_id = ?").get(post2.messageId);
  assert.deepEqual([row2.status, row2.decided_by, row2.note], ["rejected", boss.id, null]);
  assert.equal(gw.find("dm", (r) => r.userId === closed.id).length, 0);
  assert.match(textOf(message2.payload), /Đã từ chối/);
});

test("two staff racing: only the first decision counts", async () => {
  const { guild, boss, channel } = await setup();
  const author = gw.addPerson(guild, "tg3");
  const other = gw.addMod(guild, "boss2");
  await gw.slash("gopy", { guild, member: author, sub: "gui", options: { noidung: "Đua nhau duyệt" } });
  const post = posted(channel);
  const message = gw.messages.find((m) => m.id === post.messageId);
  const [, , ok, no] = customIdsOf(post.payload);
  await gw.click(ok, { member: boss, channel, message });
  const bossModal = gw.modals.at(-1).json.custom_id;
  await gw.click(no, { member: other, channel, message });
  const otherModal = gw.modals.at(-1).json.custom_id;
  await gw.submitModal(bossModal, { note: "duyệt" }, { member: boss, channel });
  const second = await gw.submitModal(otherModal, { note: "từ chối" }, { member: other, channel });
  assert.match(second.text, /trước bạn/);
  const row = getDb().prepare("SELECT * FROM suggestions WHERE message_id = ?").get(post.messageId);
  assert.deepEqual([row.status, row.decided_by, row.note], ["approved", boss.id, "duyệt"]);
});

test("admin list and remove: only the bot's own post is deleted, and the removed one still counts toward the limit", async () => {
  const { guild, boss, channel } = await setup();
  const author = gw.addPerson(guild, "tg4");
  await gw.slash("gopy", { guild, member: author, sub: "gui", options: { noidung: "Cái này sẽ bị gỡ" } });
  const post = posted(channel);
  const message = gw.messages.find((m) => m.id === post.messageId);
  const id = getDb().prepare("SELECT id FROM suggestions WHERE message_id = ?").get(post.messageId).id;

  const listed = await gw.slash("gopy", { guild, member: boss, sub: "danhsach" });
  assert.match(listed.text, /Cái này sẽ bị gỡ/);
  assert.equal(listed.replies[0].ephemeral, true);
  const choices = await gw.autocomplete("gopy", { guild, member: boss, sub: "xoa", focused: { name: "so", value: "" } });
  assert.equal(choices.choices.length, 1);
  const hidden = await gw.autocomplete("gopy", { guild, member: author, sub: "xoa", focused: { name: "so", value: "" } });
  assert.deepEqual(hidden.choices, []);

  const refused = await gw.slash("gopy", { guild, member: author, sub: "xoa", options: { so: id } });
  assert.match(refused.text, /\S/);
  assert.equal(getDb().prepare("SELECT status FROM suggestions WHERE id = ?").get(id).status, "open");

  const removed = await gw.slash("gopy", { guild, member: boss, sub: "xoa", options: { so: id } });
  assert.match(removed.text, /Đã gỡ/);
  assert.equal(message.deleted, true);
  assert.match((await gw.slash("gopy", { guild, member: boss, sub: "danhsach" })).text, /Không có góp ý/);
  // a press on the vanished suggestion is refused
  assert.match((await gw.slash("gopy", { guild, member: boss, sub: "xoa", options: { so: id } })).text, /Không thấy/);
  // removing does not reset the author's allowance
  const again = await gw.slash("gopy", { guild, member: author, sub: "gui", options: { noidung: "lại" } });
  assert.match(again.text, /chờ thêm/);
});

test("restart safety: votes and decisions live in the database, a press after a restart works on the same message", async () => {
  const { guild, channel } = await setup();
  const author = gw.addPerson(guild, "tg5");
  const voter = gw.addPerson(guild, "voter");
  await gw.slash("gopy", { guild, member: author, sub: "gui", options: { noidung: "Sau khởi động lại" } });
  const post = posted(channel);
  const message = gw.messages.find((m) => m.id === post.messageId);
  const [up] = customIdsOf(post.payload);
  await gw.click(up, { member: voter, channel, message });
  // "restart": the process forgets everything it held in memory, the database stays
  await gw.advance(3 * DAY);
  const [, down] = customIdsOf(message.payload);
  await gw.click(down, { member: voter, channel, message });
  assert.match(footerOf(message), /👍 0\s+·\s+👎 1/);
  // the same button pressed from another server is not honoured
  const other = gw.createGuild();
  const stranger = gw.addPerson(other, "ngoai");
  const foreign = await gw.click(up, { member: stranger, channel, message });
  assert.match(foreign.text, /không còn nữa/);
  assert.match(footerOf(message), /👍 0\s+·\s+👎 1/);
});
