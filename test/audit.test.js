import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection, MessageFlags, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "audit-test-"));

const rules = await import("../src/audit/rules.js");
const { scoreFindings, gradeFor, buildReport } = await import("../src/audit/score.js");
const { FIXES, getFix, fixIdsOf } = await import("../src/audit/fixes.js");
const { toFacts } = await import("../src/audit/facts.js");
const audit = await import("../src/audit/index.js");
const { gradeBands } = await import("../src/humor/audit.js");
const command = (await import("../src/commands/khamsuckhoe.js")).default;

const G = "800000000000000001";
const role = (id, over = {}) => ({ id, name: `role-${id}`, position: 1, managed: false, permissions: 0n, ...over });
const chan = (id, name, type = ChannelType.GuildText, over = {}) => ({ id, name, type, parentId: null, overwrites: [], ...over });

// Facts for a healthy server; each test breaks exactly one thing
const clean = () => ({
  guildId: G,
  name: "Server Sạch",
  memberCount: 50,
  verificationLevel: 2,
  explicitContentFilter: 2,
  mfaLevel: 1,
  systemChannelId: "c-sys",
  rulesChannelId: "c-rules",
  roles: [role(G, { name: "@everyone", position: 0, permissions: P.ViewChannel | P.SendMessages }), role("r-mod", { position: 5, permissions: P.KickMembers }), role("r-bot", { managed: true, permissions: P.Administrator })],
  channels: [
    chan("cat1", "Chat", ChannelType.GuildCategory),
    chan("c-sys", "chat-chung", ChannelType.GuildText, { parentId: "cat1" }),
    chan("c-rules", "luat", ChannelType.GuildText, { parentId: "cat1", overwrites: [{ id: G, type: 0, allow: 0n, deny: P.SendMessages }] }),
    chan("v1", "Phòng thoại", ChannelType.GuildVoice, { parentId: "cat1" }),
  ],
  counts: { roles: 3, channels: 4 },
});

const ids = (findings) => findings.map((f) => f.id);

test("the clean facts produce no findings at all", () => {
  assert.deepEqual(rules.runRules(clean()), []);
  assert.equal(rules.RULES.length, 15);
});

test("everyoneDangerous: every dangerous permission is caught, a safe @everyone is not", () => {
  for (const name of ["Administrator", "ManageGuild", "ManageRoles", "ManageChannels", "ManageWebhooks", "ManageMessages", "KickMembers", "BanMembers", "MentionEveryone", "ModerateMembers"]) {
    const f = clean();
    f.roles[0].permissions = P.SendMessages | P[name];
    const found = rules.everyoneDangerous(f);
    assert.equal(found.length, 1, name);
    assert.equal(found[0].severity, "cao");
    assert.equal(found[0].fixId, "strip-everyone");
  }
  assert.deepEqual(rules.everyoneDangerous(clean()), []);
});

test("manyAdminRoles: four plain admin roles trigger, three or managed ones do not", () => {
  const f = clean();
  f.roles.push(...[1, 2, 3].map((n) => role(`a${n}`, { permissions: P.Administrator })));
  assert.deepEqual(rules.manyAdminRoles(f), [], "three is fine, the managed bot role does not count");
  f.roles.push(role("a4", { permissions: P.Administrator }));
  assert.deepEqual(ids(rules.manyAdminRoles(f)), ["many-admin-roles"]);
});

test("noModeratorRole: needs a non-bot role with a moderation permission", () => {
  assert.deepEqual(rules.noModeratorRole(clean()), []);
  const f = clean();
  f.roles = f.roles.filter((r) => r.id !== "r-mod");
  assert.deepEqual(ids(rules.noModeratorRole(f)), ["no-moderator"]);
  for (const name of ["ModerateMembers", "KickMembers", "ManageMessages"]) {
    const g = clean();
    g.roles.find((r) => r.id === "r-mod").permissions = P[name];
    assert.deepEqual(rules.noModeratorRole(g), [], name);
  }
});

