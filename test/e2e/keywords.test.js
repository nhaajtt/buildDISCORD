import { test, after } from "node:test";
import assert from "node:assert/strict";
import { AutoModerationActionType as Action, AutoModerationRuleTriggerType as Trigger } from "discord.js";
import { createGateway, customIdsOf, textOf } from "./gateway.js";

const gw = await createGateway({ env: { UNLOCKED_GUILD_IDS: null, OWNER_IDS: null } });
after(() => gw.close());

const { getSection, patchSection } = await import("../../src/settings.js");
const { grant } = await import("../../src/license.js");

const RULE_NAME = "Thầu: Từ khoá tự chế";
const pro = (guild, days = 30) => grant(guild.id, "pro", days, gw.clock.now());
const customRule = (guild) => [...guild.automodRules.values()].find((r) => r.name === RULE_NAME);
const words = (guild) => customRule(guild)?.triggerMetadata?.keywordFilter ?? [];
const ruleEvents = (guild, mark) => gw.since(mark).filter((r) => r.guildId === guild.id && r.kind.startsWith("automod")).map((r) => r.kind);

const setup = (opts) => {
  const guild = gw.createGuild(opts);
  const admin = gw.addAdmin(guild);
  return { guild, admin };
};
const them = (guild, admin, tu) => gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "them", options: { tu } });
const xoa = (guild, admin, tu) => gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "xoa", options: { tu } });

test("adding words builds one dedicated native keyword rule, even though AutoMod itself was never switched on", async () => {
  const { guild, admin } = setup();
  const mark = gw.mark();
  const done = await them(guild, admin, "Xấu, NGU , ngu");
  assert.match(done.text, /Đã thêm 2 từ khoá/);
  assert.deepEqual(getSection(guild.id, "automod").customWords, ["xấu", "ngu"]);

  const rule = customRule(guild);
  assert.ok(rule, "the rule exists on the server");
  assert.equal(rule.triggerType, Trigger.Keyword);
  assert.deepEqual([...rule.triggerMetadata.keywordFilter].sort(), ["ngu", "xấu"]);
  assert.equal(rule.enabled, true);
  assert.deepEqual(rule.actions.map((a) => a.type), [Action.BlockMessage]);
  assert.equal(guild.automodRules.size, 1, "no standard rule appeared");
  assert.equal(getSection(guild.id, "automod").ruleIds.custom, rule.id, "its id is recorded under its own key");
  assert.equal(getSection(guild.id, "automod").enabled, false, "the standard AutoMod stays off");
  assert.deepEqual(ruleEvents(guild, mark), ["automodCreate"]);
  assert.equal(gw.contentReads, 0);
});

test("the rule alerts the AutoMod log channel when one is set, and is exempt for the same roles as the others (Pro)", async () => {
  const { guild, admin } = setup();
  pro(guild);
  const log = guild.addChannel({ name: "automod-log" });
  const vip = guild.addRole({ name: "VIP", position: 5 });
  await gw.slash("automod", { guild, member: admin, sub: "bat", options: { muc: "vua", kenhlog: log } });
  await gw.slash("automod", { guild, member: admin, sub: "mientru", options: { hanhdong: "them", role: vip } });
  await them(guild, admin, "bậy");
  const rule = customRule(guild);
  assert.deepEqual(rule.actions.map((a) => a.type), [Action.BlockMessage, Action.SendAlertMessage]);
  assert.equal(rule.actions[1].metadata.channel, log.id);
  assert.deepEqual(rule.exemptRoles, [vip.id]);
  assert.ok(guild.automodRules.size >= 5, "standard rules and the custom one live side by side");
});

test("adding the same words again changes nothing on Discord", async () => {
  const { guild, admin } = setup();
  await them(guild, admin, "aa1, bb2");
  const mark = gw.mark();
  const again = await them(guild, admin, "BB2, aa1");
  assert.match(again.text, /có trong danh sách hết rồi/);
  assert.deepEqual(ruleEvents(guild, mark), []);
  assert.equal(guild.automodRules.size, 1);
});

