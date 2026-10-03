import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { AutoModerationActionType as Action, AutoModerationRuleTriggerType as Trigger, Collection, PermissionFlagsBits } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "automod-test-"));

const { buildRuleDefs, planSync, LIMITS, PREFIX } = await import("../src/automod/rules.js");
const { removeAutomod, syncAutomod, gateAutomod } = await import("../src/automod/index.js");
const { getSection, setSection, patchSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");
const command = (await import("../src/commands/automod.js")).default;

const base = (over = {}) => getSectionDefaults(over);
function getSectionDefaults(over) {
  return { enabled: true, level: "vua", logChannelId: null, blockInvites: true, blockLinks: false, mentionLimit: 5, exemptRoleIds: [], ruleIds: {}, ...over };
}
const keys = (defs) => defs.map((d) => d.key);
let counter = 0;
const gid = () => `8100000000000${String(++counter).padStart(4, "0")}`;

test("every level builds the rules it promises", () => {
  assert.deepEqual(keys(buildRuleDefs(base({ level: "nhe" }), { full: true })), ["spam", "invites"]);
  assert.deepEqual(keys(buildRuleDefs(base({ level: "vua" }), { full: true })), ["spam", "invites", "mentions", "words"]);
  assert.deepEqual(keys(buildRuleDefs(base({ level: "gat" }), { full: true })), ["spam", "invites", "mentions", "words"]);
  assert.deepEqual(keys(buildRuleDefs(base({ level: "gat", blockLinks: true }), { full: true })), ["spam", "invites", "mentions", "words", "links"]);
  assert.deepEqual(keys(buildRuleDefs(base({ level: "nhe", blockInvites: false }), { full: true })), ["spam"]);
});

test("rules carry the right triggers, presets and actions", () => {
  const gat = buildRuleDefs(base({ level: "gat", logChannelId: "123456789012345678", mentionLimit: 8 }), { full: true });
  const words = gat.find((d) => d.key === "words");
  assert.equal(words.triggerType, Trigger.KeywordPreset);
  assert.equal(words.triggerMetadata.presets.length, 3);
  const vua = buildRuleDefs(base({ level: "vua" }), { full: true });
  assert.equal(vua.find((d) => d.key === "words").triggerMetadata.presets.length, 2);
  const mentions = gat.find((d) => d.key === "mentions");
  assert.equal(mentions.triggerMetadata.mentionTotalLimit, 8);
  const timeout = mentions.actions.find((a) => a.type === Action.Timeout);
  assert.equal(timeout.metadata.durationSeconds, 60);
  for (const def of gat) {
    assert.ok(def.name.startsWith(PREFIX));
    const block = def.actions.find((a) => a.type === Action.BlockMessage);
    assert.ok(block.metadata.customMessage.length > 0 && block.metadata.customMessage.length <= LIMITS.customMessage);
    assert.equal(def.actions.find((a) => a.type === Action.SendAlertMessage).metadata.channel, "123456789012345678");
    if (def.key !== "mentions") assert.equal(def.actions.some((a) => a.type === Action.Timeout), false);
  }
  assert.equal(buildRuleDefs(base(), { full: true })[0].actions.some((a) => a.type === Action.SendAlertMessage), false);
});

test("Discord limits are respected", () => {
  const defs = buildRuleDefs(base({ level: "gat", blockLinks: true, exemptRoleIds: Array.from({ length: 20 }, (_, i) => `1000000000000000${String(10 + i)}`) }), { full: true });
  assert.ok(defs.filter((d) => d.triggerType === Trigger.Keyword).length <= LIMITS.keywordRules);
  assert.equal(defs.filter((d) => d.triggerType === Trigger.Spam).length, 1);
  assert.equal(defs.filter((d) => d.triggerType === Trigger.MentionSpam).length, 1);
  assert.equal(defs.filter((d) => d.triggerType === Trigger.KeywordPreset).length, 1);
  for (const def of defs) {
    assert.ok(def.exemptRoles.length <= LIMITS.exemptRoles);
    const patterns = def.triggerMetadata.regexPatterns ?? [];
    assert.ok(patterns.length <= LIMITS.regexPerRule);
    for (const p of patterns) {
      assert.ok(p.length <= LIMITS.regexLength);
      assert.doesNotThrow(() => new RegExp(p.replace(/^\(\?i\)/, ""), "i"));
    }
  }
  const invite = defs.find((d) => d.key === "invites").triggerMetadata.regexPatterns[0].replace(/^\(\?i\)/, "");
  assert.ok(new RegExp(invite, "i").test("vào https://discord.gg/abc123 nè"));
  assert.ok(!new RegExp(invite, "i").test("discord là app chat"));
});

test("a free server gets only the gentle level, no exempt roles", () => {
  const defs = buildRuleDefs(base({ level: "gat", blockLinks: true, exemptRoleIds: ["100000000000000001"] }), { full: false });
  assert.deepEqual(keys(defs), ["spam", "invites"]);
  assert.deepEqual(defs[0].exemptRoles, []);
});

test("planSync creates only what is missing and updates only what changed", () => {
  const desired = buildRuleDefs(base({ level: "vua" }), { full: true });
  const first = planSync(desired, {}, new Map());
  assert.deepEqual(keys(first.create.map((c) => c.def)), keys(desired));
  assert.equal(first.update.length + first.remove.length, 0);

  // Same rules already there in the shape Discord returns them
  const existing = new Map(desired.map((d, i) => [`20000000000000000${i}`, { ...d, id: `20000000000000000${i}`, exemptRoles: new Collection() }]));
  const recorded = Object.fromEntries(desired.map((d, i) => [d.key, `20000000000000000${i}`]));
  const again = planSync(desired, recorded, existing);
  assert.deepEqual(again, { create: [], update: [], remove: [] });

  existing.get(recorded.mentions).triggerMetadata = { mentionTotalLimit: 20 };
  existing.delete(recorded.words);
  const drift = planSync(desired, recorded, existing);
  assert.deepEqual(drift.update.map((u) => u.key), ["mentions"]);
  assert.deepEqual(drift.create.map((c) => [c.key, c.recreated]), [["words", true]]);
});

test("planSync removes only recorded ids and never a foreign rule", () => {
  const desired = buildRuleDefs(base({ level: "nhe" }), { full: true });
  const foreign = { id: "999", name: "Luật của admin", triggerType: Trigger.Keyword, actions: [] };
  const mine = { id: "300000000000000001", name: `${PREFIX}x`, triggerType: Trigger.Spam, actions: [] };
  const existing = new Map([["999", foreign], [mine.id, mine]]);
  const plan = planSync(desired, { mentions: mine.id, words: "300000000000000002" }, existing);
  assert.deepEqual(plan.remove, [
    { key: "mentions", id: mine.id, exists: true },
    { key: "words", id: "300000000000000002", exists: false },
  ]);
  assert.ok(![...plan.create, ...plan.update].some((p) => p.id === "999"));
});

test("gating: free servers are refused above the gentle level", () => {
  const free = gid();
  assert.equal(gateAutomod(free, { level: "nhe" }), null);
  assert.match(gateAutomod(free, { level: "vua" }), /Pro/);
  assert.match(gateAutomod(free, { level: "nhe", blockLinks: true }), /Pro/);
  assert.match(gateAutomod(free, { exempt: true }), /Pro/);
  const pro = gid();
  grant(pro, "pro", 30);
  assert.equal(gateAutomod(pro, { level: "gat", blockLinks: true, exempt: true }), null);
});

// A guild whose AutoMod manager records every call
function fakeGuild({ id = gid(), manage = true, failCreate = null, failFetch = null, failDelete = null, rules = [] } = {}) {
  const store = new Collection(rules.map((r) => [r.id, r]));
  const calls = [];
  let next = 1;
  const guild = {
    id,
    calls,
    store,
    members: { me: { permissions: { has: (flag) => manage || flag !== PermissionFlagsBits.ManageGuild } } },
    autoModerationRules: {
      fetch: async () => {
        calls.push(["fetch"]);
        if (failFetch) throw failFetch;
        return store;
      },
      create: async (options) => {
        calls.push(["create", options]);
        if (failCreate) throw failCreate;
        const rule = { ...options, id: `4000000000000000${String(next++).padStart(2, "0")}`, exemptRoles: new Collection() };
        store.set(rule.id, rule);
        return rule;
      },
      edit: async (ruleId, options) => {
        calls.push(["edit", ruleId, options]);
        store.set(ruleId, { ...store.get(ruleId), ...options });
        return store.get(ruleId);
      },
      delete: async (ruleId) => {
        calls.push(["delete", ruleId]);
        if (failDelete) throw failDelete;
        if (!store.delete(ruleId)) throw Object.assign(new Error("Unknown"), { code: 10066 });
      },
    },
  };
  return guild;
}

function fakeInteraction(guild, { sub, options = {}, admin = true }) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild.id,
    user: { id: "u1" },
    member: { permissions: { has: () => admin } },
    options: {
      getSubcommand: () => sub,
      getString: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
      getBoolean: (n) => options[n] ?? null,
      getRole: (n) => options[n] ?? null,
    },
    reply: async (p) => replies.push(p),
    deferReply: async () => {},
    editReply: async (p) => replies.push(p),
  };
}
const text = (i) => i.replies.map((r) => (typeof r === "string" ? r : r.content ?? r.embeds?.[0]?.data.description)).join("\n");

