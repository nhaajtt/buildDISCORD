import { test, after } from "node:test";
import assert from "node:assert/strict";
import { Collection, MessageType } from "discord.js";
import { createGateway } from "./e2e/gateway.js";

const gw = await createGateway({ env: { UNLOCKED_GUILD_IDS: null, OWNER_IDS: null } });
after(() => gw.close());

const { getSection, patchSection } = await import("../src/settings.js");
const { grant } = await import("../src/license.js");
const { handleYoungJoin, kickRefusal, DAY_MS } = await import("../src/security/age.js");
const { removeAutomod, syncAutomod } = await import("../src/automod/index.js");
const { validateSection } = await import("../src/web/validate.js");
const { putSettings } = await import("../src/web/api.js");
const { afterSave } = await import("../src/web/manage.js");

const RULE_NAME = "Thầu: Từ khoá tự chế";
const names = (guild) => [...guild.automodRules.values()].map((r) => r.name).sort();
const customRule = (guild) => [...guild.automodRules.values()].find((r) => r.name === RULE_NAME);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------- new-account filter

let noticeSeq = 0;
const joinNotice = (guildId, createdTimestamp) => ({
  id: `review-join-${(noticeSeq += 1)}`,
  type: MessageType.UserJoin,
  guild: { id: guildId },
  author: { id: `9${String(noticeSeq).padStart(8, "0")}`, bot: false, createdTimestamp },
});

test("an account that is already old enough is never queued, so a flood of old joins cannot crowd out a young one", () => {
  const guild = gw.createGuild();
  patchSection(guild.id, "security", { minAccountAgeDays: 7, youngAction: "alert" });
  const pushed = [];
  const queue = { push: (guildId, job) => (pushed.push(job.userId), "queued") };
  const now = Date.now();

  assert.equal(handleYoungJoin(joinNotice(guild.id, now - 365 * DAY_MS), { queue }), "old");
  assert.equal(pushed.length, 0, "an old account costs no fetch and no queue slot");
  assert.equal(handleYoungJoin(joinNotice(guild.id, now - DAY_MS), { queue }), "queued");
  assert.equal(pushed.length, 1);
  assert.equal(handleYoungJoin(joinNotice(guild.id, undefined), { queue }), "queued", "an unknown date is left to the worker");
  assert.equal(pushed.length, 2);
});

function memberOf(roles) {
  const cache = new Collection(roles.map((r) => [r, { id: r }]));
  return { id: "200", user: { id: "200", bot: false }, roles: { cache, highest: { position: 1 } }, kickable: true };
}
const guildOf = () => ({ id: "g", ownerId: "1", members: { me: { permissions: { has: () => true }, roles: { highest: { position: 100 } } } } });

test("the newbie role the welcome flow hands to every joiner does not exempt a young account, a verified one still is", () => {
  const welcome = { verifyRoleId: "900", newbieRoleId: "901" };
  assert.equal(kickRefusal(guildOf(), memberOf(["901"]), welcome), null, "the role given on join must not shield the account");
  assert.equal(kickRefusal(guildOf(), memberOf(["900"]), welcome), "welcomed");
});

// ---------------------------------------------------------------- custom blocked words (dashboard path)

test("the dashboard refuses the same words the slash command refuses", () => {
  const guild = gw.createGuild();
  const current = getSection(guild.id, "automod");
  const refuse = (word) => validateSection("automod", { customWords: [word] }, guild, current).error;
  for (const word of ["a", "*", "**", "<@123456789012345678>", "@everyone", "discord.gg/abc", "https://evil.example", "ngu, ngốc", "x*"]) {
    assert.ok(refuse(word), `${word} must be refused`);
  }
  const ok = validateSection("automod", { customWords: ["Đồ Ngu", "ngu*", "*xấu"] }, guild, current);
  assert.deepEqual(ok.patch.customWords, ["đồ ngu", "ngu*", "*xấu"]);
});

// ---------------------------------------------------------------- dashboard AutoMod

test("saving words from the dashboard builds the keyword rule even while the standard AutoMod is off", async () => {
  const guild = gw.createGuild();
  const result = await putSettings(guild, "automod", { enabled: false, customWords: ["abc", "def"] }, {});
  assert.deepEqual(names(guild), [RULE_NAME]);
  assert.deepEqual([...customRule(guild).triggerMetadata.keywordFilter].sort(), ["abc", "def"]);
  assert.equal(result.applied, true);
  assert.equal(getSection(guild.id, "automod").ruleIds.custom, customRule(guild).id);
});