test("a new word edits the same rule instead of creating another", async () => {
  const { guild, admin } = setup();
  await them(guild, admin, "aa1");
  const id = customRule(guild).id;
  const mark = gw.mark();
  const done = await them(guild, admin, "bb2, aa1");
  assert.match(done.text, /1 từ đã có sẵn/);
  assert.deepEqual(ruleEvents(guild, mark), ["automodEdit"]);
  assert.equal(customRule(guild).id, id);
  assert.deepEqual([...words(guild)].sort(), ["aa1", "bb2"]);
});

test("two changes at the same moment still leave exactly one rule", async () => {
  const { guild, admin } = setup();
  await Promise.all([them(guild, admin, "aa1"), them(guild, admin, "bb2")]);
  const rules = [...guild.automodRules.values()].filter((r) => r.name === RULE_NAME);
  assert.equal(rules.length, 1);
  assert.deepEqual([...words(guild)].sort(), ["aa1", "bb2"]);
});

test("hostile input is refused: links, mentions, control characters, too long, wildcards only", async () => {
  const { guild, admin } = setup();
  const nothing = await them(guild, admin, "https://evil.example, <@123456789012345678>, @everyone, ***, a");
  assert.match(nothing.text, /Không có từ nào dùng được/);
  assert.equal(customRule(guild), undefined);
  assert.deepEqual(getSection(guild.id, "automod").customWords, []);

  const mixed = await them(guild, admin, `tốt\u0000xấu, ${"z".repeat(61)}, http://x.vn, *bậy*`);
  assert.match(mixed.text, /Đã thêm 2 từ khoá/);
  assert.match(mixed.text, /Bỏ qua/);
  assert.deepEqual([...words(guild)].sort(), ["*bậy*", "tốtxấu"]);
  assert.deepEqual(mixed.last.allowedMentions, { parse: [] });
  await assert.rejects(() => them(guild, admin, "q".repeat(1001)), /over 1000/);
});

test("free plan stops at 20 words with the upgrade message, Pro allows 200, and a partial add says what did not fit", async () => {
  const { guild, admin } = setup();
  patchSection(guild.id, "automod", { customWords: Array.from({ length: 18 }, (_, i) => `tu${String(i).padStart(2, "0")}`) });
  const partial = await them(guild, admin, "mot1, hai2, ba3, bon4, nam5");
  assert.match(partial.text, /Đã thêm 2 từ khoá/);
  assert.match(partial.text, /3 từ không vừa nữa/);
  assert.equal(getSection(guild.id, "automod").customWords.length, 20);
  assert.equal(words(guild).length, 20);

  const mark = gw.mark();
  const full = await them(guild, admin, "them-nua");
  assert.match(full.text, /20 từ khoá chặn/);
  assert.match(full.text, /\/goi/);
  assert.deepEqual(ruleEvents(guild, mark), []);
  assert.equal(getSection(guild.id, "automod").customWords.length, 20);

  pro(guild);
  const ok = await them(guild, admin, "them-nua");
  assert.match(ok.text, /Đã thêm 1 từ khoá/);
  assert.equal(words(guild).length, 21);
});

test("a lapsed plan keeps only what the free plan allows in the rule, and the list is not thrown away", async () => {
  const { guild, admin } = setup();
  pro(guild, 1);
  patchSection(guild.id, "automod", { customWords: Array.from({ length: 30 }, (_, i) => `tu${String(i).padStart(2, "0")}`) });
  await them(guild, admin, "moi-them");
  assert.equal(words(guild).length, 31);
  await gw.advance(3 * 86_400_000);
  const removed = await xoa(guild, admin, "tu00");
  assert.match(removed.text, /Đã gỡ 1 từ khoá/);
  assert.equal(words(guild).length, 20, "the rule follows the plan");
  assert.equal(getSection(guild.id, "automod").customWords.length, 30, "the saved list is kept");
});

