import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChannelType, Collection, OverwriteType, PermissionFlagsBits as P } from "discord.js";

process.env.DISCORD_TOKEN = "x";
process.env.CLIENT_ID = "1";
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "backup-test-"));
process.env.BUILD_STEP_DELAY_MS = "0";

const { captureSnapshot, serialize, BackupError, LIMITS } = await import("../src/backups/snapshot.js");
const { validateSnapshot, parseSnapshotFile } = await import("../src/backups/validate.js");
const { planRestore, restoreSnapshot, describeExisting, rolePermissions, overwritePermissions, isForeign } = await import("../src/backups/restore.js");
const { saveBackup, getBackup, listBackups, deleteBackup, countBackups, hasBackup, normalizeName } = await import("../src/backups/store.js");
const { readAttachmentText, AttachmentError } = await import("../src/backups/attachment.js");
const { restoreSummary } = await import("../src/backups/summary.js");
const { loadRecord } = await import("../src/store.js");
const { nukeServer } = await import("../src/builder.js");
const { grant } = await import("../src/license.js");
const { gateLimit } = await import("../src/utils/gate.js");
const backupCommand = (await import("../src/commands/backup.js")).default;
const themeCommand = (await import("../src/commands/theme.js")).default;

let next = 1;
const uid = () => String(next++);
const guildCounter = { n: 0 };
const newGuildId = () => `9000000000000${String(++guildCounter.n).padStart(4, "0")}`;

// A guild that behaves like discord.js for everything the backup code touches. Created roles and channels land in the same caches,
// so a restored guild can be captured again.
function fakeGuild({ id = newGuildId(), failChannelAt = 0 } = {}) {
  const roles = new Collection();
  const channels = new Collection();
  let position = 1;
  let channelCalls = 0;
  const everyone = { id, name: "@everyone", managed: false, position: 0, permissions: { bitfield: 0n }, colors: { primaryColor: 0 } };
  roles.set(id, everyone);
  const attach = (collection, item) => {
    item.delete = async () => collection.delete(item.id);
    collection.set(item.id, item);
    return item;
  };
  const toOverwrites = (list = []) => {
    const cache = new Collection();
    for (const o of list) cache.set(o.id, { id: o.id, type: OverwriteType.Role, allow: { bitfield: BigInt(o.allow) }, deny: { bitfield: BigInt(o.deny) } });
    return { cache };
  };
  const guild = {
    id,
    maximumBitrate: 96000,
    members: { me: { permissions: { has: () => true } } },
    roles: {
      cache: roles,
      everyone,
      fetch: async (rid) => (rid ? roles.get(rid) ?? null : roles),
      create: async (o) =>
        attach(roles, {
          id: uid(),
          name: o.name,
          managed: false,
          position: position++,
          hoist: o.hoist,
          mentionable: o.mentionable,
          colors: { primaryColor: o.colors?.primaryColor ?? 0 },
          permissions: { bitfield: BigInt(o.permissions ?? 0n) },
        }),
    },
    channels: {
      cache: channels,
      fetch: async (cid) => (cid ? channels.get(cid) ?? null : channels),
      create: async (o) => {
        channelCalls += 1;
        if (failChannelAt && channelCalls === failChannelAt) throw new Error("Discord said no");
        const voice = o.type === ChannelType.GuildVoice;
        const name = o.type === ChannelType.GuildCategory || voice ? o.name : o.name.toLowerCase().replace(/ /g, "-");
        return attach(channels, {
          id: uid(),
          name,
          type: o.type,
          parentId: o.parent ?? null,
          rawPosition: position++,
          topic: o.topic ?? null,
          nsfw: o.nsfw ?? false,
          rateLimitPerUser: o.rateLimitPerUser ?? 0,
          bitrate: o.bitrate,
          userLimit: o.userLimit,
          permissionOverwrites: toOverwrites(
            (o.permissionOverwrites ?? []).map((x) => ({ id: x.id, allow: x.allow ?? 0n, deny: x.deny ?? 0n })),
          ),
        });
      },
    },
  };
  guild.addRole = (def) => attach(roles, { id: uid(), managed: false, position: position++, hoist: false, mentionable: false, colors: { primaryColor: 0 }, ...def, permissions: { bitfield: BigInt(def.permissions ?? 0n) } });
  guild.addChannel = (def) =>
    attach(channels, {
      id: uid(),
      rawPosition: position++,
      parentId: null,
      topic: null,
      nsfw: false,
      rateLimitPerUser: 0,
      ...def,
      permissionOverwrites: toOverwrites(def.overwrites),
    });
  return guild;
}