test("verificationNone, contentFilterOff and mfaOff fire only on their off value and offer fixes where safe", () => {
  const v = clean();
  v.verificationLevel = 0;
  assert.equal(rules.verificationNone(v)[0].fixId, "verification-medium");
  v.verificationLevel = 1;
  assert.deepEqual(rules.verificationNone(v), []);

  const c = clean();
  c.explicitContentFilter = 0;
  assert.equal(rules.contentFilterOff(c)[0].fixId, "content-filter");
  c.explicitContentFilter = 1;
  assert.deepEqual(rules.contentFilterOff(c), []);

  const m = clean();
  m.mfaLevel = 0;
  const found = rules.mfaOff(m);
  assert.equal(found[0].fixId, undefined, "2FA can only be switched by the owner");
  m.mfaLevel = 1;
  assert.deepEqual(rules.mfaOff(m), []);
});

test("noRulesChannel: the Discord rules channel or a channel named luat or rules is enough", () => {
  const f = clean();
  f.rulesChannelId = null;
  assert.deepEqual(rules.noRulesChannel(f), [], "the channel named luat counts");
  f.channels = f.channels.filter((c) => c.id !== "c-rules");
  assert.deepEqual(ids(rules.noRulesChannel(f)), ["no-rules-channel"]);
  f.channels.push(chan("x", "📜┃Luật-Server"));
  assert.deepEqual(rules.noRulesChannel(f), []);
  f.channels.pop();
  f.channels.push(chan("y", "server-rules"));
  assert.deepEqual(rules.noRulesChannel(f), []);
});

test("noSystemChannel: a system channel or a welcome-like channel is enough", () => {
  const f = clean();
  f.systemChannelId = null;
  assert.deepEqual(ids(rules.noSystemChannel(f)), ["no-system-channel"]);
  f.channels.push(chan("w", "chào-mừng"));
  assert.deepEqual(rules.noSystemChannel(f), []);
});

test("announceWritable: announcement-like channels that everyone can write in are flagged", () => {
  const f = clean();
  f.channels.push(chan("a1", "thông-báo"), chan("a2", "announcements", ChannelType.GuildAnnouncement));
  assert.deepEqual(ids(rules.announceWritable(f)), ["announce-writable"]);
  assert.match(rules.announceWritable(f)[0].detail, /thông-báo/);
  assert.equal(rules.announceWritable(clean()).length, 0, "the clean luat channel denies sending");

  const locked = clean();
  locked.channels.push(chan("a1", "thong-bao", ChannelType.GuildText, { overwrites: [{ id: G, type: 0, allow: 0n, deny: P.SendMessages }] }));
  assert.deepEqual(rules.announceWritable(locked), []);

  const hidden = clean();
  hidden.channels.push(chan("a1", "thong-bao", ChannelType.GuildText, { overwrites: [{ id: G, type: 0, allow: 0n, deny: P.ViewChannel }] }));
  assert.deepEqual(rules.announceWritable(hidden), [], "a channel @everyone cannot see is not public");

  const allowed = clean();
  allowed.roles[0].permissions = P.ViewChannel;
  allowed.channels.push(chan("a1", "luat-2", ChannelType.GuildText, { overwrites: [{ id: G, type: 0, allow: P.SendMessages, deny: 0n }] }));
  assert.deepEqual(ids(rules.announceWritable(allowed)), ["announce-writable"]);

  const ordinary = clean();
  ordinary.channels.push(chan("z", "tro-chuyen"));
  assert.deepEqual(rules.announceWritable(ordinary), []);
});

test("emptyCategories", () => {
  const f = clean();
  f.channels.push(chan("cat2", "Trống", ChannelType.GuildCategory));
  assert.deepEqual(ids(rules.emptyCategories(f)), ["empty-categories"]);
  assert.match(rules.emptyCategories(f)[0].detail, /Trống/);
  assert.deepEqual(rules.emptyCategories(clean()), []);
});

test("voiceOutsideCategory only matters when categories exist", () => {
  const f = clean();
  f.channels.push(chan("v2", "Lang thang", ChannelType.GuildVoice), chan("s1", "Sân khấu", ChannelType.GuildStageVoice));
  assert.deepEqual(ids(rules.voiceOutsideCategory(f)), ["voice-outside-category"]);
  assert.deepEqual(rules.voiceOutsideCategory(clean()), []);
  const flat = clean();
  flat.channels = [chan("v2", "Lang thang", ChannelType.GuildVoice)];
  assert.deepEqual(rules.voiceOutsideCategory(flat), []);
});