test("xoa removes a word, autocompletes from the stored list for admins only, and deleting the last word deletes the rule", async () => {
  const { guild, admin } = setup();
  const stranger = gw.addPerson(guild, "khach");
  await them(guild, admin, "alpha1, alpine2, beta3");
  const typed = await gw.autocomplete("automod", { guild, member: admin, group: "tukhoa", sub: "xoa", focused: { name: "tu", value: "alp" } });
  const choices = gw.find("respond").at(-1).choices;
  assert.deepEqual(choices.map((c) => c.value).sort(), ["alpha1", "alpine2"]);
  assert.ok(typed);
  await gw.autocomplete("automod", { guild, member: stranger, group: "tukhoa", sub: "xoa", focused: { name: "tu", value: "" } });
  assert.deepEqual(gw.find("respond").at(-1).choices, [], "a non admin sees no words");

  const miss = await xoa(guild, admin, "khong-co");
  assert.match(miss.text, /Không có từ nào/);
  await xoa(guild, admin, "alpha1, beta3");
  assert.deepEqual(words(guild), ["alpine2"]);
  const mark = gw.mark();
  const last = await xoa(guild, admin, "ALPINE2");
  assert.match(last.text, /gỡ luật từ khoá/);
  assert.equal(customRule(guild), undefined);
  assert.equal(getSection(guild.id, "automod").ruleIds.custom, undefined);
  assert.deepEqual(ruleEvents(guild, mark), ["automodDelete"]);
});

test("danhsach is private, paged, and its buttons belong to the admin who asked", async () => {
  const { guild, admin } = setup();
  const other = gw.addAdmin(guild, "admin2");
  const empty = await gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "danhsach" });
  assert.match(empty.text, /đang trống/);

  patchSection(guild.id, "automod", { customWords: Array.from({ length: 95 }, (_, i) => `tu${String(i).padStart(3, "0")}`) });
  const listing = await gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "danhsach" });
  assert.equal(listing.ephemeral, true);
  assert.match(textOf(listing.finalPayload), /\(95\), trang 1\/3/);
  assert.deepEqual(customIdsOf(listing.finalPayload), [`automod:words:-1:${admin.id}`, `automod:words:1:${admin.id}`]);

  const refused = await gw.click(`automod:words:1:${admin.id}`, { member: other });
  assert.match(refused.text, /của người khác/);
  const next = await gw.click(`automod:words:1:${admin.id}`, { member: admin });
  assert.match(textOf(next.finalPayload), /trang 2\/3/);
  assert.match(textOf(next.finalPayload), /tu040/);
  const last = await gw.click(`automod:words:2:${admin.id}`, { member: admin });
  assert.match(textOf(last.finalPayload), /trang 3\/3/);
  assert.match(textOf(last.finalPayload), /tu094/);
});

test("a button used by someone who lost Administrator is refused", async () => {
  const { guild, admin } = setup();
  patchSection(guild.id, "automod", { customWords: ["aaa", "bbb"] });
  const ask = await gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "xoahet" });
  const role = guild.roleNamed("Quản trị");
  admin.roles.cache.delete(role.id);
  const refused = await gw.click(`automod:wipe:${admin.id}`, { member: admin, channel: ask.channel, message: ask.surface });
  assert.ok(refused.text.length > 0);
  assert.deepEqual(getSection(guild.id, "automod").customWords, ["aaa", "bbb"]);
});