test("the command JSON is valid", () => {
  const json = command.data.toJSON();
  assert.ok(json.description.length <= 100);
  for (const sub of json.options) {
    assert.match(sub.name, /^[a-z]+$/);
    assert.ok(sub.description.length <= 100);
    for (const o of sub.options ?? []) {
      assert.match(o.name, /^[a-z]+$/);
      assert.ok((o.choices ?? []).length <= 25);
    }
  }
});

test("bat on a free server builds the gentle rules, records ids, and refuses a higher level", async () => {
  const guild = fakeGuild();
  const strict = fakeInteraction(guild, { sub: "bat", options: { muc: "vua" } });
  await command.execute(strict);
  assert.match(text(strict), /Pro/);
  assert.equal(guild.calls.length, 0);

  const gentle = fakeInteraction(guild, { sub: "bat", options: { muc: "nhe", kenhlog: { id: "123456789012345678" } } });
  await command.execute(gentle);
  const creates = guild.calls.filter((c) => c[0] === "create");
  assert.equal(creates.length, 2);
  const saved = getSection(guild.id, "automod");
  assert.deepEqual(Object.keys(saved.ruleIds).sort(), ["invites", "spam"]);
  assert.equal(saved.enabled, true);
  assert.match(text(gentle), /Nhẹ/);
});