test("duplicateChannelNames ignores case and accents but not channel kind", () => {
  const f = clean();
  f.channels.push(chan("d1", "Chat Chung"), chan("d2", "chat-chung"));
  assert.deepEqual(ids(rules.duplicateChannelNames(f)), ["duplicate-channel-names"]);
  const same = clean();
  same.channels.push(chan("d1", "game"), chan("d2", "game", ChannelType.GuildVoice));
  assert.deepEqual(rules.duplicateChannelNames(same), []);
  assert.deepEqual(rules.duplicateChannelNames(clean()), []);
});

test("roleCount and channelCount trigger above 200 and 450 and not at them", () => {
  const f = clean();
  f.counts = { roles: 200, channels: 450 };
  assert.deepEqual(rules.roleCount(f), []);
  assert.deepEqual(rules.channelCount(f), []);
  f.counts = { roles: 201, channels: 451 };
  assert.deepEqual(ids(rules.roleCount(f)), ["role-count"]);
  assert.deepEqual(ids(rules.channelCount(f)), ["channel-count"]);
  assert.match(rules.roleCount(f)[0].title, /201\/250/);
});

test("roleAboveModerators: a dangerous non-admin role ranked above every moderator role", () => {
  const f = clean();
  f.roles.push(role("r-mgr", { position: 9, permissions: P.ManageRoles }));
  assert.deepEqual(ids(rules.roleAboveModerators(f)), ["role-above-moderators"]);

  const below = clean();
  below.roles.push(role("r-mgr", { position: 2, permissions: P.ManageRoles }));
  assert.deepEqual(rules.roleAboveModerators(below), []);

  const admin = clean();
  admin.roles.push(role("r-admin", { position: 9, permissions: P.Administrator }));
  assert.deepEqual(rules.roleAboveModerators(admin), [], "an admin role on top is normal");

  const managed = clean();
  managed.roles.push(role("r-m", { position: 9, managed: true, permissions: P.ManageRoles }));
  assert.deepEqual(rules.roleAboveModerators(managed), []);

  const noMods = clean();
  noMods.roles = noMods.roles.filter((r) => r.id !== "r-mod");
  noMods.roles.push(role("r-mgr", { position: 9, permissions: P.ManageRoles }));
  assert.deepEqual(rules.roleAboveModerators(noMods), []);
});

test("every finding carries an id, a known severity, a title and a detail, and runRules sorts worst first", () => {
  const f = clean();
  f.verificationLevel = 0;
  f.explicitContentFilter = 0;
  f.mfaLevel = 0;
  f.rulesChannelId = null;
  f.channels = f.channels.filter((c) => c.id !== "c-rules");
  f.roles[0].permissions |= P.ManageGuild;
  const found = rules.runRules(f);
  for (const item of found) {
    assert.ok(item.id && item.title && item.detail);
    assert.ok(["cao", "vua", "thap"].includes(item.severity));
  }
  const order = found.map((x) => rules.SEVERITY_ORDER[x.severity]);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(found[0].id, "everyone-dangerous");
});

test("scoring: 15 per cao, 7 per vua, 3 per thap, between 0 and 100", () => {
  const mk = (cao, vua, thap) => [...Array(cao).fill({ severity: "cao" }), ...Array(vua).fill({ severity: "vua" }), ...Array(thap).fill({ severity: "thap" })];
  assert.equal(scoreFindings([]), 100);
  assert.equal(scoreFindings(mk(1, 0, 0)), 85);
  assert.equal(scoreFindings(mk(0, 1, 0)), 93);
  assert.equal(scoreFindings(mk(0, 0, 1)), 97);
  assert.equal(scoreFindings(mk(2, 3, 4)), 100 - 30 - 21 - 12);
  assert.equal(scoreFindings(mk(6, 0, 0)), 10);
  assert.equal(scoreFindings(mk(7, 0, 0)), 0, "105 points lost is floored at zero");
  assert.equal(scoreFindings(mk(20, 20, 20)), 0);
  assert.equal(scoreFindings(undefined), 100);
  assert.equal(scoreFindings([{ severity: "weird" }, null]), 100);
});