// A small but complete server: roles, two categories, text and voice channels, role and member overwrites, a bot role
function sourceGuild() {
  const guild = fakeGuild();
  guild.addRole({ name: "Mod", color: 0xe74c3c, colors: { primaryColor: 0xe74c3c }, hoist: true, mentionable: true, permissions: P.ManageMessages | P.KickMembers });
  guild.addRole({ name: "Khách", colors: { primaryColor: 0x3498db }, permissions: P.SendMessages });
  guild.addRole({ name: "Bot Của Server", managed: true, permissions: P.Administrator });
  const mod = [...guild.roles.cache.values()].find((r) => r.name === "Mod");
  const a = guild.addChannel({ name: "Khu A", type: ChannelType.GuildCategory });
  const b = guild.addChannel({
    name: "Khu B",
    type: ChannelType.GuildCategory,
    overwrites: [{ id: guild.id, allow: 0n, deny: P.ViewChannel }],
  });
  guild.addChannel({ name: "lobby", type: ChannelType.GuildText });
  guild.addChannel({ name: "chat", type: ChannelType.GuildText, parentId: a.id, topic: "Nói chuyện", rateLimitPerUser: 5, overwrites: [{ id: mod.id, allow: P.SendMessages, deny: 0n }] });
  guild.addChannel({ name: "Phòng Họp", type: ChannelType.GuildVoice, parentId: a.id, bitrate: 64000, userLimit: 5 });
  const secret = guild.addChannel({ name: "bí-mật", type: ChannelType.GuildText, parentId: b.id, nsfw: true });
  // A member overwrite and an overwrite for a role that no longer exists: neither can be restored elsewhere
  secret.permissionOverwrites.cache.set("member1", { id: "member1", type: OverwriteType.Member, allow: { bitfield: 1n }, deny: { bitfield: 0n } });
  secret.permissionOverwrites.cache.set("gone", { id: "gone", type: OverwriteType.Role, allow: { bitfield: 1n }, deny: { bitfield: 0n } });
  return guild;
}

const jsonRoundTrip = (value) => JSON.parse(JSON.stringify(value));

// ---------------------------------------------------------------- capture

test("capture reads roles, categories, channels and role overwrites, and leaves out what cannot move", () => {
  const guild = sourceGuild();
  const snap = captureSnapshot(guild, 1234);

  assert.equal(snap.version, 1);
  assert.equal(snap.takenAt, 1234);
  assert.equal(snap.sourceGuildId, guild.id);
  assert.deepEqual(snap.roles.map((r) => r.name), ["Mod", "Khách"], "no @everyone and no managed (bot) role");
  assert.equal(snap.roles[0].permissions, String(P.ManageMessages | P.KickMembers));
  assert.equal(snap.roles[0].color, 0xe74c3c);
  assert.equal(snap.roles[0].hoist, true);
  assert.deepEqual(snap.categories.map((c) => c.name), ["Khu A", "Khu B"]);
  assert.deepEqual(snap.categories[1].overwrites, [{ role: "@everyone", allow: "0", deny: String(P.ViewChannel) }]);

  const chat = snap.channels.find((c) => c.name === "chat");
  assert.equal(chat.parent, "Khu A");
  assert.equal(chat.topic, "Nói chuyện");
  assert.equal(chat.rateLimitPerUser, 5);
  assert.deepEqual(chat.overwrites, [{ role: "Mod", allow: String(P.SendMessages), deny: "0" }]);
  const voice = snap.channels.find((c) => c.name === "Phòng Họp");
  assert.equal(voice.type, "voice");
  assert.equal(voice.bitrate, 64000);
  assert.equal(voice.userLimit, 5);
  assert.equal(snap.channels.find((c) => c.name === "lobby").parent, null);
  const secret = snap.channels.find((c) => c.name === "bí-mật");
  assert.equal(secret.nsfw, true);
  assert.deepEqual(secret.overwrites, [], "member overwrites and overwrites of missing roles are skipped");
  assert.deepEqual(snap.counts, { roles: 2, categories: 2, channels: 4 });
});