test("switching the standard AutoMod off from the dashboard keeps the words rule and removes only the standard ones", async () => {
  const guild = gw.createGuild();
  await putSettings(guild, "automod", { enabled: true, level: "nhe", customWords: ["abc"] }, {});
  assert.ok(names(guild).length > 1, "standard rules and the words rule exist");
  await putSettings(guild, "automod", { enabled: false }, {});
  assert.deepEqual(names(guild), [RULE_NAME]);
  assert.deepEqual(Object.keys(getSection(guild.id, "automod").ruleIds), ["custom"]);
});

test("a server whose plan lapsed can still edit its words even if a higher level is stored", async () => {
  const guild = gw.createGuild();
  patchSection(guild.id, "automod", { enabled: true, level: "vua" });
  await putSettings(guild, "automod", { customWords: ["abc", "def"] }, {});
  assert.deepEqual(getSection(guild.id, "automod").customWords, ["abc", "def"]);
});

test("a word list never grows past the plan through the API", async () => {
  const guild = gw.createGuild();
  const many = Array.from({ length: 21 }, (_, i) => `tu${i}x`);
  await assert.rejects(() => putSettings(guild, "automod", { customWords: many }, {}), (error) => error.status === 403);
  assert.deepEqual(getSection(guild.id, "automod").customWords, []);
});

// ---------------------------------------------------------------- AutoMod sync

test("removing and syncing at the same time never leaves a rule the bot forgot", async () => {
  const guild = gw.createGuild();
  patchSection(guild.id, "automod", { enabled: true, level: "nhe", blockInvites: false });
  await syncAutomod(guild);
  assert.equal(guild.automodRules.size, 1);

  const manager = guild.autoModerationRules;
  const realDelete = manager.delete;
  manager.delete = async (...args) => {
    await realDelete(...args);
    await sleep(25);
  };
  try {
    await Promise.all([removeAutomod(guild), syncAutomod(guild)]);
  } finally {
    manager.delete = realDelete;
  }
  const recorded = new Set(Object.values(getSection(guild.id, "automod").ruleIds));
  const live = [...guild.automodRules.keys()];
  assert.deepEqual(live.filter((id) => !recorded.has(id)), [], "every rule on the server is one the bot recorded");
  assert.deepEqual([...recorded].filter((id) => !live.includes(id)), [], "every recorded rule exists");
});

test("a change made while a sync is running is not undone by it", async () => {
  const guild = gw.createGuild();
  patchSection(guild.id, "automod", { enabled: false, customWords: ["abc"] });
  const manager = guild.autoModerationRules;
  const realFetch = manager.fetch;
  manager.fetch = async (...args) => {
    const rules = await realFetch(...args);
    patchSection(guild.id, "automod", { enabled: true, level: "nhe" });
    return rules;
  };
  try {
    await syncAutomod(guild);
  } finally {
    manager.fetch = realFetch;
  }
  assert.equal(getSection(guild.id, "automod").enabled, true, "the admin's switch stays on");
  await syncAutomod(guild);
  assert.ok(names(guild).length > 1, "the next sync builds the standard rules");
});

test("exempting a role updates the words rule even when the standard AutoMod is off", async () => {
  const guild = gw.createGuild();
  const admin = gw.addAdmin(guild);
  grant(guild.id, "pro", 30, gw.clock.now());
  const vip = guild.addRole({ name: "VIP", position: 5 });
  await gw.slash("automod", { guild, member: admin, group: "tukhoa", sub: "them", options: { tu: "abc" } });
  assert.deepEqual(customRule(guild).exemptRoles ?? [], []);
  await gw.slash("automod", { guild, member: admin, sub: "mientru", options: { hanhdong: "them", role: vip } });
  assert.deepEqual(customRule(guild).exemptRoles, [vip.id]);
});

// ---------------------------------------------------------------- optional modules

test("a stats or temporary room sync that never answers does not hold the server lock forever", async () => {
  const guild = gw.createGuild();
  const ctx = { hooks: { syncStats: () => new Promise(() => {}) }, optionalTimeoutMs: 30 };
  const outcome = await Promise.race([afterSave("stats", guild, { enabled: true }, ctx), sleep(2000).then(() => "hung")]);
  assert.notEqual(outcome, "hung");
  assert.equal(outcome.applied, false);
});