test("grades: one label per band, each band boundary lands in the right band", () => {
  assert.equal(new Set(gradeBands.map((b) => b.label)).size, gradeBands.length);
  assert.equal(gradeFor(100), gradeBands[0].label);
  assert.equal(gradeFor(90), gradeBands[0].label);
  assert.equal(gradeFor(89), gradeBands[1].label);
  assert.equal(gradeFor(75), gradeBands[1].label);
  assert.equal(gradeFor(74), gradeBands[2].label);
  assert.equal(gradeFor(55), gradeBands[2].label);
  assert.equal(gradeFor(54), gradeBands[3].label);
  assert.equal(gradeFor(35), gradeBands[3].label);
  assert.equal(gradeFor(34), gradeBands[4].label);
  assert.equal(gradeFor(0), gradeBands[4].label);
});

test("buildReport has the documented shape", () => {
  const found = rules.runRules({ ...clean(), mfaLevel: 0 });
  const report = buildReport(clean(), found, 123);
  assert.deepEqual(Object.keys(report).sort(), ["createdAt", "findings", "grade", "score", "stats"]);
  assert.equal(report.createdAt, 123);
  assert.equal(report.score, 93);
  assert.deepEqual(report.stats.findings, { cao: 0, vua: 1, thap: 0 });
});

test("hostile facts never throw and produce sensible results", () => {
  for (const hostile of [undefined, null, 5, "x", [], {}, { roles: null, channels: "no" }, { roles: [null, 3, { permissions: "abc" }, { id: 1, permissions: { bitfield: "zz" } }], channels: [null, { overwrites: null }, { name: 4, type: "x", overwrites: [null, { allow: "q" }] }] }]) {
    assert.doesNotThrow(() => rules.runRules(hostile));
    const found = rules.runRules(hostile);
    assert.ok(Array.isArray(found));
    for (const rule of rules.RULES) assert.ok(Array.isArray(rule.run(hostile)), rule.id);
  }
  // unknown settings are not guessed at: no verification field means no verification finding
  assert.deepEqual(ids(rules.runRules({})).filter((id) => ["verification-none", "content-filter-off", "mfa-off"].includes(id)), []);
  assert.doesNotThrow(() => toFacts({ id: G }));
  assert.doesNotThrow(() => toFacts({ id: G, roles: { cache: new Collection([["1", { id: "1" }]]) }, channels: { cache: new Collection([["2", { id: "2", permissionOverwrites: {} }]]) } }));
});

// A guild for the fixes, the storage and the command: setters change the guild the way Discord would, and record what was called
function fakeGuild({ id = G, everyoneBits = P.ViewChannel | P.SendMessages | P.ManageMessages | P.MentionEveryone | P.BanMembers, verification = 0, filter = 0, failSetters = false } = {}) {
  const calls = [];
  const roles = new Collection();
  const everyone = {
    id,
    name: "@everyone",
    position: 0,
    managed: false,
    permissions: { bitfield: everyoneBits },
    setPermissions: async (bits) => {
      if (failSetters) throw new Error("Missing Permissions");
      calls.push(["everyone", bits]);
      everyone.permissions = { bitfield: BigInt(bits) };
    },
  };
  const other = { id: "r-other", name: "Khác", position: 3, managed: false, permissions: { bitfield: P.ManageGuild }, setPermissions: async () => calls.push(["other"]) };
  roles.set(id, everyone);
  roles.set("r-other", other);
  const channels = new Collection([["c1", { id: "c1", name: "chat", type: ChannelType.GuildText, parentId: null, permissionOverwrites: { cache: new Collection() } }]]);
  const guild = {
    id,
    name: "Server Giả",
    memberCount: 10,
    verificationLevel: verification,
    explicitContentFilter: filter,
    mfaLevel: 0,
    systemChannelId: null,
    rulesChannelId: null,
    calls,
    everyone,
    other,
    roles: { cache: roles, everyone, fetch: async () => roles },
    channels: { cache: channels, fetch: async () => channels },
    setVerificationLevel: async (level) => {
      if (failSetters) throw new Error("Missing Permissions");
      calls.push(["verification", level]);
      guild.verificationLevel = level;
    },
    setExplicitContentFilter: async (value) => {
      if (failSetters) throw new Error("Missing Permissions");
      calls.push(["filter", value]);
      guild.explicitContentFilter = value;
    },
  };
  return guild;
}