test("capture enforces the caps and the size limit", () => {
  const tooManyRoles = fakeGuild();
  for (let i = 0; i < LIMITS.roles + 1; i++) tooManyRoles.addRole({ name: `r${i}` });
  assert.throws(() => captureSnapshot(tooManyRoles), BackupError);

  const tooManyChannels = fakeGuild();
  for (let i = 0; i < LIMITS.channelsTotal + 1; i++) tooManyChannels.addChannel({ name: `c${i}`, type: ChannelType.GuildText });
  assert.throws(() => captureSnapshot(tooManyChannels), BackupError);

  // 450 channels with 100 overwrites each is well past 400 KB
  const heavy = fakeGuild();
  for (let i = 0; i < 100; i++) heavy.addRole({ name: `rôle-${"x".repeat(60)}-${i}` });
  const overwrites = [...heavy.roles.cache.values()].filter((r) => r.id !== heavy.id).map((r) => ({ id: r.id, allow: 8n, deny: 8n }));
  for (let i = 0; i < 450; i++) heavy.addChannel({ name: `c${i}`, type: ChannelType.GuildText, overwrites });
  assert.throws(() => captureSnapshot(heavy), /too large/);
  assert.throws(() => serialize({ big: "x".repeat(LIMITS.bytes + 1) }), BackupError);
});

// ---------------------------------------------------------------- validation of anything that comes from outside

test("a captured snapshot passes the strict check unchanged", () => {
  const snap = captureSnapshot(sourceGuild(), 99);
  assert.deepEqual(validateSnapshot(jsonRoundTrip(snap)), snap);
});

const good = () => jsonRoundTrip(captureSnapshot(sourceGuild(), 5));

test("hostile files are rejected, not tidied up", () => {
  const bad = (mutate) => {
    const snap = good();
    mutate(snap);
    return snap;
  };
  const cases = {
    "an array instead of an object": [],
    null: null,
    "a string": "backup",
    "another version": bad((s) => (s.version = 2)),
    "roles that are not a list": bad((s) => (s.roles = { 0: { name: "x" } })),
    "thousands of roles": bad((s) => (s.roles = Array.from({ length: 5000 }, (_, i) => ({ name: `r${i}`, color: 0, permissions: "0" })))),
    "a negative permission": bad((s) => (s.roles[0].permissions = "-5")),
    "a non-numeric permission": bad((s) => (s.roles[0].permissions = "abc")),
    "an exponent permission": bad((s) => (s.roles[0].permissions = "1e3")),
    "a permission over 64 bits": bad((s) => (s.roles[0].permissions = "18446744073709551616")),
    "a permission given as a number": bad((s) => (s.roles[0].permissions = 8)),
    "a role name that is too long": bad((s) => (s.roles[0].name = "x".repeat(101))),
    "a role name that is not text": bad((s) => (s.roles[0].name = 42)),
    "an empty role name": bad((s) => (s.roles[0].name = "   ")),
    "a color out of range": bad((s) => (s.roles[0].color = 0x1000000)),
    "a channel under a category that does not exist": bad((s) => (s.channels[0].parent = "Không có")),
    "a channel of an unknown type": bad((s) => (s.channels[0].type = "stage")),
    "more channels than Discord allows": bad((s) => (s.channels = Array.from({ length: 501 }, (_, i) => ({ name: `c${i}`, type: "text", parent: null })))),
    "more categories than Discord allows": bad((s) => (s.categories = Array.from({ length: 51 }, (_, i) => ({ name: `k${i}`, overwrites: [] })))),
    "a bitrate out of range": bad((s) => (s.channels.find((c) => c.type === "voice").bitrate = 1)),
    "a user limit out of range": bad((s) => (s.channels.find((c) => c.type === "voice").userLimit = 100)),
    "a negative slowmode": bad((s) => (s.channels.find((c) => c.type === "text").rateLimitPerUser = -1)),
    "an overwrite that is not an object": bad((s) => (s.channels[0].overwrites = ["x"])),
    "an overwrite with a bad permission": bad((s) => (s.channels[0].overwrites = [{ role: "@everyone", allow: "x", deny: "0" }])),
    "too many overwrites on one channel": bad((s) => (s.channels[0].overwrites = Array.from({ length: 101 }, () => ({ role: "@everyone", allow: "0", deny: "0" })))),
  };
  for (const [label, raw] of Object.entries(cases)) assert.throws(() => validateSnapshot(raw), BackupError, label);
});