test("xoahet asks first, no keeps everything, yes clears the list and removes the rule, a second press is harmless", async () => {
  const { guild, admin } = setup();
  const other = gw.addAdmin(guild, "admin2");
  await them(guild, admin, "aaa, bbb");
  const standard = guild.automodRules.size;
  assert.equal(standard, 1);

  const ask = await gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "xoahet" });
  assert.deepEqual(customIdsOf(ask.finalPayload), [`automod:wipe:${admin.id}`, `automod:wipeno:${admin.id}`]);
  const stolen = await gw.click(`automod:wipe:${admin.id}`, { member: other, channel: ask.channel, message: ask.surface });
  assert.match(stolen.text, /của người khác/);
  assert.equal(getSection(guild.id, "automod").customWords.length, 2);
  const no = await gw.click(`automod:wipeno:${admin.id}`, { member: admin, channel: ask.channel, message: ask.surface });
  assert.match(no.text, /Giữ nguyên/);
  assert.equal(getSection(guild.id, "automod").customWords.length, 2);

  const again = await gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "xoahet" });
  const yes = await gw.click(`automod:wipe:${admin.id}`, { member: admin, channel: again.channel, message: again.surface });
  assert.match(yes.text, /Đã xoá 2 từ khoá/);
  assert.deepEqual(getSection(guild.id, "automod").customWords, []);
  assert.equal(customRule(guild), undefined);
  assert.equal(getSection(guild.id, "automod").ruleIds.custom, undefined);
});

test("rules an admin made themselves are never touched by any of it", async () => {
  const { guild, admin } = setup();
  pro(guild);
  const theirs = await guild.autoModerationRules.create({
    name: "Luật của admin",
    eventType: 1,
    triggerType: Trigger.Keyword,
    triggerMetadata: { keywordFilter: ["cua-admin"] },
    actions: [{ type: Action.BlockMessage, metadata: {} }],
    enabled: true,
    exemptRoles: [],
  });
  const snapshot = JSON.stringify(guild.automodRules.get(theirs.id));
  await gw.slash("automod", { guild, member: admin, sub: "bat", options: { muc: "vua" } });
  await them(guild, admin, "aa1, bb2");
  await xoa(guild, admin, "aa1");
  await gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "xoahet" }).then((ask) => gw.click(`automod:wipe:${admin.id}`, { member: admin, channel: ask.channel, message: ask.surface }));
  await gw.slash("automod", { guild, member: admin, sub: "tat" });
  assert.equal(JSON.stringify(guild.automodRules.get(theirs.id)), snapshot, "unchanged");
  assert.equal(guild.automodRules.size, 1, "only the admin's own rule is left");
  assert.equal(gw.find("automodDelete", (r) => r.ruleId === theirs.id).length, 0);
});

test("/automod tat removes the custom rule too and keeps the list; bat brings it back", async () => {
  const { guild, admin } = setup();
  await gw.slash("automod", { guild, member: admin, sub: "bat", options: { muc: "nhe" } });
  await them(guild, admin, "aa1, bb2");
  assert.ok(customRule(guild));
  assert.ok(guild.automodRules.size >= 3);
  const off = await gw.slash("automod", { guild, member: admin, sub: "tat" });
  assert.equal(guild.automodRules.size, 0);
  assert.match(off.text, /danh sách từ khoá tự chế vẫn được giữ/i);
  assert.equal(getSection(guild.id, "automod").customWords.length, 2);
  assert.deepEqual(getSection(guild.id, "automod").ruleIds, {});
  const on = await gw.slash("automod", { guild, member: admin, sub: "bat", options: { muc: "nhe" } });
  assert.ok(on.text.length > 0);
  assert.ok(customRule(guild), "the custom rule is back");
  assert.equal(guild.automodRules.size, 3);
});

test("/automod trangthai shows how many words there are and whether the rule exists, also with the standard AutoMod off", async () => {
  const { guild, admin } = setup();
  const never = await gw.slash("automod", { guild, member: admin, sub: "trangthai" });
  assert.match(never.text, /đang tắt/);
  await them(guild, admin, "aa1, bb2, cc3");
  const status = await gw.slash("automod", { guild, member: admin, sub: "trangthai" });
  const text = textOf(status.finalPayload);
  assert.match(text, /Từ khoá tự chế: 3 từ, luật trên Discord: có/);
  assert.match(text, /AutoMod chuẩn đang tắt/);
  assert.match(text, /Từ khoá tự chế\*\*: .*đang chạy/);

  guild.automodRules.delete(getSection(guild.id, "automod").ruleIds.custom);
  const drift = await gw.slash("automod", { guild, member: admin, sub: "trangthai" });
  assert.match(textOf(drift.finalPayload), /luật trên Discord: chưa có/);
  assert.match(textOf(drift.finalPayload), /xoá mất/);
});