test("strip-everyone clears exactly the dangerous bits of @everyone and touches nothing else", async () => {
  const guild = fakeGuild();
  const fix = getFix("strip-everyone");
  const said = fix.describe(guild);
  assert.match(said, /Quản lý tin nhắn/);
  assert.match(said, /Cấm thành viên/);
  assert.match(said, /Gọi @everyone/);
  assert.ok(!said.includes("Xem kênh"), "harmless permissions are not listed");
  const result = await fix.apply(guild);
  assert.equal(result.changed, true);
  assert.equal(guild.everyone.permissions.bitfield, P.ViewChannel | P.SendMessages, "the harmless bits stay");
  assert.deepEqual(guild.calls.map((c) => c[0]), ["everyone"], "no other role, no other setting");
  assert.equal(guild.other.permissions.bitfield, P.ManageGuild);
  assert.equal(guild.verificationLevel, 0);
  assert.equal(fix.describe(guild), null, "nothing left to say");
  assert.equal((await fix.apply(guild)).changed, false, "idempotent");
  assert.equal(guild.calls.length, 1);
});

test("strip-everyone never grants: the result is always a subset of the old bits", async () => {
  const guild = fakeGuild({ everyoneBits: P.Administrator | P.ManageGuild | P.ManageRoles | P.ManageChannels | P.ManageWebhooks | P.KickMembers | P.ModerateMembers | P.AddReactions });
  await getFix("strip-everyone").apply(guild);
  assert.equal(guild.everyone.permissions.bitfield, P.AddReactions);
});

test("verification-medium raises only a lower level and changes nothing else", async () => {
  const fix = getFix("verification-medium");
  const guild = fakeGuild({ verification: 0 });
  assert.match(fix.describe(guild), /Không có/);
  assert.equal((await fix.apply(guild)).changed, true);
  assert.equal(guild.verificationLevel, 2);
  assert.deepEqual(guild.calls, [["verification", 2]]);
  assert.equal(guild.explicitContentFilter, 0);

  for (const level of [2, 3, 4]) {
    const high = fakeGuild({ verification: level });
    assert.equal(fix.describe(high), null);
    assert.equal((await fix.apply(high)).changed, false);
    assert.equal(high.verificationLevel, level, "an already stricter level is never lowered");
    assert.deepEqual(high.calls, []);
  }
  const low = fakeGuild({ verification: 1 });
  await fix.apply(low);
  assert.equal(low.verificationLevel, 2);
});

test("content-filter turns the filter on for all members only when it is off", async () => {
  const fix = getFix("content-filter");
  const guild = fakeGuild({ filter: 0 });
  assert.ok(fix.describe(guild));
  assert.equal((await fix.apply(guild)).changed, true);
  assert.equal(guild.explicitContentFilter, 2);
  assert.deepEqual(guild.calls, [["filter", 2]]);
  assert.equal(guild.verificationLevel, 0);

  const partial = fakeGuild({ filter: 1 });
  assert.equal((await fix.apply(partial)).changed, false);
  assert.equal(partial.explicitContentFilter, 1);
});

test("only the three safe fixes exist, each has describe and apply, and fixIdsOf ignores unknown ids", () => {
  assert.deepEqual(Object.keys(FIXES).sort(), ["content-filter", "strip-everyone", "verification-medium"]);
  for (const fix of Object.values(FIXES)) {
    assert.equal(typeof fix.describe, "function");
    assert.equal(typeof fix.apply, "function");
  }
  assert.equal(getFix("__proto__"), null);
  assert.equal(getFix("delete-everything"), null);
  assert.deepEqual(fixIdsOf({ findings: [{ fixId: "content-filter" }, { fixId: "content-filter" }, { fixId: "nope" }, {}, null] }), ["content-filter"]);
  assert.deepEqual(fixIdsOf(null), []);
});