test("validation keeps only known fields, cleans names and cannot be used to pollute prototypes", () => {
  const snap = good();
  snap.evil = "x".repeat(1_000_000);
  snap.roles[0].extra = { deep: true };
  snap.roles[0].name = "  Mo\u0000d\n ";
  snap.roles.push({ ...snap.roles[1] });
  snap.categories.push({ ...snap.categories[0] });
  const clean = validateSnapshot(snap);
  assert.equal("evil" in clean, false);
  assert.equal("extra" in clean.roles[0], false);
  assert.equal(clean.roles[0].name, "Mod");
  assert.equal(clean.roles.length, 2, "a repeated role name is dropped");
  assert.equal(clean.categories.length, 2, "a repeated category name is dropped");

  const hostile = JSON.parse(JSON.stringify(good()).replace(/^\{/, '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},'));
  validateSnapshot(hostile);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test("an overwrite for a role the snapshot does not hold is dropped, an unknown source counts as foreign", () => {
  const snap = good();
  snap.channels.find((c) => c.name === "chat").overwrites.push({ role: "Role Lạ", allow: "1", deny: "0" });
  snap.sourceGuildId = "not-a-snowflake";
  const clean = validateSnapshot(snap);
  assert.deepEqual(clean.channels.find((c) => c.name === "chat").overwrites.map((o) => o.role), ["Mod"]);
  assert.equal(clean.sourceGuildId, "");
  assert.equal(isForeign(clean, "123456789"), true);
});

test("files over 400 KB, files that are not JSON and files that are not backups are refused", () => {
  assert.throws(() => parseSnapshotFile("x".repeat(LIMITS.bytes + 1)), /too large/);
  assert.throws(() => parseSnapshotFile("{nope"), /JSON/);
  assert.throws(() => parseSnapshotFile("[]"), BackupError);
  assert.deepEqual(parseSnapshotFile(JSON.stringify(good())).counts, { roles: 2, categories: 2, channels: 4 });
});

// ---------------------------------------------------------------- planning a restore

test("planRestore separates what is missing from what exists, comparing text channel names the way Discord stores them", () => {
  const snap = good();
  snap.channels.push({ name: "Chat Chung", type: "text", parent: "Khu A", overwrites: [], nsfw: false, rateLimitPerUser: 0 });
  const clean = validateSnapshot(snap);
  const existing = {
    roles: ["Mod"],
    categories: ["Khu A"],
    channels: [
      { type: "text", parent: "Khu A", name: "chat" },
      { type: "text", parent: "Khu A", name: "chat-chung" },
      { type: "voice", parent: "Khu B", name: "Phòng Họp" },
    ],
  };
  const plan = planRestore(clean, existing);
  assert.deepEqual(plan.roles.missing.map((r) => r.name), ["Khách"]);
  assert.deepEqual(plan.roles.present.map((r) => r.name), ["Mod"]);
  assert.deepEqual(plan.categories.missing.map((c) => c.name), ["Khu B"]);
  assert.deepEqual(plan.channels.present.map((c) => c.name).sort(), ["Chat Chung", "chat"].sort());
  // "Phòng Họp" exists only under another category, so it is still missing here
  assert.deepEqual(plan.channels.missing.map((c) => c.name).sort(), ["Phòng Họp", "bí-mật", "lobby"].sort());
  assert.equal(plan.nothingToDo, false);
  assert.equal(planRestore(clean, describeExisting(sourceGuild())).nothingToDo, false, "a server with different content still has work to do");
});

test("restoring into the server a snapshot came from has nothing to do", () => {
  const guild = sourceGuild();
  const snap = validateSnapshot(jsonRoundTrip(captureSnapshot(guild)));
  assert.equal(planRestore(snap, describeExisting(guild)).nothingToDo, true);
});

// ---------------------------------------------------------------- restoring

test("restore creates only what is missing, records every ID, changes nothing that exists and is safe to repeat", async () => {
  const snap = validateSnapshot(jsonRoundTrip(captureSnapshot(sourceGuild())));
  const target = fakeGuild();
  // The target already has the Mod role (with different permissions), Khu A and an unrelated channel inside it
  const existingMod = target.addRole({ name: "Mod", permissions: P.ManageNicknames });
  const khuA = target.addChannel({ name: "Khu A", type: ChannelType.GuildCategory });
  const keep = target.addChannel({ name: "giữ-lại", type: ChannelType.GuildText, parentId: khuA.id });
  const rolesBefore = target.roles.cache.size;

  const result = await restoreSnapshot(target, snap);
  assert.deepEqual(result.created, { roles: 1, categories: 1, channels: 4 });
  assert.deepEqual(result.present, { roles: 1, categories: 1, channels: 0 });
  assert.equal(target.roles.cache.size, rolesBefore + 1);
  assert.equal(target.roles.cache.get(existingMod.id).permissions.bitfield, BigInt(P.ManageNicknames), "an existing role is never edited");
  assert.ok(target.channels.cache.get(keep.id), "nothing is deleted");

  const record = loadRecord(target.id);
  assert.equal(record.roles.length, 1);
  assert.equal(record.categories.length, 1);
  assert.equal(record.channels.length, 4);
  assert.ok(!record.channels.includes(keep.id) && !record.categories.includes(khuA.id), "only what the bot made is recorded");

  const parents = Object.fromEntries([...target.channels.cache.values()].map((c) => [c.name, target.channels.cache.get(c.parentId)?.name ?? null]));
  assert.equal(parents.chat, "Khu A");
  assert.equal(parents["bí-mật"], "Khu B");
  assert.equal(parents.lobby, null);

  const again = await restoreSnapshot(target, snap);
  assert.deepEqual(again.created, { roles: 0, categories: 0, channels: 0 });
  assert.deepEqual(loadRecord(target.id), record, "a second run records nothing new");
});

test("a snapshot restored into an empty server captures back to the same structure", async () => {
  const source = sourceGuild();
  const target = fakeGuild();
  // Taken "here": a snapshot from another server would have its sensitive permissions stripped, which is tested separately
  const snap = validateSnapshot({ ...jsonRoundTrip(captureSnapshot(source)), sourceGuildId: target.id });
  await restoreSnapshot(target, snap);
  const again = captureSnapshot(target);
  const strip = (s) => ({ ...s, takenAt: 0, sourceGuildId: "" });
  assert.deepEqual(strip(again), strip(snap));
});

test("restore never grants Administrator, and strips sensitive permissions from a file that came from another server", async () => {
  const dangerous = P.Administrator | P.ManageGuild | P.ManageRoles | P.ManageChannels | P.ManageWebhooks | P.BanMembers | P.KickMembers | P.MentionEveryone;
  const raw = good();
  raw.roles = [{ name: "Quyền Lực", color: 1, hoist: false, mentionable: false, permissions: String(dangerous | P.SendMessages) }];
  raw.channels.find((c) => c.name === "chat").overwrites = [
    { role: "Quyền Lực", allow: String(P.ManageChannels | P.ManageRoles | P.ManageWebhooks | P.MentionEveryone | P.SendMessages), deny: "0" },
  ];

  // Same server: only Administrator is held back
  const home = fakeGuild();
  raw.sourceGuildId = home.id;
  await restoreSnapshot(home, validateSnapshot(raw));
  const homeRole = [...home.roles.cache.values()].find((r) => r.name === "Quyền Lực");
  assert.equal(homeRole.permissions.bitfield & BigInt(P.Administrator), 0n);
  assert.equal(homeRole.permissions.bitfield, BigInt(dangerous | P.SendMessages) & ~BigInt(P.Administrator));
  const homeChat = [...home.channels.cache.values()].find((c) => c.name === "chat");
  assert.equal([...homeChat.permissionOverwrites.cache.values()][0].allow.bitfield, BigInt(P.ManageChannels | P.ManageRoles | P.ManageWebhooks | P.MentionEveryone | P.SendMessages));

  // Another server: the sensitive bits go too, ordinary ones stay
  const away = fakeGuild();
  raw.sourceGuildId = "123456789012345678";
  await restoreSnapshot(away, validateSnapshot(raw));
  const awayRole = [...away.roles.cache.values()].find((r) => r.name === "Quyền Lực");
  assert.equal(awayRole.permissions.bitfield, BigInt(P.SendMessages));
  const awayChat = [...away.channels.cache.values()].find((c) => c.name === "chat");
  assert.equal([...awayChat.permissionOverwrites.cache.values()][0].allow.bitfield, BigInt(P.SendMessages));

  // The bit helpers on their own
  assert.equal(rolePermissions(String(P.Administrator), false), 0n);
  assert.equal(overwritePermissions(String(P.ManageChannels), true), 0n);
  assert.equal(overwritePermissions(String(P.ManageChannels), false), BigInt(P.ManageChannels));
});

test("the confirmation says what will be created and which permissions are held back", () => {
  const snap = validateSnapshot(good());
  const plan = planRestore(snap, { roles: [], categories: [], channels: [] });
  const foreign = restoreSummary("Bản A", plan, true);
  assert.match(foreign, /Role sẽ tạo/);
  assert.match(foreign, /Mod/);
  assert.match(foreign, /Administrator/);
  assert.match(foreign, /server khác/);
  assert.doesNotMatch(restoreSummary("Bản A", plan, false), /server khác/);
});

test("a restore that crashes halfway still records what it created, and nuke can clean it up", async () => {
  const snap = validateSnapshot(jsonRoundTrip(captureSnapshot(sourceGuild())));
  const target = fakeGuild({ failChannelAt: 4 });
  await assert.rejects(restoreSnapshot(target, snap), /Discord said no/);

  const record = loadRecord(target.id);
  assert.equal(record.roles.length, 2, "both roles were made before the failure");
  assert.equal(record.categories.length + record.channels.length, 3, "everything made before the failing call is recorded");

  const removed = await nukeServer(target);
  assert.equal(removed, 5);
  assert.equal([...target.roles.cache.values()].filter((r) => r.id !== target.id).length, 0);
  assert.equal(target.channels.cache.size, 0);
});

// ---------------------------------------------------------------- storage and plan limits

test("backups are stored per server with unique names, limited by the plan", () => {
  const guild = newGuildId();
  const snap = good();
  assert.match(gateLimit(guild, "backups", countBackups(guild), "bản sao lưu"), /Pro/, "a free server has no backups");

  grant(guild, "pro", 30);
  for (const name of ["Một", "Hai", "Ba"]) {
    assert.equal(gateLimit(guild, "backups", countBackups(guild), "bản sao lưu"), null);
    saveBackup(guild, name, snap);
  }
  assert.match(gateLimit(guild, "backups", countBackups(guild), "bản sao lưu"), /3/, "the Pro plan keeps three");
  assert.throws(() => saveBackup(guild, "một", snap), BackupError, "a name in use is refused whatever its case");
  assert.equal(hasBackup(guild, "HAI"), true);

  assert.deepEqual(listBackups(guild).map((b) => b.name).sort(), ["Ba", "Hai", "Một"]);
  assert.deepEqual(listBackups(guild)[0].counts, snap.counts);
  assert.deepEqual(getBackup(guild, "hai").snapshot, validateSnapshot(snap));
  assert.equal(getBackup(newGuildId(), "Hai"), null, "another server cannot read it");
  assert.equal(deleteBackup(guild, getBackup(guild, "Hai").id), 1);
  assert.equal(countBackups(guild), 2);
  assert.equal(gateLimit(guild, "backups", countBackups(guild), "bản sao lưu"), null);

  grant(guild, "plus", 30);
  assert.equal(gateLimit(guild, "backups", 9, "bản sao lưu"), null, "Plus keeps ten");
  assert.match(gateLimit(guild, "backups", 10, "bản sao lưu"), /10/);
});

test("backup names are 1 to 40 characters", () => {
  assert.equal(normalizeName("  Hai   từ  "), "Hai từ");
  assert.equal(normalizeName(""), null);
  assert.equal(normalizeName("   "), null);
  assert.equal(normalizeName("x".repeat(41)), null);
  assert.equal(normalizeName("x".repeat(40)), "x".repeat(40));
});

// ---------------------------------------------------------------- reading uploaded files

test("uploaded files are only read from Discord's hosts, within the size cap", async () => {
  const file = (over = {}) => ({ size: 100, name: "b.json", url: "https://cdn.discordapp.com/attachments/1/2/b.json", ...over });
  const okFetch = async (url, options) => {
    assert.equal(options.redirect, "error", "a redirect to another host is never followed");
    return { ok: true, arrayBuffer: async () => Buffer.from("{}") };
  };
  assert.equal(await readAttachmentText(file(), 1000, okFetch), "{}");
  for (const [label, attachment] of Object.entries({
    "a missing file": null,
    "a file that is too big": file({ size: 2000 }),
    "a file that is not .json": file({ name: "b.exe" }),
    "a host that is not Discord": file({ url: "https://evil.example.com/b.json" }),
    "a look-alike host": file({ url: "https://cdn.discordapp.com.evil.example/b.json" }),
    "plain http": file({ url: "http://cdn.discordapp.com/b.json" }),
    "a broken address": file({ url: "not a url" }),
  })) {
    await assert.rejects(readAttachmentText(attachment, 1000, okFetch), AttachmentError, label);
  }
  const liar = async () => ({ ok: true, arrayBuffer: async () => Buffer.alloc(2000) });
  await assert.rejects(readAttachmentText(file({ size: 100 }), 1000, liar), /too large/, "the real bytes are measured, not only the claimed size");
  await assert.rejects(readAttachmentText(file(), 1000, async () => ({ ok: false })), AttachmentError);
  await assert.rejects(readAttachmentText(file(), 1000, async () => { throw new Error("network"); }), AttachmentError);
});

// ---------------------------------------------------------------- commands

const optionNames = (json) => json.options.flatMap((o) => [o.name, ...(o.options ?? []).map((x) => x.name)]);

test("both command definitions are valid for Discord", () => {
  for (const command of [backupCommand, themeCommand]) {
    const json = command.data.toJSON();
    assert.ok(json.description.length <= 100);
    assert.equal(typeof command.execute, "function");
    assert.equal(typeof command.autocomplete, "function");
    assert.equal(typeof command.handleComponent, "function");
    assert.ok(json.options.length >= 5 && json.options.length <= 25);
    for (const sub of json.options) {
      assert.equal(sub.type, 1, "every top-level option is a subcommand");
      assert.ok(sub.description.length >= 1 && sub.description.length <= 100, sub.name);
    }
    for (const name of optionNames(json)) assert.match(name, /^[a-z0-9_-]{1,32}$/, `${name} must be lowercase and unaccented`);
  }
  assert.deepEqual(backupCommand.data.toJSON().options.map((o) => o.name), ["tao", "danhsach", "khoiphuc", "xoa", "xuat", "nhap"]);
  assert.deepEqual(themeCommand.data.toJSON().options.map((o) => o.name), ["danhsach", "dung", "xoa", "xuat", "nhap"]);
});

function fakeInteraction({ guild, userId = "admin1", admin = true, sub, strings = {}, attachment = null, focused = "" }) {
  const sent = { replies: [], updates: [], edits: [], deferred: 0, responds: null };
  return {
    sent,
    guild,
    guildId: guild.id,
    user: { id: userId },
    member: { permissions: { has: () => admin } },
    options: {
      getSubcommand: () => sub,
      getString: (key) => strings[key] ?? null,
      getAttachment: () => attachment,
      getFocused: () => focused,
    },
    reply: async (payload) => sent.replies.push(payload),
    update: async (payload) => sent.updates.push(payload),
    deferReply: async () => void (sent.deferred += 1),
    editReply: async (payload) => sent.edits.push(typeof payload === "string" ? { content: payload } : payload),
    respond: async (choices) => (sent.responds = choices),
  };
}

const buttonIds = (payload) => payload.components.flatMap((row) => row.toJSON().components.map((c) => c.custom_id));

test("/backup tao, danhsach, xuat and the restore confirmation work end to end on a fake server", async () => {
  const guild = sourceGuild();
  grant(guild.id, "pro", 30);

  const made = fakeInteraction({ guild, sub: "tao", strings: { ten: "Thứ Sáu" } });
  await backupCommand.execute(made);
  assert.equal(made.sent.deferred, 1);
  assert.match(made.sent.edits[0].content, /Thứ Sáu/);
  assert.equal(countBackups(guild.id), 1);

  const dup = fakeInteraction({ guild, sub: "tao", strings: { ten: "thứ sáu" } });
  await backupCommand.execute(dup);
  assert.match(dup.sent.replies[0].content, /có bản sao lưu rồi/);

  const listed = fakeInteraction({ guild, sub: "danhsach" });
  await backupCommand.execute(listed);
  assert.match(listed.sent.replies[0].embeds[0].toJSON().description, /Thứ Sáu/);

  const exported = fakeInteraction({ guild, sub: "xuat", strings: { ten: "Thứ Sáu" } });
  await backupCommand.execute(exported);
  const file = exported.sent.replies[0].files[0];
  assert.match(file.name, /^thau-backup-Thu-Sau\.json$/);
  assert.deepEqual(parseSnapshotFile(file.attachment.toString()).counts, { roles: 2, categories: 2, channels: 4 });

  const auto = fakeInteraction({ guild, sub: "khoiphuc", focused: "thứ" });
  await backupCommand.autocomplete(auto);
  assert.deepEqual(auto.sent.responds, [{ name: "Thứ Sáu", value: "Thứ Sáu" }]);

  const nothing = fakeInteraction({ guild, sub: "khoiphuc", strings: { ten: "Thứ Sáu" } });
  await backupCommand.execute(nothing);
  assert.match(nothing.sent.replies[0].content, /đều đã có/, "the server it came from has nothing missing");

  // A server with nothing in it gets a confirmation that shows what will be created
  const empty = fakeGuild();
  grant(empty.id, "pro", 30);
  saveBackup(empty.id, "Nhập", jsonRoundTrip(captureSnapshot(guild)));
  const ask = fakeInteraction({ guild: empty, sub: "khoiphuc", strings: { ten: "Nhập" } });
  await backupCommand.execute(ask);
  const confirmation = ask.sent.replies[0];
  assert.match(confirmation.embeds[0].toJSON().description, /Role sẽ tạo/);
  assert.match(confirmation.embeds[0].toJSON().description, /server khác/, "an imported file is called out");
  const ids = buttonIds(confirmation);
  assert.ok(ids.some((i) => i.startsWith("backup:rs:admin1:")) && ids.some((i) => i.startsWith("backup:no:admin1:")));

  // Pressing it by someone else does nothing, pressing it as the admin restores
  const stranger = fakeInteraction({ guild: empty, userId: "other" });
  await backupCommand.handleComponent(stranger, ids.find((i) => i.includes(":rs:")).split(":").slice(1));
  assert.match(stranger.sent.replies[0].content, /không phải của bạn|cũ rồi/);
  assert.equal(empty.roles.cache.size, 1);

  const press = fakeInteraction({ guild: empty });
  await backupCommand.handleComponent(press, ids.find((i) => i.includes(":rs:")).split(":").slice(1));
  assert.match(press.sent.edits.at(-1).content, /Khôi phục xong: thêm 2 role, 2 danh mục, 4 kênh/);
  assert.equal(empty.channels.cache.size, 6);
});

test("backup commands refuse non-admins, free servers and bad files", async () => {
  const guild = fakeGuild();
  const plain = fakeInteraction({ guild, admin: false, sub: "danhsach" });
  await backupCommand.execute(plain);
  assert.equal(plain.sent.replies.length, 1);

  const free = fakeInteraction({ guild, sub: "tao", strings: { ten: "Thử" } });
  await backupCommand.execute(free);
  assert.match(free.sent.replies[0].content, /Pro/);

  grant(guild.id, "pro", 30);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => Buffer.from('{"hello":"world"}') });
    const notBackup = fakeInteraction({
      guild,
      sub: "nhap",
      strings: { ten: "Lạ" },
      attachment: { size: 20, name: "x.json", url: "https://cdn.discordapp.com/a/b/x.json" },
    });
    await backupCommand.execute(notBackup);
    assert.match(notBackup.sent.edits[0].content, /không phải bản sao lưu hợp lệ/);

    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(good())) });
    const fine = fakeInteraction({ guild, sub: "nhap", strings: { ten: "Từ bạn" }, attachment: { size: 20, name: "x.json", url: "https://cdn.discordapp.com/a/b/x.json" } });
    await backupCommand.execute(fine);
    assert.match(fine.sent.edits[0].content, /Đã nhập bản sao lưu \*\*Từ bạn\*\*/);

    const wrongHost = fakeInteraction({ guild, sub: "nhap", strings: { ten: "Xấu" }, attachment: { size: 20, name: "x.json", url: "https://evil.example.com/x.json" } });
    await backupCommand.execute(wrongHost);
    assert.match(wrongHost.sent.edits[0].content, /không đọc được/);
  } finally {
    globalThis.fetch = original;
  }

  const del = fakeInteraction({ guild, sub: "xoa", strings: { ten: "Từ bạn" } });
  await backupCommand.execute(del);
  const ids = buttonIds(del.sent.replies[0]);
  const confirm = fakeInteraction({ guild });
  await backupCommand.handleComponent(confirm, ids.find((i) => i.includes(":del:")).split(":").slice(1));
  assert.match(confirm.sent.updates[0].content, /Đã xoá/);
  assert.equal(hasBackup(guild.id, "Từ bạn"), false);

  const cancel = fakeInteraction({ guild });
  await backupCommand.handleComponent(cancel, ["no", "admin1", "1"]);
  assert.match(cancel.sent.updates[0].content, /huỷ/);
});
