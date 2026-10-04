import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Events, MessageType } from "discord.js";
import { createGateway, textOf } from "./gateway.js";

const gw = await createGateway({ env: { UNLOCKED_GUILD_IDS: null, OWNER_IDS: null } });
after(() => gw.close());

const { getSection, patchSection } = await import("../../src/settings.js");
const { youngQueue } = await import("../../src/security/age.js");
const { listCases, countCases } = await import("../../src/modlog/cases.js");

const DAY = 86_400_000;
const youngAt = (days = 2) => gw.clock.now() - days * DAY;

// Counts every member fetch the bot makes in a server
function watchFetches(guild) {
  const calls = [];
  const real = guild.members.fetch;
  guild.members.fetch = async (id) => {
    calls.push(id);
    return real(id);
  };
  return calls;
}

async function joined(guild, options) {
  const result = await gw.join(guild, options);
  await youngQueue.idle();
  await gw.settle();
  return result;
}

const setup = async ({ days = 7, action = "alert", botPermissions } = {}) => {
  const guild = gw.createGuild({ botPermissions });
  const admin = gw.addAdmin(guild);
  patchSection(guild.id, "security", { minAccountAgeDays: days, youngAction: action });
  return { guild, admin, channel: guild.systemChannel };
};

test("the admin sets the filter with /khoakhan caidat and sees it in trangthai", async () => {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  const done = await gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { tuoitaikhoan: 14, hanhdongmoi: "kick" } });
  assert.match(done.last.content, /Đã lưu/);
  const s = getSection(guild.id, "security");
  assert.equal(s.minAccountAgeDays, 14);
  assert.equal(s.youngAction, "kick");
  const status = await gw.slash("khoakhan", { guild, member: admin, sub: "trangthai" });
  assert.match(textOf(status.last), /dưới 14 ngày sẽ bị đuổi/);

  await gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { tuoitaikhoan: 0 } });
  assert.equal(getSection(guild.id, "security").minAccountAgeDays, 0);
  assert.equal(getSection(guild.id, "security").youngAction, "kick", "a field not given is left alone");
  const off = await gw.slash("khoakhan", { guild, member: admin, sub: "trangthai" });
  assert.match(textOf(off.last), /Lọc tài khoản mới: tắt/);
});

test("a member without Administrator cannot change it, and out of range days are refused", async () => {
  const guild = gw.createGuild();
  const stranger = gw.addPerson(guild, "khach");
  const refused = await gw.slash("khoakhan", { guild, member: stranger, sub: "caidat", options: { tuoitaikhoan: 30 }, hidden: true });
  assert.ok(refused.last.content.length > 0);
  assert.equal(getSection(guild.id, "security").minAccountAgeDays, 0);
  const admin = gw.addAdmin(guild);
  await assert.rejects(() => gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { tuoitaikhoan: 366 } }), /over 365/);
  await assert.rejects(() => gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { hanhdongmoi: "ban" } }), /choices/);
  patchSection(guild.id, "security", { minAccountAgeDays: 99999 });
  assert.equal(getSection(guild.id, "security").minAccountAgeDays, 365, "stored values are clamped too");
});

test("alert only: a young account is announced with its age, and nothing else changes", async () => {
  const { guild, channel } = await setup({ action: "alert" });
  const fetches = watchFetches(guild);
  const mark = gw.mark();
  const { member } = await joined(guild, { name: "moi", createdAt: youngAt(2) });
  const alerts = gw.sentTo(channel);
  assert.equal(alerts.length, 1);
  const text = textOf(alerts[0].payload);
  assert.match(text, /2 ngày/);
  assert.match(text, /7 ngày/);
  assert.ok(text.includes(`<@${member.id}>`));
  assert.deepEqual(alerts[0].payload.allowedMentions, { parse: [] });
  assert.equal(gw.since(mark).filter((r) => ["kick", "ban", "timeout", "roleAdd", "roleRemove"].includes(r.kind)).length, 0);
  assert.ok(guild.members.cache.has(member.id), "the member is still there");
  assert.deepEqual(fetches, [member.id], "exactly one REST fetch, for that member");
  assert.equal(gw.contentReads, 0);
});

test("an account at or over the minimum age is left alone", async () => {
  const { guild, channel } = await setup({ days: 7 });
  await joined(guild, { name: "vua-du", createdAt: gw.clock.now() - 7 * DAY });
  await joined(guild, { name: "lau-nam", createdAt: gw.clock.now() - 400 * DAY });
  assert.equal(gw.sentTo(channel).length, 0);
});

test("the filter off (0 days) does nothing and fetches nobody", async () => {
  const { guild, channel } = await setup({ days: 0 });
  const fetches = watchFetches(guild);
  await joined(guild, { name: "moi", createdAt: youngAt(0) });
  assert.equal(gw.sentTo(channel).length, 0);
  assert.equal(fetches.length, 0);
});

test("kick mode: the young account is kicked with a reason, the alert says so, and the modlog gets a case when it is on", async () => {
  const { guild, channel } = await setup({ action: "kick" });
  const first = await joined(guild, { name: "moi1", createdAt: youngAt(1) });
  const kicks = gw.find("kick", (r) => r.guildId === guild.id);
  assert.equal(kicks.length, 1);
  assert.equal(kicks[0].userId, first.member.id);
  assert.match(kicks[0].reason, /tài khoản quá mới/);
  assert.ok(!guild.members.cache.has(first.member.id));
  assert.match(textOf(gw.sentTo(channel)[0].payload), /mời ra khỏi công trường/);
  assert.equal(countCases(guild.id, first.member.id), 0, "modlog is off, so no case is written");

  const log = guild.addChannel({ name: "nhat-ky" });
  patchSection(guild.id, "modlog", { enabled: true, channelId: log.id });
  const second = await joined(guild, { name: "moi2", createdAt: youngAt(3) });
  const cases = listCases(guild.id, second.member.id);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].action, "kick");
  assert.equal(cases[0].reason, "tài khoản quá mới");
  assert.equal(cases[0].mod_id, gw.botId);
  assert.equal(gw.sentTo(log).length, 1, "the case was posted to the log");
});