test("applyFix through the public contract reports unknown ids without changing anything", async () => {
  const guild = fakeGuild();
  const unknown = await audit.applyFix(guild, "format-disk");
  assert.equal(unknown.changed, false);
  assert.deepEqual(guild.calls, []);
  const real = await audit.applyFix(guild, "content-filter");
  assert.deepEqual(Object.keys(real).sort(), ["changed", "fixId", "summary"]);
  assert.equal(real.changed, true);
});

test("runAudit reads the guild, returns the report and stores it; latestReport and reports read it back", async () => {
  const guild = fakeGuild({ id: "800000000000000002" });
  assert.equal(audit.latestReport(guild.id), null);
  assert.deepEqual(audit.reports(guild.id), []);
  const report = await audit.runAudit(guild);
  assert.deepEqual(Object.keys(report).sort(), ["createdAt", "findings", "grade", "score", "stats"]);
  assert.ok(ids(report.findings).includes("everyone-dangerous"));
  assert.equal(report.stats.roles, 2);
  assert.deepEqual(audit.latestReport(guild.id), report);
  assert.deepEqual(audit.reports(guild.id, 5), [report]);
  assert.deepEqual(audit.latestReport("800000000000000099"), null, "other servers are separate");
});

test("only the last 20 reports are kept per server, and other servers are not trimmed", async () => {
  const busy = fakeGuild({ id: "800000000000000003" });
  const quiet = fakeGuild({ id: "800000000000000004" });
  await audit.runAudit(quiet);
  for (let i = 0; i < 25; i++) {
    busy.verificationLevel = i % 3;
    await audit.runAudit(busy);
  }
  assert.equal(audit.reports(busy.id, 100).length, 20);
  assert.equal(audit.reports(busy.id, 5).length, 5);
  assert.equal(audit.reports(busy.id, 0).length, 20, "a nonsense limit falls back to the cap");
  assert.equal(audit.reports(quiet.id).length, 1);
  const newest = audit.reports(busy.id, 2);
  assert.ok(newest[0].createdAt >= newest[1].createdAt);
});

// A fake slash command interaction for /khamsuckhoe
function slash(guild, sub, { admin = true, uid = "u1" } = {}) {
  const replies = [];
  return {
    replies,
    guild,
    guildId: guild?.id ?? null,
    user: { id: uid },
    member: { permissions: { has: (flag) => admin && flag === P.Administrator } },
    options: { getSubcommand: () => sub },
    reply: async (payload) => replies.push(payload),
    deferReply: async (payload) => replies.push({ deferred: true, ...payload }),
    editReply: async (payload) => replies.push(payload),
  };
}

function press(guild, parts, { admin = true, uid = "u1" } = {}) {
  const out = { replies: [], updates: [], edits: [], deferred: 0 };
  return {
    out,
    guild,
    user: { id: uid },
    member: { permissions: { has: (flag) => admin && flag === P.Administrator } },
    reply: async (payload) => out.replies.push(payload),
    update: async (payload) => out.updates.push(payload),
    deferUpdate: async () => out.deferred++,
    editReply: async (payload) => out.edits.push(payload),
    parts,
  };
}

const buttonIds = (payload) => payload.components.flatMap((row) => row.components.map((c) => c.data.custom_id));
const buttonLabels = (payload) => payload.components.flatMap((row) => row.components.map((c) => c.data.label));

test("/khamsuckhoe command JSON is valid", () => {
  const json = command.data.toJSON();
  assert.equal(json.name, "khamsuckhoe");
  assert.ok(json.description.length <= 100);
  assert.deepEqual(json.options.map((o) => o.name), ["kiemtra", "lichsu"]);
  for (const sub of json.options) {
    assert.match(sub.name, /^[a-z]+$/);
    assert.ok(sub.description.length <= 100);
  }
});