test("bat on a Pro server runs the strict level, a second run changes nothing, and tat removes only recorded rules", async () => {
  const guild = fakeGuild();
  grant(guild.id, "pro", 30);
  const foreign = { id: "777", name: "Luật admin", triggerType: Trigger.Keyword, actions: [] };
  guild.store.set(foreign.id, foreign);

  await command.execute(fakeInteraction(guild, { sub: "bat", options: { muc: "gat", chanlink: true } }));
  assert.equal(Object.keys(getSection(guild.id, "automod").ruleIds).length, 5);

  guild.calls.length = 0;
  await command.execute(fakeInteraction(guild, { sub: "bat", options: { muc: "gat", chanlink: false } }));
  assert.deepEqual(guild.calls.filter((c) => c[0] === "delete").length, 1);

  guild.calls.length = 0;
  await command.execute(fakeInteraction(guild, { sub: "bat", options: { muc: "gat" } }));
  assert.deepEqual(guild.calls.map((c) => c[0]), ["fetch"], "already in sync: only a fetch");

  const off = fakeInteraction(guild, { sub: "tat" });
  await command.execute(off);
  assert.ok(guild.store.has("777"), "the admin's rule is untouched");
  assert.equal(guild.store.size, 1);
  const after = getSection(guild.id, "automod");
  assert.deepEqual(after.ruleIds, {});
  assert.equal(after.enabled, false);
  assert.match(text(off), /4 luật/);
});

test("a recorded rule an admin deleted is reported by trangthai and recreated by bat", async () => {
  const guild = fakeGuild();
  grant(guild.id, "pro", 30);
  await command.execute(fakeInteraction(guild, { sub: "bat", options: { muc: "vua" } }));
  const spamId = getSection(guild.id, "automod").ruleIds.spam;
  guild.store.delete(spamId);

  const status = fakeInteraction(guild, { sub: "trangthai" });
  await command.execute(status);
  assert.match(text(status), /bị xoá/);
  assert.match(text(status), /dựng lại/);

  guild.calls.length = 0;
  await command.execute(fakeInteraction(guild, { sub: "bat", options: { muc: "vua" } }));
  assert.equal(guild.calls.filter((c) => c[0] === "create").length, 1);
  const newId = getSection(guild.id, "automod").ruleIds.spam;
  assert.notEqual(newId, spamId);
  assert.ok(guild.store.has(newId));
});

