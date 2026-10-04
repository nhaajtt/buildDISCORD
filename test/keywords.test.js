import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AutoModerationActionType as Action, AutoModerationRuleTriggerType as Trigger } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "keywords-test-"));

const { cleanWord, parseWords, addWords, removeWords, pageOf, pageCount, PAGE_SIZE } = await import("../src/automod/words.js");
const { buildRuleDefs, planSync, CUSTOM_KEY, PREFIX } = await import("../src/automod/rules.js");
const { getSection, patchSection } = await import("../src/settings.js");

const settingsOf = (over = {}) => ({ enabled: true, level: "vua", logChannelId: null, blockInvites: true, blockLinks: false, mentionLimit: 5, exemptRoleIds: [], customWords: [], ruleIds: {}, ...over });

// ---------- normalising what an admin typed ----------

test("words are split on commas and lines, lowercased, trimmed and de-duplicated", () => {
  const { words, refused } = parseWords("  Xấu , NGU,ngu\nĐồ Tồi,, ,Xấu ");
  assert.deepEqual(words, ["xấu", "ngu", "đồ tồi"]);
  assert.deepEqual(refused, []);
});

test("control and invisible characters are stripped", () => {
  assert.deepEqual(parseWords("ba\u0000d\u0007wo​rd").words, ["badword"]);
  assert.deepEqual(parseWords("a‮bc\u0000").words, ["abc"]);
  assert.deepEqual(parseWords("\u0000​").words, []);
  assert.equal(parseWords("tab\there\r\nnext").words.join("|"), "tab here|next");
});

test("links, mentions and emoji are refused, not stored", () => {
  const raw = "https://evil.example, http://x, www.site.vn, discord.gg/abc, ten.com, <@123456>, <@&777>, <#555>, @everyone, @here, <:pepe:123>, <a:dance:456>";
  const { words, refused } = parseWords(raw);
  assert.deepEqual(words, []);
  assert.equal(refused.length, 12);
  assert.ok(refused.every((r) => ["link", "mention"].includes(r.reason)));
});

test("a wildcard the admin typed is kept, but a word that is only wildcards or a single letter is refused", () => {
  assert.deepEqual(parseWords("*bậy*, bậy*, *bậy").words, ["*bậy*", "bậy*", "*bậy"]);
  const { words, refused } = parseWords("*, ***, a, *a*, 1");
  assert.deepEqual(words, []);
  assert.deepEqual(refused.map((r) => r.reason), ["short", "short", "short", "short", "short"]);
});

test("a word over 60 characters is refused, exactly 60 is fine", () => {
  assert.deepEqual(parseWords("x".repeat(60)).words, ["x".repeat(60)]);
  const { words, refused } = parseWords("y".repeat(61));
  assert.deepEqual(words, []);
  assert.equal(refused[0].reason, "long");
  assert.ok(refused[0].word.length <= 30, "an echoed word is clipped too");
});

test("nothing else is escaped: quotes, backticks and regex characters stay as typed", () => {
  assert.deepEqual(parseWords("a.b?c, (x)(y), 'q'q, `**b**`").words, ["a.b?c", "(x)(y)", "'q'q", "`**b**`"]);
});

test("cleanWord handles empty and non-string input", () => {
  assert.deepEqual(cleanWord("   "), { skip: true });
  assert.deepEqual(cleanWord(undefined), { skip: true });
  assert.deepEqual(cleanWord(12345), { word: "12345" });
  assert.deepEqual(parseWords(null), { words: [], refused: [] });
});

test("a huge paste is bounded", () => {
  const { words } = parseWords(Array.from({ length: 5000 }, (_, i) => `tu${i}`).join(","));
  assert.ok(words.length > 0 && words.length < 2000);
});

// ---------- the list and its limits ----------

test("addWords stops at the plan limit and says what did not fit", () => {
  const r = addWords(["aa", "bb"], ["bb", "cc", "dd", "ee"], 4);
  assert.deepEqual(r.list, ["aa", "bb", "cc", "dd"]);
  assert.deepEqual(r.added, ["cc", "dd"]);
  assert.deepEqual(r.already, ["bb"]);
  assert.deepEqual(r.noRoom, ["ee"]);
});

test("addWords never goes past 500 whatever the limit says", () => {
  const have = Array.from({ length: 499 }, (_, i) => `w${i}`);
  const r = addWords(have, ["new1", "new2"], 9999);
  assert.equal(r.list.length, 500);
  assert.deepEqual(r.noRoom, ["new2"]);
});

test("addWords is idempotent", () => {
  const first = addWords([], ["aa", "bb"], 20);
  const second = addWords(first.list, ["aa", "bb"], 20);
  assert.deepEqual(second.list, first.list);
  assert.deepEqual(second.added, []);
});

test("removeWords only removes words that are there", () => {
  const r = removeWords(["aa", "bb", "cc"], ["bb", "zz"]);
  assert.deepEqual(r.list, ["aa", "cc"]);
  assert.deepEqual(r.removed, ["bb"]);
});

test("paging", () => {
  const list = Array.from({ length: PAGE_SIZE * 2 + 1 }, (_, i) => `w${i}`);
  assert.equal(pageCount(list.length), 3);
  assert.equal(pageCount(0), 1);
  assert.equal(pageOf(list, 0).items.length, PAGE_SIZE);
  assert.equal(pageOf(list, 2).items.length, 1);
  assert.equal(pageOf(list, 99).page, 2, "past the end lands on the last page");
  assert.equal(pageOf(list, -4).page, 0);
  assert.equal(pageOf(list, "x").page, 0);
});