test("kick refusals: the owner, a bot, someone above the bot and a welcome role holder are never kicked", async () => {
  const { guild, channel } = await setup({ action: "kick" });
  const welcomeRole = guild.addRole({ name: "Khach moi", position: 5 });
  patchSection(guild.id, "welcome", { enabled: false, newbieRoleId: welcomeRole.id });
  const mark = gw.mark();

  // the owner appears as a fresh account
  guild.owner.createdTimestamp = youngAt(0);
  const ownerMember = guild.members.cache.get(guild.ownerId);
  await gw.emit(Events.MessageCreate, gw.message(guild, channel, ownerMember, { type: MessageType.UserJoin }));
  await youngQueue.idle();

  // a bot the admin added
  await joined(guild, { name: "bot-xin", bot: true, createdAt: youngAt(0) });

  // a role holder from the welcome flow
  await joined(guild, { name: "co-role", roles: [welcomeRole], createdAt: youngAt(0) });
  assert.equal(gw.since(mark).filter((r) => r.kind === "kick").length, 0);
  assert.equal(gw.sentTo(channel).length, 0, "these cases are skipped quietly, no alert");

  // someone with a role above the bot: alerted, not kicked
  const high = guild.addRole({ name: "Cao hon bot", position: 2000 });
  const { member } = await joined(guild, { name: "role-cao", roles: [high], createdAt: youngAt(1) });
  assert.equal(gw.since(mark).filter((r) => r.kind === "kick").length, 0);
  assert.ok(guild.members.cache.has(member.id));
  const alerts = gw.sentTo(channel);
  assert.equal(alerts.length, 1);
  assert.match(textOf(alerts[0].payload), /ngang hoặc trên role của thầu/);
});

test("kick mode without the Kick Members permission: alert only, and it says which permission is missing", async () => {
  const { guild, channel } = await setup({ action: "kick", botPermissions: ["ViewChannel", "SendMessages", "EmbedLinks"] });
  const mark = gw.mark();
  const { member } = await joined(guild, { name: "moi", createdAt: youngAt(1) });
  assert.equal(gw.since(mark).filter((r) => r.kind === "kick").length, 0);
  assert.ok(guild.members.cache.has(member.id));
  const text = textOf(gw.sentTo(channel)[0].payload);
  assert.match(text, /Đuổi thành viên/);
  const admin = gw.addAdmin(guild);
  const saved = await gw.slash("khoakhan", { guild, member: admin, sub: "caidat", options: { hanhdongmoi: "kick" } });
  assert.match(saved.last.content, /Đuổi thành viên/, "the admin is warned when saving too");
});

test("the same join notice delivered twice is handled once", async () => {
  const { guild, channel } = await setup({ action: "alert" });
  const fetches = watchFetches(guild);
  const { message, member } = await joined(guild, { name: "moi", createdAt: youngAt(1) });
  await gw.emit(Events.MessageCreate, message);
  await youngQueue.idle();
  await gw.settle();
  assert.equal(gw.sentTo(channel).length, 1);
  assert.deepEqual(fetches, [member.id]);
});

test("a member who left before the check produces no alert and no error", async () => {
  const { guild, channel } = await setup({ action: "kick" });
  const message = (() => {
    const member = guild.addMember({ name: "di-roi", createdAt: youngAt(1) });
    const note = gw.message(guild, channel, member, { type: MessageType.UserJoin });
    guild.members.cache.delete(member.id);
    return note;
  })();
  await gw.emit(Events.MessageCreate, message);
  await youngQueue.idle();
  await gw.settle();
  assert.equal(gw.sentTo(channel).length, 0);
  assert.equal(gw.find("kick", (r) => r.guildId === guild.id).length, 0);
});

test("a burst of joins is fetched one at a time, once each, and every young one is announced", async () => {
  const { guild, channel } = await setup({ action: "alert" });
  const fetches = watchFetches(guild);
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    const { member } = await gw.join(guild, { name: `dot-${i}`, createdAt: youngAt(1) });
    ids.push(member.id);
  }
  await youngQueue.idle();
  await gw.settle();
  assert.deepEqual(fetches, ids, "one fetch per person, in order");
  assert.equal(gw.sentTo(channel).length, 3);
});

test("the settings survive a restart: a fresh read still holds the filter, and a restart leaves no half done work", async () => {
  const { guild } = await setup({ days: 30, action: "kick" });
  const again = getSection(guild.id, "security");
  assert.equal(again.minAccountAgeDays, 30);
  assert.equal(again.youngAction, "kick");
  assert.equal(youngQueue.size(guild.id), 0, "nothing waits in memory");
});

test("with no alert channel and no system channel a young account is still handled quietly", async () => {
  const guild = gw.createGuild({ systemChannel: false });
  gw.addAdmin(guild);
  patchSection(guild.id, "security", { minAccountAgeDays: 7, youngAction: "alert" });
  const mark = gw.mark();
  await gw.join(guild, { name: "moi", createdAt: youngAt(1), channel: guild.textChannels()[0] });
  await youngQueue.idle();
  await gw.settle();
  assert.equal(gw.since(mark).filter((r) => r.kind === "send").length, 0);
});