test("/khamsuckhoe defers, audits and replies privately with an embed and buttons", async () => {
  const guild = fakeGuild({ id: "800000000000000010" });
  const i = slash(guild, "kiemtra");
  await command.execute(i);
  assert.equal(i.replies[0].deferred, true);
  assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
  const final = i.replies[1];
  const embed = final.embeds[0].data;
  assert.match(embed.description, /\/100/);
  assert.ok(embed.description.includes("@everyone"));
  assert.ok(embed.footer.text);
  assert.ok(buttonLabels(final).some((l) => /^Sửa an toàn \(\d\)$/.test(l)));
  assert.ok(buttonLabels(final).includes("Xem hết"));
  assert.ok(buttonIds(final).every((id) => id.startsWith("khamsuckhoe:") && id.endsWith(":u1")));
  assert.equal(guild.calls.length, 0, "the check itself changes nothing");
});

test("/khamsuckhoe shows at most 10 findings in the embed", async () => {
  const guild = fakeGuild({ id: "800000000000000011" });
  for (let n = 0; n < 12; n++) guild.channels.cache.set(`cat${n}`, { id: `cat${n}`, name: `Trống ${n}`, type: ChannelType.GuildCategory, permissionOverwrites: { cache: new Collection() } });
  const i = slash(guild, "kiemtra");
  await command.execute(i);
  const lines = i.replies[1].embeds[0].data.description.split("\n").filter((l) => /^[🔴🟡🟢] \*\*/u.test(l));
  assert.ok(lines.length <= 10);
});

test("/khamsuckhoe omits the fix button when no safe fix applies", async () => {
  const guild = fakeGuild({ id: "800000000000000012", everyoneBits: P.ViewChannel, verification: 2, filter: 2 });
  const i = slash(guild, "kiemtra");
  await command.execute(i);
  assert.ok(!buttonLabels(i.replies[1]).some((l) => /Sửa an toàn/.test(l)));
});