test("the stored list is normalised by settings too: lowercase, capped, unique", () => {
  patchSection("gk1", "automod", { customWords: ["ABC", "abc", "x".repeat(80), "", 5, ...Array.from({ length: 600 }, (_, i) => `w${i}`)] });
  const list = getSection("gk1", "automod").customWords;
  assert.equal(list.length, 500);
  assert.equal(list[0], "abc");
  assert.equal(list.filter((w) => w === "abc").length, 1);
  assert.ok(list.every((w) => w.length <= 60 && w === w.toLowerCase()));
});

// ---------- the rule ----------

const custom = (defs) => defs.find((d) => d.key === CUSTOM_KEY);

test("the custom words become one native keyword rule", () => {
  const defs = buildRuleDefs(settingsOf({ customWords: ["aa", "bb"], logChannelId: "123456789012345678" }), { full: true });
  const rule = custom(defs);
  assert.ok(rule);
  assert.equal(rule.triggerType, Trigger.Keyword);
  assert.deepEqual(rule.triggerMetadata, { keywordFilter: ["aa", "bb"] });
  assert.ok(rule.name.startsWith(PREFIX));
  assert.equal(rule.enabled, true);
  assert.deepEqual(rule.actions.map((a) => a.type), [Action.BlockMessage, Action.SendAlertMessage]);
  assert.equal(rule.actions[1].metadata.channel, "123456789012345678");
  assert.ok(rule.actions[0].metadata.customMessage.length <= 150);
});

test("no alert action without a log channel, and no rule without words", () => {
  const rule = custom(buildRuleDefs(settingsOf({ customWords: ["aa"] }), { full: true }));
  assert.deepEqual(rule.actions.map((a) => a.type), [Action.BlockMessage]);
  assert.equal(custom(buildRuleDefs(settingsOf(), { full: true })), undefined);
});

test("exempt roles follow the other rules: only on a plan that has them", () => {
  const s = settingsOf({ customWords: ["aa"], exemptRoleIds: ["111111111111111111"] });
  assert.deepEqual(custom(buildRuleDefs(s, { full: true })).exemptRoles, ["111111111111111111"]);
  assert.deepEqual(custom(buildRuleDefs(s, { full: false })).exemptRoles, []);
});

test("the custom rule exists on the free plan and does not change the other rules", () => {
  const withWords = buildRuleDefs(settingsOf({ customWords: ["aa"] }), { full: false });
  const without = buildRuleDefs(settingsOf(), { full: false });
  assert.deepEqual(withWords.filter((d) => d.key !== CUSTOM_KEY), without);
  assert.deepEqual(withWords.map((d) => d.key), ["spam", "invites", CUSTOM_KEY]);
});

test("with the standard rules off, only the custom rule is wanted", () => {
  const off = settingsOf({ enabled: false, customWords: ["aa"] });
  assert.deepEqual(buildRuleDefs(off, { full: true }).map((d) => d.key), [CUSTOM_KEY]);
  assert.deepEqual(buildRuleDefs(settingsOf({ enabled: false }), { full: true }), []);
});

test("the plan limit and Discord's own caps bound the keyword list", () => {
  const words = Array.from({ length: 300 }, (_, i) => `word${i}`);
  assert.equal(custom(buildRuleDefs(settingsOf({ customWords: words }), { full: true, customLimit: 200 })).triggerMetadata.keywordFilter.length, 200);
  assert.equal(custom(buildRuleDefs(settingsOf({ customWords: words }), { full: true, customLimit: 20 })).triggerMetadata.keywordFilter.length, 20);
  const bad = custom(buildRuleDefs(settingsOf({ customWords: ["ok", "x".repeat(61), ""] }), { full: true }));
  assert.deepEqual(bad.triggerMetadata.keywordFilter, ["ok"]);
});

test("planSync creates, updates and removes only the recorded custom rule", () => {
  const defs = buildRuleDefs(settingsOf({ enabled: false, customWords: ["aa"] }), { full: true });
  const create = planSync(defs, {}, new Map());
  assert.deepEqual(create.create.map((c) => c.key), [CUSTOM_KEY]);
  assert.equal(create.update.length + create.remove.length, 0);

  const live = { ...defs[0], id: "r1" };
  const steady = planSync(defs, { [CUSTOM_KEY]: "r1" }, new Map([["r1", live]]));
  assert.deepEqual([steady.create, steady.update, steady.remove], [[], [], []], "idempotent");

  const changed = buildRuleDefs(settingsOf({ enabled: false, customWords: ["aa", "bb"] }), { full: true });
  const update = planSync(changed, { [CUSTOM_KEY]: "r1" }, new Map([["r1", live]]));
  assert.deepEqual(update.update.map((u) => u.key), [CUSTOM_KEY]);

  // someone else's rule is never in the plan
  const stranger = { id: "r9", name: "Của admin", triggerType: Trigger.Keyword, triggerMetadata: { keywordFilter: ["x"] } };
  const removal = planSync([], { [CUSTOM_KEY]: "r1" }, new Map([["r1", live], ["r9", stranger]]));
  assert.deepEqual(removal.remove, [{ key: CUSTOM_KEY, id: "r1", exists: true }]);
  assert.equal(removal.create.length + removal.update.length, 0);
});

test("a rule an admin edited by adding a word is put back", () => {
  const defs = buildRuleDefs(settingsOf({ enabled: false, customWords: ["aa"] }), { full: true });
  const edited = { ...defs[0], id: "r1", triggerMetadata: { keywordFilter: ["aa", "tu-cua-admin"] } };
  assert.equal(planSync(defs, { [CUSTOM_KEY]: "r1" }, new Map([["r1", edited]])).update.length, 1);
});