test("a rule deleted by hand is recreated by the next change, never duplicated", async () => {
  const { guild, admin } = setup();
  await them(guild, admin, "aa1");
  guild.automodRules.delete(getSection(guild.id, "automod").ruleIds.custom);
  const done = await them(guild, admin, "bb2");
  assert.match(done.text, /Đã thêm 1 từ khoá/);
  assert.equal([...guild.automodRules.values()].filter((r) => r.name === RULE_NAME).length, 1);
  assert.deepEqual([...words(guild)].sort(), ["aa1", "bb2"]);
});

test("without Manage Server the words are saved and the reply says why they do not block yet", async () => {
  const { guild, admin } = setup({ botPermissions: ["ViewChannel", "SendMessages"] });
  const done = await them(guild, admin, "aa1");
  assert.match(done.text, /Quản lý server/);
  assert.match(done.text, /chưa chặn được/);
  assert.deepEqual(getSection(guild.id, "automod").customWords, ["aa1"]);
  assert.equal(guild.automodRules.size, 0);
  assert.equal(gw.find("automodCreate", (r) => r.guildId === guild.id).length, 0);
});

test("a member without Administrator is refused on every words command", async () => {
  const { guild } = setup();
  const stranger = gw.addPerson(guild, "khach");
  patchSection(guild.id, "automod", { customWords: ["aa1"] });
  for (const [sub, options] of [["them", { tu: "bb2" }], ["xoa", { tu: "aa1" }], ["danhsach", {}], ["xoahet", {}]]) {
    const refused = await gw.slash("automod", { guild, member: stranger, group: "tukhoa", sub, options, hidden: true });
    assert.ok(refused.text.length > 0);
    assert.equal(refused.ephemeral, true);
  }
  assert.deepEqual(getSection(guild.id, "automod").customWords, ["aa1"]);
  assert.equal(guild.automodRules.size, 0);
});

test("/xoadulieu deletes the custom rule and the saved list", async () => {
  const { guild, admin } = setup();
  await gw.slash("automod", { guild, member: admin, sub: "bat", options: { muc: "nhe" } });
  await them(guild, admin, "aa1, bb2");
  const theirs = await guild.autoModerationRules.create({ name: "Luật của admin", eventType: 1, triggerType: Trigger.Keyword, triggerMetadata: { keywordFilter: ["x1"] }, actions: [], enabled: true, exemptRoles: [] });
  assert.ok(customRule(guild));
  const ask = await gw.slash("xoadulieu", { guild, member: admin });
  const done = await gw.click(`xoadulieu:go:${admin.id}`, { member: admin, channel: ask.channel, message: ask.surface });
  assert.match(done.text, /Đã quên sạch/);
  assert.equal(customRule(guild), undefined);
  assert.deepEqual([...guild.automodRules.keys()], [theirs.id], "only the admin's rule remains");
  assert.deepEqual(getSection(guild.id, "automod").customWords, []);
  assert.deepEqual(getSection(guild.id, "automod").ruleIds, {});
});

test("restart safety: the list and rule id are stored, so a later change finds and edits the same rule", async () => {
  const { guild, admin } = setup();
  await them(guild, admin, "aa1");
  const id = customRule(guild).id;
  // nothing is held in memory between commands: the id and words come from the saved settings
  assert.equal(getSection(guild.id, "automod").ruleIds.custom, id);
  const mark = gw.mark();
  await them(guild, admin, "bb2");
  assert.deepEqual(ruleEvents(guild, mark), ["automodEdit"]);
  assert.equal(customRule(guild).id, id);
});