test("/khamsuckhoe refuses non-admins, DMs, and reports an audit failure kindly", async () => {
  const guild = fakeGuild({ id: "800000000000000013" });
  const nope = slash(guild, "kiemtra", { admin: false });
  await command.execute(nope);
  assert.equal(nope.replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(nope.replies.length, 1);
  assert.ok(!nope.replies[0].deferred);

  const dm = slash(null, "kiemtra");
  await command.execute(dm);
  assert.equal(dm.replies.length, 1);

  const broken = fakeGuild({ id: "800000000000000014" });
  broken.roles = { cache: { values: () => { throw new Error("boom"); } } };
  const quiet = console.error;
  console.error = () => {};
  try {
    const i = slash(broken, "kiemtra");
    await command.execute(i);
    assert.equal(typeof i.replies.at(-1), "string");
  } finally {
    console.error = quiet;
  }
});

test("/khamsuckhoe lichsu shows the last 5 scores as a trend", async () => {
  const guild = fakeGuild({ id: "800000000000000015" });
  const empty = slash(guild, "lichsu");
  await command.execute(empty);
  assert.equal(typeof empty.replies[0].content, "string");

  for (let n = 0; n < 7; n++) {
    guild.verificationLevel = n % 2 === 0 ? 0 : 2;
    await audit.runAudit(guild);
  }
  const i = slash(guild, "lichsu");
  await command.execute(i);
  const description = i.replies[0].embeds[0].data.description;
  assert.equal((description.match(/\/100/g) ?? []).length, 5);
  assert.equal(i.replies[0].flags, MessageFlags.Ephemeral);
  assert.match(description, /[▁▂▃▄▅▆▇█]{5}/);
});

test("the fix button opens a confirmation listing exactly what will change, then the confirmation applies it", async () => {
  const guild = fakeGuild({ id: "800000000000000020" });
  await command.execute(slash(guild, "kiemtra"));

  const open = press(guild);
  await command.handleComponent(open, ["fix", "u1"]);
  const confirm = open.out.replies[0];
  assert.equal(confirm.flags, MessageFlags.Ephemeral);
  assert.match(confirm.content, /@everyone/);
  assert.match(confirm.content, /Trung bình/);
  assert.equal(guild.calls.length, 0, "nothing changes before the confirmation");
  const [go, no] = buttonIds(confirm);
  assert.match(go, /^khamsuckhoe:go:u1:/);
  assert.equal(no, "khamsuckhoe:no:u1");

  const run = press(guild);
  await command.handleComponent(run, go.split(":").slice(1));
  assert.equal(run.out.deferred, 1);
  assert.deepEqual(guild.calls.map((c) => c[0]).sort(), ["everyone", "filter", "verification"]);
  assert.equal(guild.everyone.permissions.bitfield, P.ViewChannel | P.SendMessages);
  assert.equal(guild.verificationLevel, 2);
  assert.equal(guild.explicitContentFilter, 2);
  assert.equal(guild.other.permissions.bitfield, P.ManageGuild);
  assert.match(run.out.edits[0].content, /Điểm sức khỏe: \d+ thành \d+/);
  assert.deepEqual(run.out.edits[0].components, []);
  assert.ok(audit.latestReport(guild.id).score > 0);

  // a second press of the same confirmation changes nothing more
  const before = guild.calls.length;
  await command.handleComponent(press(guild), go.split(":").slice(1));
  assert.equal(guild.calls.length, before);
});

test("the confirmation reports a refused fix and carries on", async () => {
  const guild = fakeGuild({ id: "800000000000000021", failSetters: true });
  await command.execute(slash(guild, "kiemtra"));
  const open = press(guild);
  await command.handleComponent(open, ["fix", "u1"]);
  const go = buttonIds(open.out.replies[0])[0];
  const run = press(guild);
  await command.handleComponent(run, go.split(":").slice(1));
  assert.equal((run.out.edits[0].content.match(/❌/g) ?? []).length, 3);
});

test("the confirmation ignores ids it does not know", async () => {
  const guild = fakeGuild({ id: "800000000000000022" });
  const run = press(guild);
  await command.handleComponent(run, ["go", "u1", "format-disk,__proto__"]);
  assert.equal(run.out.updates.length, 1);
  assert.deepEqual(guild.calls, []);
});

test("buttons recheck admin and the invoker, so a copied button does nothing", async () => {
  const guild = fakeGuild({ id: "800000000000000023" });
  await command.execute(slash(guild, "kiemtra"));
  const stranger = press(guild, null, { uid: "u2" });
  await command.handleComponent(stranger, ["go", "u1", "content-filter"]);
  assert.equal(stranger.out.deferred, 0);
  assert.equal(guild.calls.length, 0);
  assert.equal(stranger.out.replies[0].flags, MessageFlags.Ephemeral);

  const demoted = press(guild, null, { admin: false });
  await command.handleComponent(demoted, ["go", "u1", "content-filter"]);
  assert.equal(guild.calls.length, 0);
  assert.equal(demoted.out.replies.length, 1);
});

test("the Xem hết button lists every finding, and cancel changes nothing", async () => {
  const guild = fakeGuild({ id: "800000000000000024" });
  for (let n = 0; n < 12; n++) guild.channels.cache.set(`cat${n}`, { id: `cat${n}`, name: `Trống ${n}`, type: ChannelType.GuildCategory, permissionOverwrites: { cache: new Collection() } });
  await command.execute(slash(guild, "kiemtra"));
  const all = press(guild);
  await command.handleComponent(all, ["all", "u1"]);
  assert.equal(all.out.replies[0].flags, MessageFlags.Ephemeral);
  assert.ok(all.out.replies[0].embeds[0].data.description.includes("danh mục trống"));

  const no = press(guild);
  await command.handleComponent(no, ["no", "u1"]);
  assert.equal(no.out.updates.length, 1);
  assert.deepEqual(no.out.updates[0].components, []);
  assert.equal(guild.calls.length, 0);

  const fresh = fakeGuild({ id: "800000000000000025" });
  const none = press(fresh);
  await command.handleComponent(none, ["all", "u1"]);
  assert.equal(typeof none.out.replies[0].content, "string");
  const noFix = press(fresh);
  await command.handleComponent(noFix, ["fix", "u1"]);
  assert.equal(typeof noFix.out.replies[0].content, "string");
});