test("bat explains a missing ManageGuild permission, a limit, and an API error", async () => {
  const noPerm = fakeGuild({ manage: false });
  const a = fakeInteraction(noPerm, { sub: "bat", options: { muc: "nhe" } });
  await command.execute(a);
  assert.match(text(a), /Quản lý server/);
  assert.equal(noPerm.calls.length, 0);
  assert.equal(getSection(noPerm.id, "automod").enabled, false);

  const limit = fakeGuild({ failCreate: Object.assign(new Error("Maximum number of rules reached"), { code: 30032 }) });
  const b = fakeInteraction(limit, { sub: "bat", options: { muc: "nhe" } });
  await command.execute(b);
  assert.match(text(b), /giới hạn/);
  assert.deepEqual(getSection(limit.id, "automod").ruleIds, {});

  const forbidden = fakeGuild({ failCreate: Object.assign(new Error("Missing Permissions"), { code: 50013 }) });
  const c = fakeInteraction(forbidden, { sub: "bat", options: { muc: "nhe" } });
  await command.execute(c);
  assert.match(text(c), /Quản lý server/);

  const broken = fakeGuild({ failFetch: new Error("boom") });
  const d = fakeInteraction(broken, { sub: "bat", options: { muc: "nhe" } });
  await command.execute(d);
  assert.match(text(d), /Discord từ chối/);
});

test("trangthai says so when AutoMod was never turned on, and a fetch failure is friendly", async () => {
  const guild = fakeGuild();
  const i = fakeInteraction(guild, { sub: "trangthai" });
  await command.execute(i);
  assert.match(text(i), /đang tắt/);

  setSection(guild.id, "automod", { enabled: true, ruleIds: { spam: "500000000000000001" } });
  guild.autoModerationRules.fetch = async () => {
    throw new Error("down");
  };
  const j = fakeInteraction(guild, { sub: "trangthai" });
  await command.execute(j);
  assert.match(text(j), /Discord từ chối/);
});

test("mientru needs Pro, rejects @everyone, and resyncs the rules", async () => {
  const free = fakeGuild();
  const refused = fakeInteraction(free, { sub: "mientru", options: { hanhdong: "them", role: { id: "100000000000000001" } } });
  await command.execute(refused);
  assert.match(text(refused), /Pro/);

  const guild = fakeGuild();
  grant(guild.id, "pro", 30);
  await command.execute(fakeInteraction(guild, { sub: "bat", options: { muc: "nhe" } }));
  const everyone = fakeInteraction(guild, { sub: "mientru", options: { hanhdong: "them", role: { id: guild.id } } });
  await command.execute(everyone);
  assert.match(text(everyone), /@everyone/);

  const add = fakeInteraction(guild, { sub: "mientru", options: { hanhdong: "them", role: { id: "100000000000000001" } } });
  await command.execute(add);
  assert.deepEqual(getSection(guild.id, "automod").exemptRoleIds, ["100000000000000001"]);
  const edits = guild.calls.filter((c) => c[0] === "edit");
  assert.equal(edits.length, 2);
  assert.deepEqual(edits[0][2].exemptRoles, ["100000000000000001"]);
  assert.equal("triggerType" in edits[0][2], false);

  const again = fakeInteraction(guild, { sub: "mientru", options: { hanhdong: "them", role: { id: "100000000000000001" } } });
  await command.execute(again);
  assert.match(text(again), /rồi/);

  const remove = fakeInteraction(guild, { sub: "mientru", options: { hanhdong: "xoa", role: { id: "100000000000000001" } } });
  await command.execute(remove);
  assert.deepEqual(getSection(guild.id, "automod").exemptRoleIds, []);
});

test("non administrators are turned away", async () => {
  const guild = fakeGuild();
  const i = fakeInteraction(guild, { sub: "bat", options: { muc: "nhe" }, admin: false });
  await command.execute(i);
  assert.equal(guild.calls.length, 0);
  assert.ok(text(i));
});

test("removeAutomod deletes recorded rules, keeps the ones that fail, and never throws", async () => {
  const guild = fakeGuild();
  await syncAutomod((patchSection(guild.id, "automod", { enabled: true }), guild));
  const ids = Object.values(getSection(guild.id, "automod").ruleIds);
  assert.equal(ids.length, 2);
  guild.store.delete(ids[0]);
  const result = await removeAutomod(guild);
  assert.deepEqual(result, { removed: 2, left: 0 });

  const stuck = fakeGuild({ failDelete: Object.assign(new Error("Missing Permissions"), { code: 50013 }) });
  patchSection(stuck.id, "automod", { enabled: true });
  await syncAutomod(stuck);
  const partial = await removeAutomod(stuck);
  assert.equal(partial.left, 2);
  assert.equal(Object.keys(getSection(stuck.id, "automod").ruleIds).length, 2);

  const untouched = fakeGuild();
  assert.deepEqual(await removeAutomod(untouched), { removed: 0, left: 0 });
});
